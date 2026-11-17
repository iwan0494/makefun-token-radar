// The comps engine: the market's own price for a dollar of TVL, fitted from the snapshot's traded tokens.
//
// A pre-token protocol's token does not exist, so the only price it can carry is the one the market
// already pays protocols like it. This file estimates that price from the tokens the snapshot records,
// and nothing else: no protocol name, slug or symbol is special-cased anywhere.
//
// The target is the cover ratio r = market cap / TVL. Its log is fitted, mostly by robust Huber least
// squares, as
//
//   log r = a + b log(TVL)                      the line: smaller TVLs carry richer covers
//         + tilt(category) + tilt(family)       a category's own mean residual, shrunk by n/(n+prior)
//         + growth.level + growth.slope x g     g = change_7d per cent in [-1, 1]
//         + hold.a + hold.b log(1 + age)        age: the record a protocol has built since its listing day
//
// The model prices three states of the same protocol with those terms: one with a record (its age,
// as the snapshot reads it), one that lists today (age 0), and one that lists after a wait W (age 0
// plus what the wait itself says). The wait's own part is the "follow" term, and it is estimated
// honestly: the comps are split by their listing day into a fit half and a test half, and a follow
// curve is fitted on the test half's later record, so a state the model has never seen — a protocol
// that has not launched yet — is read from tokens that were also young when the model last saw them.
//
// The growth term is a pooled least square rather than a Huber line: with around eighty comps and
// a handful of five-day readings, one robust line on growth would reweight most of the pool.

import type { Comp, Comps, Line, PoolCount, Protocol, Tilt } from './types.ts';

export const DAY_MS = 86_400_000;
export const DAYS_PER_YEAR = 365.25;
export const TVL_FLOOR_USD = 5_000_000;
export const TVL_CEIL_USD = 1_000_000_000_000;
export const RATIO_CEIL = 10;
export const RATIO_FLOOR = 1e-4;
export const HUBER_K = 1.345;
export const CATEGORY_PRIOR = 3;
export const FAMILY_PRIOR = 6;
export const TILT_MIN_N = 3;
export const GROWTH_CLIP = 1;
export const WEIGHT_HALF_TVL = 50_000_000;
/** How far the line may bend, in logs: a pool that small is read conservatively. */
export const LINE_BEND_LO = -2;
export const LINE_BEND_HI = 0.5;
/** The follow curve is fitted on pairs that are at least this far apart, in years. */
export const FOLLOW_MIN_GAP = 0.5;

export const log = Math.log;
export const exp = Math.exp;

