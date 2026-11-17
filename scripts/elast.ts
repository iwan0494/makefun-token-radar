import { readFileSync } from 'node:fs';
import { compPool, fitComps, log } from '../lib/comps.ts';
import type { Snapshot } from '../lib/types.ts';
const snap = JSON.parse(readFileSync('../token-radar/kit/input/snapshot.json', 'utf8')) as Snapshot;
const { comps } = compPool(snap.protocols, snap.as_of);
const lt = comps.map((c) => log(c.tvl_usd));
const lr = comps.map((c) => c.ratio_log);
const olsW = (xs: number[], ys: number[], ws: number[]) => { const sw = ws.reduce((a, b) => a + b, 0); const mx = xs.reduce((a, x, i) => a + x * ws[i]!, 0) / sw; const my = ys.reduce((a, y, i) => a + y * ws[i]!, 0) / sw; let sxy = 0, sxx = 0; for (let i = 0; i < xs.length; i++) { sxy += ws[i]! * (xs[i]! - mx) * (ys[i]! - my); sxx += ws[i]! * (xs[i]! - mx) ** 2; } const b = sxy / sxx; return { a: my - b * mx, b }; };
console.log('pool OLS b', olsW(lt, lr, comps.map((c) => c.weight)).b.toFixed(3));
for (const cut of [1e6, 1e7, 5e7, 1e8, 1e9]) for (const top of [5e7, 1e9, 1e10]) {
  const sel = comps.filter((c) => c.tvl_usd >= cut && c.tvl_usd <= top);
  if (sel.length < 8) continue;
  const o = olsW(sel.map((c) => log(c.tvl_usd)), sel.map((c) => c.ratio_log), sel.map((c) => c.weight));
  console.log('tvl', cut, '-', top, 'n', sel.length, 'b', o.b.toFixed(3));
}
for (const cut of [1, 2, 3, 5]) {
  const sel = comps.filter((c) => c.age_years >= cut);
  if (sel.length < 8) continue;
  const o = olsW(sel.map((c) => log(c.tvl_usd)), sel.map((c) => c.ratio_log), sel.map((c) => c.weight));
  console.log('age>=', cut, 'n', sel.length, 'b', o.b.toFixed(3));
}
for (const bmax of [0.5, 0.2, 0, -0.1]) { const m = fitComps(snap.protocols, snap.as_of, { lo: -1, hi: bmax }); console.log('pinned b', m.line.b.toFixed(3), 'pinned', m.line.pinned, 'scale', m.scale.toFixed(3)); }
