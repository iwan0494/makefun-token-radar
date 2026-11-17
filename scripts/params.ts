import { readFileSync, writeFileSync } from 'node:fs';
import { fitComps } from '../lib/comps.ts';
const snap = JSON.parse(readFileSync('/home/hatch/workspace/makefun/token-radar/kit/input/snapshot.json', 'utf8'));
const m = fitComps(snap.protocols, snap.as_of);
const params = {
  as_of: m.as_of,
  n: m.comps,
  line: { a: m.curve.a, b: m.curve.b },
  residual_scale: m.curve.residual_scale,
  growth: m.growth,
  seasoning: { slope: m.seasoning.slope, n: m.seasoning.n },
  elite: m.elite,
  category: Object.fromEntries(m.tilts.category.map((t) => [t.key, t.value])),
  family: Object.fromEntries(m.tilts.family.map((t) => [t.key, t.value])),
};
writeFileSync('/tmp/params.json', JSON.stringify(params));
console.log(JSON.stringify(params));