export function clip(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((p, q2) => p - q2);
  const at = clip(q, 0, 1) * (s.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return s[lo]! + (s[hi]! - s[lo]!) * (at - lo);
}

/** The median absolute deviation, scaled to read as a standard deviation would. */
export function robustScale(xs: number[]): number {
  const m = median(xs);
  return 1.4826 * median(xs.map((x) => Math.abs(x - m)));
}

/** Days between two UTC days, or null when either is absent. */
export function daysBetween(from: string | null, to: string): number | null {
  if (from === null) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (b - a) / DAY_MS;
}

/** Years between two UTC days, or null. */
export function yearsBetween(from: string | null, to: string): number | null {
  const days = daysBetween(from, to);
  return days === null ? null : days / DAYS_PER_YEAR;
}

/** A protocol records a token when the snapshot carries either of its token identifiers. */
export function recordsToken(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** A protocol's family: the first word of its category, lower case. Null when it names none. */
export function familyOf(p: Protocol): string | null {
  const c = p.category;
  if (c === null || c.trim() === '') return null;
  return c.trim().split(/\s+/)[0]!.toLowerCase();
}

/** The cover ratio a traded token records: market cap per dollar of TVL, or null. */
export function coverRatio(p: Protocol): number | null {
  if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) return null;
  return p.mcap_usd / p.tvl_usd;
}

/** The seven-day change as a growth regressor: per cent over 100, held inside one whole point. */
export function growthRegressor(pct: number | null): number {
  return pct === null ? 0 : clip(pct / 100, -GROWTH_CLIP, GROWTH_CLIP);
}

/** The hold regressor: log of one plus the protocol's age in years. */
export function holdRegressor(ageYears: number): number {
  return log(1 + Math.max(0, ageYears));
}

/** A comp's record with one feature swapped, for reading a state: a listing day, an age, a growth. */
export type CompLike = Pick<Comp, 'tvl_usd' | 'category' | 'family' | 'age_years' | 'growth_pct'>;

/** The comps pool: every traded token with a cover ratio, a listing day and at least one year behind it. */
export function compPool(protocols: Protocol[], asOf: string): { comps: Comp[]; count: PoolCount } {
  const traded = protocols.filter(recordsToken);
  const withMcap = traded.filter((p) => coverRatio(p) !== null);
  const comps: Comp[] = [];
  let nearListing = 0;
  for (const p of withMcap) {
    const ratio = coverRatio(p)!;
    if (ratio > RATIO_CEIL || ratio < RATIO_FLOOR) continue;
    const age = yearsBetween(p.listed_at, asOf);
    if (age === null || age < 1) {
      nearListing += 1;
      continue;
    }
    const tvl = clip(p.tvl_usd, TVL_FLOOR_USD, TVL_CEIL_USD);
    comps.push({
      slug: p.slug,
      category: p.category,
      family: familyOf(p),
      tvl_usd: p.tvl_usd,
      ratio_log: log(ratio),
      growth_pct: p.change_7d,
      age_years: age,
      growth_listed: p.listed_at,
      listed_ms: Date.parse(`${p.listed_at}T00:00:00Z`),
      weight: Math.sqrt(Math.min(1, tvl / WEIGHT_HALF_TVL)),
    });
  }
  return { comps, count: { traded: traded.length, with_mcap: withMcap.length, near_listing: nearListing, comps: comps.length } };
}

/** The growth term a record carries. */
export function growthTerm(pct: number | null, level: number, slope: number): number {
  return pct === null ? 0 : level + slope * growthRegressor(pct);
}

/** The hold term at an age. */
export function holdTerm(hold: Comps['hold'], ageYears: number): number {
  return hold.a + hold.b * holdRegressor(ageYears);
}

/** The hold term's direction at an age: the slope of the curve there, non-proportional to one plus age. */
export function holdRate(ageYears: number): number {
  return 1 / (1 + Math.max(0, ageYears));
}

/** Where the follow curve sits at an age: zero at the follow split's own youngest age, rising after it. */
export function followAt(follow: Comps['follow'], ageYears: number): number {
  return follow.a + follow.b * Math.max(0, ageYears - follow.from_years);
}

/** A Huber line: weighted least squares with Huber weights re-drawn until the line stops moving. */
export function huberLine(xs: number[], ys: number[], ws: number[], lo: number, hi: number): Line {
  const n = xs.length;
  let robust = new Array<number>(n).fill(1);
  let a = median(ys);
  let b = 0;
  for (let round = 0; round < 100; round += 1) {
    let sw = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < n; i += 1) {
      const w = ws[i]! * robust[i]!;
      sw += w;
      sx += w * xs[i]!;
      sy += w * ys[i]!;
      sxx += w * xs[i]! * xs[i]!;
      sxy += w * xs[i]! * ys[i]!;
    }
    const mx = sx / sw;
    const my = sy / sw;
    const varX = sxx / sw - mx * mx;
    const cov = sxy / sw - mx * my;
    const nextB = clip(varX > 1e-12 ? cov / varX : 0, lo, hi);
    const nextA = my - nextB * mx;
    const scale = Math.max(1e-6, robustScale(ys.map((y, i) => y - nextA - nextB * xs[i]!)));
    robust = ys.map((y, i) => {
      const t = Math.abs(y - nextA - nextB * xs[i]!) / (HUBER_K * scale);
      return t <= 1 ? 1 : 1 / t;
    });
    const moved = Math.abs(nextA - a) + Math.abs(nextB - b);
    a = nextA;
    b = nextB;
    if (moved < 1e-10) break;
  }
  const pinned = b <= lo + 1e-12 && Number.isFinite(lo) ? 'lo' : b >= hi - 1e-12 && Number.isFinite(hi) ? 'hi' : 'free';
  return { a, b, lo, hi, pinned, n };
}

