// The value model, fitted fresh from the snapshot on every run: a line over TVL,
// a seven-day growth term, a record term read off the listing day, and category
// and family tilts shrunk toward zero. No protocol is named here; the fit reads
// only the snapshot's own figures, and every number the page shows about the
// model is computed below, not typed in.
//
// Anchors: the traded tokens at least a year old. A token younger than a year
// has a ratio dominated by its listing noise, so it does not anchor the fit;
// the validation below says so in the open (the blind split is the proof).

import { ageYears, clip, familyOf, isComp, type Protocol, type Snapshot } from './data.ts';

export interface Tilt {
  key: string;
  n: number;
  value: number;
}

export interface Model {
  asOf: string;
  comps: number;
  line: { a: number; b: number };
  growth: number;
  recordSlope: number;
  recordRef: number;
  recordCap: number;
  category: Tilt[];
  family: Tilt[];
  residualScale: number;
  ratioP10: number;
  ratioP50: number;
  ratioP90: number;
}

export interface Terms {
  line: number;
  category: string;
  categoryLog: number;
  family: string;
  familyLog: number;
  chain: string;
  growthPct: number | null;
  growthLog: number;
  recordYears: number | null;
  recordLog: number;
  logCover: number;
  cover: number;
}

const TILT_PRIOR = 30;
const RECORD_MIN_AGE = 2;
const RECORD_CAP = 0.5;
const RECORD_REF_YEARS = 2;
const MIN_ANCHOR_AGE_YEARS = 1;

/** The anchors: traded, with a market cap and a listing day, at least a year old. */
export function anchorsOf(snap: Snapshot): Protocol[] {
  return snap.protocols.filter((p) => isComp(p) && (ageYears(p, snap.as_of) ?? 0) >= MIN_ANCHOR_AGE_YEARS);
}

/** A small dense solver: Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    [m[c], m[piv]] = [m[piv], m[c]];
    const d = m[c][c];
    if (Math.abs(d) < 1e-12) return null;
    for (let j = c; j <= n; j++) m[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c];
      for (let j = c; j <= n; j++) m[r][j] -= f * m[c][j];
    }
  }
  return m.map((row) => row[n]);
}

function ols(X: number[][], y: number[]): number[] | null {
  const k = X[0].length;
  const A: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const b: number[] = Array(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let r = 0; r < k; r++) {
      b[r] += X[i][r] * y[i];
      for (let c = 0; c < k; c++) A[r][c] += X[i][r] * X[i][c];
    }
  }
  return solve(A, b);
}

function growthOf(p: Protocol): number {
  return clip(p.change_7d ?? 0, -25, 25) / 100;
}

/** The record term: how far a protocol's age moves its log cover off the line. */
export function recordOf(model: Model, p: Protocol, asOf: string): number {
  const age = ageYears(p, asOf);
  if (age === null) return 0;
  return clip(model.recordSlope * (Math.log(age) - Math.log(model.recordRef)), -model.recordCap, model.recordCap);
}

