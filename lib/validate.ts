// The fit's out-of-sample record, the honest way this snapshot allows it.
//
// The snapshot is one day: nothing in it says what a protocol's token became after that day, so the test
// is not "predict the future" but "price a record from evidence that excludes it".
//
//   record       every comp priced as its own record stands, by this model used on the other comps, as a
//                listing of its day: the honest leave-one-out miss for the board's question.
//   launch       every comp priced as a listing of its own day (age 0, no growth) by the current fit: the
//                launch premium the young comps show, and how far a launch reading sits above the record.
//   later        the comps split by listing day: the fit used the early comps, the late comps are read as
//                listings of the split day, and the miss is against the cover those tokens record today.
//   ablation     every term removed in turn: what the record and launch misses are without it.
//   rank         Spearman's rank correlation between what the model says and what the tokens record.

import { compPool, fitTerms, holdTerm, log, median, ratioUnder, ratioUnderAt, tiltValue, TVL_CEIL_USD, TVL_FLOOR_USD, clip, type Comp, type Fit } from './comps.ts';
import type { Comps, Snapshot } from './types.ts';

export type Term = 'line' | 'category' | 'growth' | 'hold';

export interface Misses {
  n: number;
  bias: number;
  mad: number;
  p10: number;
  p90: number;
  within2x: number;
}

export interface Ablation {
  term: Term;
  label: string;
  what: string;
  record_mad: number;
  delta_record: number;
  launch_mad: number;
  delta_launch: number;
}

export interface Validation {
  record: Misses;
  launch: Misses;
  rank_corr: number;
  later: Array<{ from: string; n: number; corr: number; misses: Misses }>;
  ablations: Ablation[];
  coverage: { watchlist: number; comps: number };
}

const BOUNDS = { lo: -2, hi: 0.5 };

/** A quantile of a weighted sample: the weight is read as repetition, so a deep protocol counts more. */
export function weightedQuantile(values: number[], weights: number[], q: number): number {
  const pairs = values.map((v, i) => ({ v, w: Math.max(1, Math.round(weights[i]! * 40)) })).sort((p, r) => p.v - r.v);
  const total = pairs.reduce((a, p) => a + p.w, 0);
  let seen = 0;
  for (const p of pairs) {
    seen += p.w;
    if (seen >= q * total) return p.v;
  }
  return pairs.at(-1)?.v ?? 0;
}

function missesOf(errors: number[], weights: number[]): Misses {
  if (errors.length === 0) return { n: 0, bias: 0, mad: 0, p10: 0, p90: 0, within2x: 0 };
  const bias = weightedQuantile(errors, weights, 0.5);
  const dev = errors.map((e) => Math.abs(e - bias));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const inside = errors.reduce((a, e, i) => a + (Math.abs(e) < Math.LN2 ? weights[i]! : 0), 0) / wsum;
  return { n: errors.length, bias, mad: 1.4826 * weightedQuantile(dev, weights, 0.5), p10: weightedQuantile(errors, weights, 0.1), p90: weightedQuantile(errors, weights, 0.9), within2x: inside };
}

/** Spearman's rank correlation, ties averaged. */
export function spearman(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ranks = (xs: number[]): number[] => {
    const order = xs.slice(0, n).map((x, i) => [x, i] as [number, number]).sort((p, q) => p[0] - q[0]);
    const out = new Array<number>(n).fill(0);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && order[j + 1]![0] === order[i]![0]) j += 1;
      const rank = (i + j) / 2;
      for (let k = i; k <= j; k += 1) out[order[k]![1]!] = rank;
      i = j + 1;
    }
    return out;
  };
  const ra = ranks(a);
  const rb = ranks(b);
  let d = 0;
  for (let i = 0; i < n; i += 1) d += (ra[i]! - rb[i]!) ** 2;
  return 1 - (6 * d) / (n * (n * n - 1));
}

/** The model with one term removed: the fit refitted on the pool with that term's input blank. */
function fitWithout(comps: Comp[], term: Term): Fit {
  const adjusted = comps.map((c) => {
    if (term === 'category') return { ...c, category: null, family: null };
    if (term === 'growth') return { ...c, growth_pct: null };
    return c;
  });
  const fit = fitTerms(adjusted, BOUNDS);
  if (term === 'line') fit.line = { ...fit.line, a: median(adjusted.map((c) => c.ratio_log)), b: 0 };
  if (term === 'hold') fit.hold = { a: 0, b: 0, lo: 0, hi: 3 };
  if (term === 'category') fit.category = [];
  return fit;
}

