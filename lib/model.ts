// The value model: a line over TVL, fitted on traded comps, plus the terms
// the criterion names — seven-day growth, age (the record), and the category
// and family tilts read off traded tokens in the same group. Every term is
// fitted, never typed in. The bootstrap refits use a fixed seed, so the
// program's two runs write the same bytes.

import { ageYears, familyOf, type Protocol, type Snapshot } from './data.ts';

/** A deterministic PRNG (mulberry32): the refits must not depend on the run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Anchor {
  p: Protocol;
  r: number;
  logR: number;
  logTvl: number;
  growth: number;
  recordX: number;
  age: number;
}

/** Seven-day growth clipped to ±25%, as a fraction. */
export function growthOf(p: Protocol): number {
  const g = p.change_7d ?? 0;
  return Math.max(-0.25, Math.min(0.25, g));
}

/** The record's regressor: e-folds of age past two years, staged at zero. */
export function recordXOf(age: number | null): number {
  if (age === null || age < 2) return 0;
  return Math.log(age / 2);
}

/**
 * The fit's anchors: traded tokens at least a year old that carry a market
 * cap and a positive cover. 85 on this snapshot.
 */
export function anchorsOf(snapshot: Snapshot): Anchor[] {
  const out: Anchor[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0 || p.mcap_usd <= 0) continue;
    const age = ageYears(p.listed_at, snapshot.as_of);
    if (age === null || age < 1) continue;
    const r = p.mcap_usd / p.tvl_usd;
    out.push({ p, r, logR: Math.log(r), logTvl: Math.log(p.tvl_usd), growth: growthOf(p), recordX: recordXOf(age), age });
  }
  return out;
}

export interface Tilt {
  key: string;
  n: number;
  value: number;
}

export interface Model {
  comps: number;
  meanLogR: number;
  line: { a: number; b: number };
  growth: number;
  recordSlope: number;
  recordCap: number;
  ratioP10: number;
  category: Tilt[];
  family: Tilt[];
}

const shrink = (n: number): number => n / (n + 30);

function olsLine(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i]!;
    my += ys[i]!;
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { a: my - b * mx, b };
}

function slopeThroughZero(xs: number[], ys: number[]): number {
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxx += xs[i]! * xs[i]!;
    sxy += xs[i]! * ys[i]!;
  }
  return sxx === 0 ? 0 : sxy / sxx;
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