/** A pooled weighted least square with no intercept: the slope of ys on one regressor. */
export function pooledSlope(xs: number[], ys: number[], ws: number[]): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i += 1) {
    num += ws[i]! * xs[i]! * ys[i]!;
    den += ws[i]! * xs[i]! * xs[i]!;
  }
  return den > 1e-12 ? num / den : 0;
}

/** Group means of a residual, shrunk toward 0 by n / (n + prior); groups under TILT_MIN_N are dropped. */
export function tiltsOf(keys: Array<string | null>, residuals: number[], prior: number): Tilt[] {
  const sums = new Map<string, { total: number; n: number }>();
  keys.forEach((key, i) => {
    if (key === null) return;
    const at = sums.get(key) ?? { total: 0, n: 0 };
    at.total += residuals[i]!;
    at.n += 1;
    sums.set(key, at);
  });
  return [...sums.entries()]
    .filter(([, at]) => at.n >= TILT_MIN_N)
    .map(([key, at]) => ({ key, n: at.n, raw: at.total / at.n, value: (at.total / at.n) * (at.n / (at.n + prior)) }))
    .sort((p, q) => q.n - p.n || (p.key < q.key ? -1 : 1));
}

/** A tilt's value by key, or zero. */
export function tiltValue(list: Tilt[], key: string | null): number {
  if (key === null) return 0;
  return list.find((t) => t.key === key)?.value ?? 0;
}

export interface Fit {
  line: Line;
  category: Tilt[];
  family: Tilt[];
  growth: { level: number; slope: number; n: number };
  hold: { a: number; b: number; lo: number; hi: number };
}

/** The line, the tilts, the growth term and the hold term, on one pool of comps. */
export function fitTerms(comps: Comp[], bounds: { lo: number; hi: number } = { lo: LINE_BEND_LO, hi: LINE_BEND_HI }): Fit {
  const x = comps.map((c) => log(clip(c.tvl_usd, TVL_FLOOR_USD, TVL_CEIL_USD)));
  const y = comps.map((c) => c.ratio_log);
  const ws = comps.map((c) => c.weight);
  const line = huberLine(x, y, ws, bounds.lo, bounds.hi);
  const lineResidual = y.map((v, i) => v - line.a - line.b * x[i]!);
  const category = tiltsOf(comps.map((c) => c.category), lineResidual, CATEGORY_PRIOR);
  const familyResidual = lineResidual.map((r, i) => r - tiltValue(category, comps[i]!.category));
  const family = tiltsOf(comps.map((c) => c.family), familyResidual, FAMILY_PRIOR);
  const afterTilts = familyResidual.map((r, i) => r - tiltValue(family, comps[i]!.family));
  const gx: number[] = [];
  const gy: number[] = [];
  const gw: number[] = [];
  comps.forEach((c, i) => {
    if (c.growth_pct === null) return;
    gx.push(growthRegressor(c.growth_pct));
    gy.push(afterTilts[i]!);
    gw.push(ws[i]!);
  });
  const wsum = Math.max(1e-9, gw.reduce((acc, w) => acc + w, 0));
  const level = gy.reduce((acc, v, i) => acc + gw[i]! * v, 0) / wsum;
  const slope = pooledSlope(gx, gy.map((v) => v - level), gw);
  const afterGrowth = comps.map((c, i) => afterTilts[i]! - growthTerm(c.growth_pct, level, slope));
  const hold = huberLine(comps.map((c) => holdRegressor(c.age_years)), afterGrowth, ws, 0, 3);
  return { line, category, family, growth: { level, slope, n: gy.length }, hold: { a: hold.a, b: hold.b, lo: hold.lo, hi: hold.hi } };
}

/** One comp's ratio under a fit, at one state of its record. */
export function ratioUnder(fit: Fit, c: CompLike): number {
  return exp(
    fit.line.a + fit.line.b * log(clip(c.tvl_usd, TVL_FLOOR_USD, TVL_CEIL_USD))
    + tiltValue(fit.category, c.category) + tiltValue(fit.family, c.family)
    + growthTerm(c.growth_pct, fit.growth.level, fit.growth.slope)
    + holdTerm(fit.hold, c.age_years),
  );
}