/** A fit's ratio for a comp with one term switched off. */
function ratioWithout(fit: Fit, c: Comp, term: Term, asLaunch: boolean): number {
  const state = asLaunch ? { ...c, age_years: 0, growth_pct: null } : c;
  const withAll = ratioUnderAt(fit, state, BOUNDS);
  if (term === 'line') return withAll / Math.exp(fit.line.a + fit.line.b * log(clip(state.tvl_usd, TVL_FLOOR_USD, TVL_CEIL_USD)));
  if (term === 'hold') return withAll / Math.exp(holdTerm(fit.hold, state.age_years));
  if (term === 'category') return withAll / Math.exp(tiltValue(fit.category, state.category) + tiltValue(fit.family, state.family));
  return withAll;
}

/** Every validation number the page shows. */
export function validate(model: Comps, snapshot: Snapshot): Validation {
  const { comps } = compPool(snapshot.protocols, snapshot.as_of);
  const ws = comps.map((c) => c.weight);
  const current: Fit = { line: model.line, category: model.category, family: model.family, growth: model.growth, hold: model.hold };

  // Record: each comp as the record it holds, priced by a fit that never saw it, as a listing of its day.
  const recordErr: number[] = [];
  for (const c of comps) {
    const fit = fitTerms(comps.filter((d) => d !== c), BOUNDS);
    recordErr.push(log(ratioUnder(fit, c)) - c.ratio_log);
  }
  // Launch: each comp as a listing of its own day, by a fit that never saw it, against the cover it
  // records. This is the board's question — a record the model has not seen, priced at its listing — so
  // it is a leave-one-out test too, and it is also the launch drift: how far a first-day reading sits
  // under the cover the same token records today.
  const launchErr: number[] = [];
  for (const c of comps) {
    const fit = fitTerms(comps.filter((d) => d !== c), BOUNDS);
    launchErr.push(log(ratioUnder(fit, { ...c, age_years: 0, growth_pct: null })) - c.ratio_log);
  }
  // Rank: the current fit's order against the recorded order, on the record state.
  const recordPred = comps.map((c) => log(ratioUnder(current, c)));

  // Later: the fit from the early comps; the late comps read as listings on the split day, carrying
  // the growth the snapshot reports about that day; the miss is against the cover they record now.
  const byDay = [...comps].sort((p, q) => p.listed_ms - q.listed_ms);
  const later: Validation['later'] = [];
  for (const share of [0.5, 0.65, 0.8]) {
    const split = byDay[Math.floor(byDay.length * share)]!;
    const from = new Date(split.listed_ms).toISOString().slice(0, 10);
    const early = byDay.filter((c) => c.listed_ms < split.listed_ms);
    const lateC = byDay.filter((c) => c.listed_ms >= split.listed_ms);
    if (early.length < 15 || lateC.length < 5) continue;
    const fit = fitTerms(early, BOUNDS);
    const preds = lateC.map((c) => log(ratioUnder(fit, { ...c, age_years: 0, growth_pct: c.growth_pct })));
    const errs = preds.map((p, i) => p - lateC[i]!.ratio_log);
    later.push({ from, n: lateC.length, corr: spearman(preds, lateC.map((c) => c.ratio_log)), misses: missesOf(errs, lateC.map((c) => c.weight)) });
  }

  const labels: Record<Term, { label: string; what: string }> = {
    line: { label: 'Line on TVL', what: 'what a dollar of TVL pays at this size, fitted across the pool' },
    category: { label: 'Category and family', what: 'a category and family mean residual, shrunk by n/(n+3) and n/(n+6)' },
    growth: { label: 'Growth', what: 'the seven-day change as a cover tilt, held inside one whole point' },
    hold: { label: 'Record', what: 'what the years since the listing day add, as a line on log(1 + age)' },
  };
  const baseRecord = missesOf(recordErr, ws).mad;
  const baseLaunch = missesOf(launchErr, ws).mad;
  const ablations: Ablation[] = (['line', 'category', 'growth', 'hold'] as Term[]).map((term) => {
    const rc: number[] = [];
    for (const c of comps) {
      const fit = fitWithout(comps.filter((d) => d !== c), term);
      rc.push(log(ratioWithout(fit, c, term, false)) - c.ratio_log);
    }
    const whole = fitWithout(comps, term);
    const lc = comps.map((c) => log(ratioWithout(whole, c, term, true)) - c.ratio_log);
    const recordMad = missesOf(rc, ws).mad;
    const launchMad = missesOf(lc, ws).mad;
    return { term, ...labels[term], record_mad: recordMad, delta_record: recordMad - baseRecord, launch_mad: launchMad, delta_launch: launchMad - baseLaunch };
  });

  return {
    record: missesOf(recordErr, ws),
    launch: missesOf(launchErr, ws),
    rank_corr: spearman(recordPred, comps.map((c) => c.ratio_log)),
    later,
    ablations,
    coverage: { watchlist: snapshot.watchlist.length, comps: comps.length },
  };
}
