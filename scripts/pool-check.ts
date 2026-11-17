// How the farm verdict moves across the board's universe: the sweep that fixed the bars in SLICE.
//
// Run from the repository root: node scripts/pool-check.ts [snapshot.json]
import { readFileSync } from 'node:fs';
import { fitComps } from '../lib/comps.ts';
import { buildRadar } from '../lib/board.ts';
import { economicsFor, clipFor, usd } from '../lib/farm.ts';
import type { Snapshot } from '../lib/types.ts';

const PATH = process.argv[2] ?? '/home/hatch/workspace/makefun/token-radar/kit/input/snapshot.json';
const snapshot = JSON.parse(readFileSync(PATH, 'utf8')) as Snapshot;
const orbit = fitComps(snapshot.protocols, snapshot.as_of, { lo: -2, hi: 0.5 }, { hold_on: false });
const radar = buildRadar(snapshot, orbit);
console.log('fit line a', orbit.line.a.toFixed(4), 'b', orbit.line.b.toFixed(4), 'hold', orbit.hold.a, orbit.hold.b, 'comps', orbit.pool.comps, 'p10', orbit.cover.p10);
console.log('board rows', radar.rows.length, 'watch ranked', radar.coverage.watch_ranked);
const tally: Record<string, number> = {};
for (const r of radar.rows) tally[r.farm.verdict] = (tally[r.farm.verdict] ?? 0) + 1;
console.log('verdicts', tally);
for (const slug of ['steakhouse-financial', 'sentora-curator', 'veda']) {
  const r = radar.rows.find((x) => x.slug === slug)!;
  console.log(slug, 'rank', r.rank, 'implied', usd(r.implied_value_usd), 'basis', usd(r.farm.basis_usd), 'cap', usd(r.farm.capital_usd), 'gross', usd(r.farm.gross_usd), 'cost', usd(r.farm.cost_usd), 'net', usd(r.farm.net_usd), 'per_h', usd(r.farm.per_hour_usd), 'be', r.farm.break_even, 'odds', r.farm.chance, r.farm.verdict);
  console.log('   ', r.farm.reason);
}
const sorted = [...radar.rows].sort((a, b) => b.farm.net_usd - a.farm.net_usd);
console.log('top by net (worth vs skip), best 5');
for (const r of sorted.slice(0, 5)) console.log('  ', r.rank, r.name, usd(r.tvl_usd), 'value', usd(r.implied_value_usd), 'basis', usd(r.farm.basis_usd), 'net', usd(r.farm.net_usd), 'per_h', usd(r.farm.per_hour_usd), 'be', r.farm.break_even, r.farm.verdict);
console.log('worst 5');
for (const r of sorted.slice(-5)) console.log('  ', r.rank, r.name, usd(r.tvl_usd), 'value', usd(r.implied_value_usd), 'basis', usd(r.farm.basis_usd), 'net', usd(r.farm.net_usd), 'per_h', usd(r.farm.per_hour_usd), 'be', r.farm.break_even, r.farm.verdict);
