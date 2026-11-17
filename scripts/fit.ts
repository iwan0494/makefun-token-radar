import { readFileSync } from 'node:fs';
import { buildRadar } from '../lib/board.ts';
import { fitComps } from '../lib/comps.ts';
import { validate } from '../lib/validate.ts';
import type { Snapshot } from '../lib/types.ts';

const path = process.argv[2] ?? '/input/snapshot.json';
const snap = JSON.parse(readFileSync(path, 'utf8')) as Snapshot;
const verbose = process.argv.includes('--json');
if (verbose) {
  let t = Date.now();
  const model = fitComps(snap.protocols, snap.as_of);
  console.log('fit ms', Date.now() - t);
  console.log(JSON.stringify(model, null, 1));
  process.exit(0);
}
let t = Date.now();
const v = validate(fitComps(snap.protocols, snap.as_of), snap);
console.log('validate ms', Date.now() - t);
console.log(JSON.stringify(v, null, 1));
t = Date.now();
const board = buildRadar(snap);
console.log('board ms', Date.now() - t, 'rows', board.rows.length, 'watch', board.coverage.watch_ranked, 'missing', board.coverage.missing);
for (const r of board.rows.slice(0, 25)) {
  console.log(String(r.rank).padStart(3), r.on_watchlist ? 'W' : ' ', (r.tvl_usd / 1e6).toFixed(0).padStart(6), (r.change_7d === null ? '  null' : r.change_7d.toFixed(1).padStart(6)), (r.age_days === null ? '   --' : String(r.age_days).padStart(5)), (r.category ?? '-').slice(0, 18).padEnd(18), (r.implied_value_usd / 1e6).toFixed(1) + 'M', r.farm.verdict, r.farm.net_usd, r.name.slice(0, 24));
}
