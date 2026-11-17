// Temporary dump: the 81 comps the ronde-2 fit prices in sample, read vs actual cover, for Fig. 1.
import { readFileSync, writeFileSync } from 'node:fs';
import { compPool, ratioUnderAt, log, exp, fitTerms } from '../lib/comps.ts';
import type { Snapshot } from '../lib/types.ts';
const snap = JSON.parse(readFileSync('/home/hatch/workspace/makefun/token-radar/kit/input/snapshot.json', 'utf8')) as Snapshot;
const { comps } = compPool(snap.protocols, snap.as_of);
const model = fitTerms(comps, { lo: -2, hi: 0.5 }, { hold_on: false });
const pts = comps.map((c) => ({
  slug: c.slug,
  category: c.category,
  read: Number(exp(log(ratioUnderAt(model, c, { lo: -2, hi: 0.5 }))).toPrecision(5)),
  actual: Number(exp(c.ratio_log).toPrecision(5)),
}));
writeFileSync('/tmp/scatter.json', JSON.stringify(pts));
console.log('n', pts.length, 'a', model.line.a, 'b', model.line.b);