/** One comp's ratio under a fit whose line is held to other bounds, at one state of its record. */
export function ratioUnderAt(fit: Fit, c: CompLike, bounds: { lo: number; hi: number }): number {
  const b = clip(fit.line.b, bounds.lo, bounds.hi);
  return exp(
    fit.line.a + b * log(clip(c.tvl_usd, TVL_FLOOR_USD, TVL_CEIL_USD))
    + tiltValue(fit.category, c.category) + tiltValue(fit.family, c.family)
    + growthTerm(c.growth_pct, fit.growth.level, fit.growth.slope)
    + holdTerm(fit.hold, c.age_years),
  );
}

/** The residual a fit leaves on a comp at its own record. */
export function residualOf(fit: Fit, c: Comp): number {
  return c.ratio_log - log(ratioUnder(fit, c));
}

/**
 * The follow curve: what a record adds after its listing day, estimated on tokens the early fit has
 * seen only young. The comps are split by listing day; the early half is fitted as a whole, and each
 * late token is read by that fit at the age it had when the split fell (one year at most), against the
 * cover it carries today. The gap is a hold line on the whole age; minus the early fit's own hold line,
 * it is what the wait itself adds, and it is zero at the split and grows with the wait after it.
 */
export function fitFollow(comps: Comp[], early: Fit, asOf: string, bounds: { lo: number; hi: number }): { a: number; b: number; n: number; split: string; from: number } {
  const sorted = comps.map((c) => c.listed_ms).sort((p, q) => p - q);
  const splitMs = sorted[Math.floor(sorted.length * 0.6)]!;
  const split = new Date(splitMs).toISOString().slice(0, 10);
  const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
  const from = (asOfMs - splitMs) / (DAY_MS * DAYS_PER_YEAR);
  const test = comps.filter((c) => c.listed_ms >= splitMs && c.age_years >= 2);
  if (test.length < 8) return { a: 0, b: 0, n: test.length, split, from };
  const xs: number[] = [];
  const ys: number[] = [];
  const ws: number[] = [];
  for (const c of test) {
    // The early fit has seen this token only as a listing: read it at the listing age and let the
    // record since then be the target's difference.
    const read = ratioUnderAt(early, { ...c, age_years: 0 }, bounds);
    xs.push(Math.max(0, c.age_years - from));
    ys.push(c.ratio_log - log(read) - early.hold.a);
    ws.push(c.weight);
  }
  const line = huberLine(xs, ys, ws, 0, 1);
  return { a: line.a, b: line.b, n: test.length, split, from };
}

/** Fit every term of the radar on one pool of comps. */
export function fitComps(protocols: Protocol[], asOf: string, bounds: { lo: number; hi: number } = { lo: LINE_BEND_LO, hi: LINE_BEND_HI }): Comps {
  const { comps, count } = compPool(protocols, asOf);
  if (comps.length < 20) throw new Error(`the comps pool holds ${comps.length} tokens, too few to price a board`);
  const fit = fitTerms(comps, bounds);
  const residuals = comps.map((c) => c.ratio_log - log(ratioUnderAt(fit, c, bounds)));
  const follow = fitFollow(comps, fit, asOf, bounds);
  return {
    as_of: asOf,
    pool: count,
    line: fit.line,
    category: fit.category,
    family: fit.family,
    growth: fit.growth,
    hold: fit.hold,
    follow: { a: follow.a, b: follow.b, from_years: follow.from },
    scale: robustScale(residuals),
    cover: {
      n: comps.length,
      p10: exp(quantile(comps.map((c) => c.ratio_log), 0.1)),
      p50: exp(quantile(comps.map((c) => c.ratio_log), 0.5)),
      p90: exp(quantile(comps.map((c) => c.ratio_log), 0.9)),
    },
    fit_mean_log: median(residuals),
    follow_from: follow.split,
    follow_n: follow.n,
  };
}
