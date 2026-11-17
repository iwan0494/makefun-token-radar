import { readFileSync } from 'node:fs';
import { compPool, fitComps, fitFollow, log, exp, tiltValue, growthTerm, holdTerm, holdRegressor, quantile, residualOf } from '../lib/comps.ts';
import type { Snapshot } from '../lib/types.ts';
const snap = JSON.parse(readFileSync('../token-radar/kit/input/snapshot.json', 'utf8')) as Snapshot;
const model = fitComps(snap.protocols, snap.as_of);
console.log('follow', model.follow, 'from', model.follow_from, 'n', model.follow_n);
const { comps } = compPool(snap.protocols, snap.as_of);
const desc = process.argv[2] === 'desc';
const ratioAt = (c: any, age: number) =>
  exp(model.line.a + model.line.b * log(c.tvl_usd) + tiltValue(model.category, c.category) + tiltValue(model.family, c.family) + growthTerm(c.growth_pct, model.growth.level, model.growth.slope) + holdTerm(model.hold, age));
const wq = (xs: { v: number; w: number }[], q: number) => { const all = xs.flatMap((x) => Array(Math.max(1, Math.round(x.w * 20))).fill(x.v)); return quantile(all, q); };
const wmed = (xs: { v: number; w: number }[]) => wq(xs, 0.5);
for (const [label, ageOf] of [
  ['state now', (c: any) => c.age_years],
  ['state +6mo', (c: any) => c.age_years + 0.5],
  ['state +1y', (c: any) => c.age_years + 1],
  ['state +2y', (c: any) => c.age_years + 2],
  ['launch g=0, now', () => 0],
  ['launch g=0, +6mo', () => 0.5],
  ['launch g=0, +1y', () => 1],
  ['launch g=0, +2y', () => 2],
  ['launch g=0, +3y', () => 3],
] as const) {
  const miss = comps.map((c) => ({ v: Math.log(ratioAt(c, ageOf(c)) / exp(c.ratio_log)), w: c.weight }));
  const m = wmed(miss);
  const mad = 1.4826 * wmed(miss.map((x) => ({ v: Math.abs(x.v - m), w: x.w })));
  console.log(label.padEnd(18), 'bias', m.toFixed(3).padStart(7), 'ratio', exp(m).toFixed(2).padStart(6), 'mad', mad.toFixed(3), 'p10', wq(miss, 0.1).toFixed(2), 'p90', wq(miss, 0.9).toFixed(2));
}
if (desc) {
  const rs = comps.map((c) => ({ slug: c.slug, r: residualOf({ line: model.line, category: model.category, family: model.family, growth: model.growth, hold: model.hold }, c) })).sort((a, b) => b.r - a.r);
  console.log('top residual (model under-prices)', rs.slice(0, 6).map((x) => x.slug + ' ' + x.r.toFixed(2)).join(', '));
  console.log('bottom residual', rs.slice(-6).map((x) => x.slug + ' ' + x.r.toFixed(2)).join(', '));
}