/** Fit the model on a set of anchors, in the order line, growth, record, tilts. */
export function fitModel(anchors: Anchor[]): Model {
  const n = anchors.length;
  const line = olsLine(
    anchors.map((a) => a.logTvl),
    anchors.map((a) => a.logR),
  );
  let resid = anchors.map((a) => a.logR - (line.a + line.b * a.logTvl));
  const growth = slopeThroughZero(
    anchors.map((a) => a.growth),
    resid,
  );
  resid = resid.map((e, i) => e - growth * anchors[i]!.growth);
  const recordSlope = slopeThroughZero(
    anchors.map((a) => a.recordX),
    resid,
  );
  const recordCap = 0.5;
  resid = resid.map((e, i) => e - Math.min(recordSlope * anchors[i]!.recordX, recordCap));
  const tiltOf = (res: number[], keyOf: (a: Anchor) => string): Tilt[] => {
    const groups = new Map<string, { sum: number; n: number }>();
    for (let i = 0; i < n; i++) {
      const k = keyOf(anchors[i]!);
      const g = groups.get(k) ?? { sum: 0, n: 0 };
      g.sum += res[i]!;
      g.n++;
      groups.set(k, g);
    }
    return [...groups.entries()]
      .map(([key, g]) => ({ key, n: g.n, value: shrink(g.n) * (g.sum / g.n) }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  };
  // The family is the category lower-cased and dashed, so the two tilts
  // read the same signal: fit the category first, take it out, and only
  // then fit the family on what is left, or the same residual is counted twice.
  const category = tiltOf(resid, (a) => a.p.category);
  resid = resid.map((e, i) => e - (category.find((t) => t.key === anchors[i]!.p.category)?.value ?? 0));
  const family = tiltOf(resid, (a) => familyOf(a.p.category));
  const residAfter = resid.map((e, i) => {
    const f = family.find((t) => t.key === familyOf(anchors[i]!.p.category))?.value ?? 0;
    return e - f;
  });
  const sortedResid = [...residAfter].sort((a, b) => a - b);
  return {
    comps: n,
    meanLogR: mean(anchors.map((a) => a.logR)),
    line,
    growth,
    recordSlope,
    recordCap,
    ratioP10: Math.exp(quantile(sortedResid, 0.1)),
    category,
    family,
  };
}

export interface CoverParts {
  line: number;
  growth: number;
  record: number;
  category: number;
  family: number;
}

/** A protocol's log cover under the model, with every term named. */
export function logCoverParts(model: Model, p: Protocol, asOf: string): { logR: number; parts: CoverParts } {
  const age = ageYears(p.listed_at, asOf);
  const line = model.line.a + model.line.b * Math.log(Math.max(1, p.tvl_usd));
  const growth = model.growth * growthOf(p);
  const record = Math.min(model.recordSlope * recordXOf(age), model.recordCap);
  const category = model.category.find((t) => t.key === p.category)?.value ?? 0;
  const family = model.family.find((t) => t.key === familyOf(p.category))?.value ?? 0;
  return { logR: line + growth + record + category + family, parts: { line, growth, record, category, family } };
}

export function coverOf(model: Model, p: Protocol, asOf: string): number {
  return Math.exp(logCoverParts(model, p, asOf).logR);
}

// ---------------------------------------------------------------- validation

export interface ValidationStats {
  n: number;
  medianMiss: number;
  within3: number;
  within2: number;
  bias: number;
}

function statsOf(pairs: { recorded: number; predicted: number }[]): ValidationStats {
  const n = pairs.length;
  if (n === 0) return { n: 0, medianMiss: 0, within3: 0, within2: 0, bias: 0 };
  const misses = pairs.map(({ recorded, predicted }) => Math.max(predicted / recorded, recorded / predicted)).sort((a, b) => a - b);
  const ratios = pairs.map(({ recorded, predicted }) => predicted / recorded).sort((a, b) => a - b);
  return {
    n,
    medianMiss: quantile(misses, 0.5),
    within3: misses.filter((m) => m <= 3).length / n,
    within2: misses.filter((m) => m <= 2).length / n,
    bias: quantile(ratios, 0.5),
  };
}

export interface AblationRow {
  term: string;
  medianMiss: number;
  cost: number;
}

export interface Validation {
  loo: ValidationStats;
  blind: ValidationStats;
  walkForward: ValidationStats;
  launch: ValidationStats;
  ablation: AblationRow[];
  scatter: { recorded: number; predicted: number }[];
  /** The band floor's factor: the 1st percentile of the LOO recorded-over-predicted ratios. */
  bandLoFactor: number;
}

/** Leave-one-out predictions, each with the model fitted without that anchor. */
function looPredictions(anchors: Anchor[], asOf: string): { recorded: number; predicted: number; model: Model; anchor: Anchor }[] {
  const out: { recorded: number; predicted: number; model: Model; anchor: Anchor }[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const rest = anchors.filter((_, j) => j !== i);
    const model = fitModel(rest);
    const predicted = coverOf(model, anchors[i]!.p, asOf);
    out.push({ recorded: anchors[i]!.r, predicted, model, anchor: anchors[i]! });
  }
  return out;
}

/** The model tested on tokens the fit never saw, four ways. */
export function validateModel(snapshot: Snapshot, anchors: Anchor[]): Validation {
  const asOf = snapshot.as_of;
  const loo = looPredictions(anchors, asOf);
  const looStats = statsOf(loo.map(({ recorded, predicted }) => ({ recorded, predicted })));

  const cutoff2024 = Date.parse('2024-01-01T00:00:00Z');
  const before2024 = anchors.filter((a) => Date.parse(`${a.p.listed_at!}T00:00:00Z`) < cutoff2024);
  const from2024 = anchors.filter((a) => Date.parse(`${a.p.listed_at!}T00:00:00Z`) >= cutoff2024);
  const blindModel = fitModel(before2024);
  const blindStats = statsOf(from2024.map((a) => ({ recorded: a.r, predicted: coverOf(blindModel, a.p, asOf) })));

  const launchStats = statsOf(loo.filter((l) => Date.parse(`${l.anchor.p.listed_at!}T00:00:00Z`) >= cutoff2024).map(({ recorded, predicted }) => ({ recorded, predicted })));

  const cutoffs = ['2022-01-01', '2022-07-01', '2023-01-01', '2023-07-01', '2024-01-01'];
  const wfPairs: { recorded: number; predicted: number }[] = [];
  for (const cut of cutoffs) {
    const cutMs = Date.parse(`${cut}T00:00:00Z`);
    const endMs = cutMs + 365.25 * 24 * 60 * 60 * 1000;
    const train = anchors.filter((a) => Date.parse(`${a.p.listed_at!}T00:00:00Z`) < cutMs);
    const test = anchors.filter((a) => {
      const t = Date.parse(`${a.p.listed_at!}T00:00:00Z`);
      return t >= cutMs && t < endMs;
    });
    if (train.length < 20 || test.length === 0) continue;
    const model = fitModel(train);
    for (const a of test) wfPairs.push({ recorded: a.r, predicted: coverOf(model, a.p, asOf) });
  }
  const wfStats = statsOf(wfPairs);

  const terms: { term: string; drop: (model: Model, p: Protocol, asOf: string) => number }[] = [
    { term: 'line', drop: (m, p, a) => Math.exp(m.meanLogR + logCoverParts(m, p, a).parts.growth + logCoverParts(m, p, a).parts.record + logCoverParts(m, p, a).parts.category + logCoverParts(m, p, a).parts.family) },
    { term: 'growth', drop: (m, p, a) => Math.exp(logCoverParts(m, p, a).logR - logCoverParts(m, p, a).parts.growth) },
    { term: 'record', drop: (m, p, a) => Math.exp(logCoverParts(m, p, a).logR - logCoverParts(m, p, a).parts.record) },
    { term: 'category', drop: (m, p, a) => Math.exp(logCoverParts(m, p, a).logR - logCoverParts(m, p, a).parts.category) },
    { term: 'family', drop: (m, p, a) => Math.exp(logCoverParts(m, p, a).logR - logCoverParts(m, p, a).parts.family) },
  ];
  const ablation: AblationRow[] = terms.map(({ term, drop }) => {
    const s = statsOf(loo.map((l) => ({ recorded: l.recorded, predicted: drop(l.model, l.anchor.p, asOf) })));
    return { term, medianMiss: s.medianMiss, cost: s.medianMiss - looStats.medianMiss };
  });

  return {
    loo: looStats,
    blind: blindStats,
    walkForward: wfStats,
    launch: launchStats,
    ablation,
    scatter: loo.map(({ recorded, predicted }) => ({ recorded: Math.round(Math.log(recorded) * 10) / 10, predicted: Math.round(Math.log(predicted) * 10) / 10 })),
    bandLoFactor: quantile(
      loo.map((l) => l.recorded / l.predicted).sort((a, b) => a - b),
      0.01,
    ),
  };
}

// ---------------------------------------------------------------- rank ranges

export interface RankRange {
  lo: number;
  hi: number;
  bandLo: number;
  bandHi: number;
}

/**
 * Fifty bootstrap refits of the fit, on a fixed seed: each row's rank range
 * and its implied-value band (10th to 90th percentile across the refits).
 */
export function rankRanges(anchors: Anchor[], subjects: Protocol[], asOf: string): Map<string, RankRange> {
  const rng = mulberry32(20261114);
  const refits = 50;
  const ranks = new Map<string, number[]>();
  const values = new Map<string, number[]>();
  for (const s of subjects) {
    ranks.set(s.slug, []);
    values.set(s.slug, []);
  }
  for (let k = 0; k < refits; k++) {
    const sample: Anchor[] = [];
    for (let i = 0; i < anchors.length; i++) sample.push(anchors[Math.floor(rng() * anchors.length)]!);
    const model = fitModel(sample);
    const priced = subjects
      .map((s) => ({ slug: s.slug, value: s.tvl_usd * coverOf(model, s, asOf) }))
      .sort((a, b) => b.value - a.value || (a.slug < b.slug ? -1 : 1));
    priced.forEach((row, i) => {
      ranks.get(row.slug)!.push(i + 1);
      values.get(row.slug)!.push(row.value);
    });
  }
  const out = new Map<string, RankRange>();
  for (const s of subjects) {
    const rs = ranks.get(s.slug)!;
    const vs = [...values.get(s.slug)!].sort((a, b) => a - b);
    out.set(s.slug, { lo: Math.min(...rs), hi: Math.max(...rs), bandLo: quantile(vs, 0.1), bandHi: quantile(vs, 0.9) });
  }
  return out;
}