function tiltList(groups: Map<string, { sum: number; n: number }>): Tilt[] {
  const out: Tilt[] = [];
  for (const [key, v] of groups) {
    out.push({ key, n: v.n, value: (v.sum / v.n) * (v.n / (v.n + TILT_PRIOR)) });
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/**
 * Fit the model on the anchors: least squares for the line and the growth term,
 * then the record slope off the residuals of the tokens at least two years old
 * (capped at half a log either way), then category and family tilts shrunk by
 * n / (n + 30) off what is left. Every stage is refit inside every validation
 * fold below, so no validation number below ever sees the token it prices.
 */
export function fitModel(anchors: Protocol[], asOf: string): Model {
  const y = anchors.map((p) => Math.log((p.mcap_usd as number) / p.tvl_usd));
  const X = anchors.map((p) => [1, Math.log(Math.max(p.tvl_usd, 1)), growthOf(p)]);
  const beta = ols(X, y);
  if (beta === null) throw new Error('model: the line does not fit');
  let resid = anchors.map((p, i) => y[i] - X[i].reduce((s, v, j) => s + v * beta[j], 0));

  let recordSlope = 0;
  const old: { x: number; y: number }[] = [];
  anchors.forEach((p, i) => {
    const age = ageYears(p, asOf);
    if (age !== null && age >= RECORD_MIN_AGE) old.push({ x: Math.log(age), y: resid[i] });
  });
  if (old.length >= 10) {
    const mx = old.reduce((s, o) => s + o.x, 0) / old.length;
    const my = old.reduce((s, o) => s + o.y, 0) / old.length;
    let num = 0;
    let den = 0;
    for (const o of old) {
      num += (o.x - mx) * (o.y - my);
      den += (o.x - mx) ** 2;
    }
    recordSlope = den > 0 ? num / den : 0;
  }
  const ref = Math.log(RECORD_REF_YEARS);
  resid = resid.map((r, i) => {
    const age = ageYears(anchors[i], asOf);
    const rec = age === null ? 0 : clip(recordSlope * (Math.log(age) - ref), -RECORD_CAP, RECORD_CAP);
    return r - rec;
  });

  const catGroups = new Map<string, { sum: number; n: number }>();
  const famGroups = new Map<string, { sum: number; n: number }>();
  anchors.forEach((p, i) => {
    const c = catGroups.get(p.category ?? 'unknown') ?? { sum: 0, n: 0 };
    c.sum += resid[i];
    c.n++;
    catGroups.set(p.category ?? 'unknown', c);
    const f = famGroups.get(familyOf(p)) ?? { sum: 0, n: 0 };
    f.sum += resid[i];
    f.n++;
    famGroups.set(familyOf(p), f);
  });
  const category = tiltList(catGroups);
  const family = tiltList(famGroups);

  const sortedResid = [...resid].sort((a, b) => a - b);
  const mid = sortedResid[Math.floor(sortedResid.length / 2)];
  const mad = [...sortedResid.map((r) => Math.abs(r - mid))].sort((a, b) => a - b)[Math.floor(sortedResid.length / 2)] * 1.4826;
  const ratios = anchors.map((p) => (p.mcap_usd as number) / p.tvl_usd).sort((a, b) => a - b);
  return {
    asOf,
    comps: anchors.length,
    line: { a: beta[0], b: beta[1] },
    growth: beta[2],
    recordSlope,
    recordRef: RECORD_REF_YEARS,
    recordCap: RECORD_CAP,
    category,
    family,
    residualScale: mad,
    ratioP10: quantile(ratios, 0.1),
    ratioP50: quantile(ratios, 0.5),
    ratioP90: quantile(ratios, 0.9),
  };
}

function tiltValue(tilts: Tilt[], key: string): { value: number; n: number } {
  const t = tilts.find((x) => x.key === key);
  return t === undefined ? { value: 0, n: 0 } : { value: t.value, n: t.n };
}

/** The fitted log cover of a protocol, with every term named for the detail sheet. */
export function termsOf(model: Model, p: Protocol): Terms {
  const line = model.line.a + model.line.b * Math.log(Math.max(p.tvl_usd, 1));
  const cat = tiltValue(model.category, p.category ?? 'unknown');
  const fam = tiltValue(model.family, familyOf(p));
  const chain = p.chains[0] ?? '—';
  const growthLog = model.growth * growthOf(p);
  const recordLog = recordOf(model, p, model.asOf);
  const logCover = line + cat.value + fam.value + growthLog + recordLog;
  return {
    line,
    category: p.category ?? 'unknown',
    categoryLog: cat.value,
    family: familyOf(p),
    familyLog: fam.value,
    chain,
    growthPct: p.change_7d,
    growthLog,
    recordYears: ageYears(p, model.asOf),
    recordLog,
    logCover,
    cover: Math.exp(logCover),
  };
}

/** The fitted cover itself: the ratio the line, the tilts, the growth and the record name. */
export function coverOf(model: Model, p: Protocol): number {
  return termsOf(model, p).cover;
}

// ---------------------------------------------------------------- validation

export interface SplitResult {
  n: number;
  medianMiss: number;
  within3: number;
  within2: number;
  bias: number;
}

export interface Validation {
  loo: SplitResult;
  blind: SplitResult;
  walkForward: SplitResult;
  launch: SplitResult;
  ablation: { term: string; medianMiss: number; cost: number }[];
  scatter: { recorded: number; predicted: number }[];
}

function summarize(errs: number[]): SplitResult {
  const abs = errs.map((e) => Math.abs(e)).sort((a, b) => a - b);
  const med = abs[Math.floor(abs.length / 2)];
  return {
    n: errs.length,
    medianMiss: Math.exp(med),
    within3: errs.filter((e) => Math.abs(e) <= Math.log(3)).length / errs.length,
    within2: errs.filter((e) => Math.abs(e) <= Math.log(2)).length / errs.length,
    bias: Math.exp(errs.reduce((s, e) => s + e, 0) / errs.length),
  };
}

function errOf(model: Model, p: Protocol): number {
  return Math.log((p.mcap_usd as number) / p.tvl_usd) - Math.log(coverOf(model, p));
}

/** A model with one term switched off, for the ablation table. */
function without(model: Model, term: string): Model {
  const m: Model = {
    ...model,
    category: model.category.map((t) => ({ ...t })),
    family: model.family.map((t) => ({ ...t })),
  };
  if (term === 'line') m.line = { a: 0, b: 0 };
  if (term === 'growth') m.growth = 0;
  if (term === 'record') m.recordSlope = 0;
  if (term === 'category') m.category = m.category.map((t) => ({ ...t, value: 0 }));
  if (term === 'family') m.family = m.family.map((t) => ({ ...t, value: 0 }));
  return m;
}

/**
 * Every validation the page shows, computed here from the snapshot, with the
 * fold refitting the whole model each time — line, record slope and tilts —
 * so a held-out token never leaks into its own price. Leave-one-out over the
 * anchors; blind, fit before 2024 and tested on the tokens listed from 2024
 * on; walk-forward, five cutoffs with a twelve-month window each, pooled;
 * launch, the same leave-one-out priced only on the tokens listed from 2024
 * on, the cohort a launch is most like.
 */
export function validateModel(snap: Snapshot, anchors: Protocol[]): Validation {
  const asOf = snap.as_of;
  const looErrs: number[] = [];
  const scatter: { recorded: number; predicted: number }[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const rest = anchors.filter((_, j) => j !== i);
    const m = fitModel(rest, asOf);
    const e = errOf(m, anchors[i]);
    looErrs.push(e);
    scatter.push({ recorded: Math.log((anchors[i].mcap_usd as number) / anchors[i].tvl_usd), predicted: Math.log(coverOf(m, anchors[i])) });
  }
  const loo = summarize(looErrs);

  const train = anchors.filter((p) => (p.listed_at as string) < '2024-01-01');
  const test = anchors.filter((p) => (p.listed_at as string) >= '2024-01-01');
  const blindModel = fitModel(train, asOf);
  const blind = summarize(test.map((p) => errOf(blindModel, p)));

  const wfErrs: number[] = [];
  for (const cut of ['2023-01-01', '2023-07-01', '2024-01-01', '2024-07-01', '2025-01-01']) {
    const end = new Date(`${cut}T00:00:00Z`);
    end.setFullYear(end.getFullYear() + 1);
    const endS = end.toISOString().slice(0, 10);
    const tr = anchors.filter((p) => (p.listed_at as string) < cut);
    const te = anchors.filter((p) => (p.listed_at as string) >= cut && (p.listed_at as string) < endS);
    if (tr.length < 20 || te.length === 0) continue;
    const m = fitModel(tr, asOf);
    wfErrs.push(...te.map((p) => errOf(m, p)));
  }
  const walkForward = summarize(wfErrs);
  const launch = summarize(test.map((p) => errOf(fitModel(anchors.filter((q) => q !== p), asOf), p)));

  const full = fitModel(anchors, asOf);
  const ablation: { term: string; medianMiss: number; cost: number }[] = [];
  for (const term of ['line', 'growth', 'record', 'category', 'family']) {
    const m = without(full, term);
    const errs: number[] = [];
    for (let i = 0; i < anchors.length; i++) {
      const rest = anchors.filter((_, j) => j !== i);
      const rm = fitModel(rest, asOf);
      errs.push(errOf(without(rm, term), anchors[i]));
    }
    const med = Math.exp([...errs.map((e) => Math.abs(e))].sort((a, b) => a - b)[Math.floor(errs.length / 2)]);
    ablation.push({ term, medianMiss: med, cost: med - loo.medianMiss });
  }

  return { loo, blind, walkForward, launch, ablation, scatter };
}

// ---------------------------------------------------------------- rank ranges

/** A seeded shuffle-free resampler, so the ranges are the same on every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The rank range of every board row across fifty refits of the model on
 * resampled anchors: the 5th and 95th percentile of the rank a row takes.
 * A row whose range is wide is a row the fit itself is unsure about.
 */
export function rankRanges(
  anchors: Protocol[],
  board: Protocol[],
  asOf: string,
  refits = 50,
): Map<string, { lo: number; hi: number }> {
  const rand = mulberry32(20261121);
  const ranks = new Map<string, number[]>();
  for (const p of board) ranks.set(p.slug, []);
  for (let r = 0; r < refits; r++) {
    const sample: Protocol[] = [];
    for (let i = 0; i < anchors.length; i++) sample.push(anchors[Math.floor(rand() * anchors.length)]);
    const m = fitModel(sample, asOf);
    const scored = board
      .map((p) => ({ slug: p.slug, value: p.tvl_usd * coverOf(m, p) }))
      .sort((a, b) => b.value - a.value);
    scored.forEach((row, i) => ranks.get(row.slug)?.push(i + 1));
  }
  const out = new Map<string, { lo: number; hi: number }>();
  for (const [slug, rs] of ranks) {
    const s = [...rs].sort((a, b) => a - b);
    out.set(slug, { lo: s[Math.floor(s.length * 0.05)], hi: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] });
  }
  return out;
}
