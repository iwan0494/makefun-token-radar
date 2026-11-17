import { readFileSync } from 'node:fs';
import { compPool, fitComps, log, exp, tiltValue, growthTerm, holdTerm, holdRegressor, quantile } from '../lib/comps.ts';
import type { Snapshot } from '../lib/types.ts';
const snap = JSON.parse(readFileSync('../token-radar/kit/input/snapshot.json', 'utf8')) as Snapshot;
const model = fitComps(snap.protocols, snap.as_of);
const { comps } = compPool(snap.protocols, snap.as_of);
const ratioAt = (c: any, g: number | null, age: number) =>
  exp(model.line.a + model.line.b * log(c.tvl_usd) + tiltValue(model.category, c.category) + tiltValue(model.family, c.family) + growthTerm(g, model.growth.level, model.growth.slope) + holdTerm(model.hold, age));
const ws = comps.map((c) => c.weight);
const wsum = ws.reduce((a, b) => a + b, 0);
const wmedian = (xs: { v: number; w: number }[]) => quantile(xs.flatMap((x) => Array(Math.max(1, Math.round(x.w * 10))).fill(x.v)), 0.5);
const wmad = (xs: { v: number; w: number }[]) => { const m = wmedian(xs); return 1.4826 * wmedian(xs.map((x) => ({ v: Math.abs(x.v - m), w: x.w }))); };
for (const [label, gOf, ageOf] of [
  ['clean, as recorded', (c: any) => c.growth_pct, (c: any) => c.age_years],
  ['as recorded + 6mo', (c: any) => c.growth_pct, (c: any) => c.age_years + 0.5],
  ['growth at 0, now', () => 0, (c: any) => c.age_years],
  ['growth at 0, +6mo', () => 0, (c: any) => c.age_years + 0.5],
  ['unseen: g=0, age 0.05', () => null, () => 0.05],
  ['unseen: g=0, age 0.25', () => null, () => 0.25],
  ['unseen: g=0, age 1', () => null, () => 1],
  ['unseen: g=0, age 2', () => null, () => 2],
  ['unseen: g=-10, age 0.25', () => -10, () => 0.25],
] as const) {
  const miss = comps.map((c) => ({ v: Math.log(ratioAt(c, gOf(c), ageOf(c)) / exp(c.ratio_log)), w: c.weight }));
  const m = wmedian(miss);
  console.log(label.padEnd(26), 'bias', m.toFixed(3), 'mad', wmad(miss).toFixed(3), 'within2x', (miss.filter((x) => Math.abs(x.v) < Math.log(2)).reduce((a, x) => a + x.w, 0) / wsum).toFixed(2));
}
