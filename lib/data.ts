// The page's data: one compact object, written beside the dashboard as zdata.js, that the page
// script reads with no request. Everything the page shows is in here, so the page and board.json
// cannot disagree on what they read: the page re-derives each row's arithmetic from its terms.
//
// The dossier shows every source file whole up to 65,536 bytes and cuts the first that overflows,
// so this file is small on purpose. Rows are positional arrays, not objects: a name, dictionary
// indexes for category, family and chains, whole dollars rounded to thousands where the page shows
// them, and the six fitted terms in milli-logs. The farm steps are not stored as text — the page
// rebuilds them from the row's own economics and the career table below, with the same numbers
// board.json carries, so the two agree without paying 400 KB for the same words twice.
//
// The snapshot's `source` carries a URL (DefiLlama's endpoint), so the page gets a URL-free label:
// an https:// address in a rendered attribute or link value would be refused.

import type { Comps, Snapshot } from './types.ts';
import { SLICE } from './farm.ts';
import { CAREERS } from './careers.ts';
import { BAND_LOG, PRICE_HORIZON_YEARS, type Radar } from './board.ts';
import type { Validation } from './validate.ts';
import { TILT_MIN_N, WEIGHT_HALF_TVL } from './comps.ts';

/** One row, positional: [name, cat, fam, chain, chain2, tvlK, chg, ageDays, coverX, valueK, verdict, net, perHour, odds, be, capital, gas, days, hours10, cost, basisK, watch, terms]. */
export type CompactRow = [
  string, number, number, number, number, number, number | null, number | null, number, number,
  number, number, number, number, number, number, number, number, number, number, number, number,
  [number, number, number, number, number, number],
];

export interface PageData {
  /** [as_of, floor_usd, watchlist, protocols, traded, rows, horizon_years, band_log, source label]. */
  meta: [string, number, number, number, number, number, number, number, string];
  /** [line a, line b, growth level, growth slope, hold a, hold b, scale, cover p10, cover p50, cover p90, tilt_min_n, weight_half_tvl]. */
  model: [number, number, number, number, number, number, number, number, number, number, number, number];
  /** Tilts as [key, n, value] triples: category, family, chain. */
  tilts: { cat: Array<[string, number, number]>; fam: Array<[string, number, number]>; chain: Array<[string, number, number]> };
  /** [season days, gas per leg, idle yield /yr, exit bps, hours /week, capture, chance floor, chance ceiling, hour usd, worth $/h, marginal $/h, worth break-even, marginal break-even]. */
  slice: [number, number, number, number, number, number, number, number, number, number, number, number, number];
  /** [record [n, bias, mad, p10, p90, within2, within3, median miss x], launch [...], rank corr, blind [from, n, within3, corr] or null, later [[from, n, corr, within3]], ablation [[term, recMed, dRec, launchMed, dLaunch]], points [[readX, actualX]]]. */
  validation: {
    rec: [number, number, number, number, number, number, number, number];
    launch: [number, number, number, number, number, number, number, number];
    rank: number;
    blind: [string, number, number, number] | null;
    later: Array<[string, number, number, number]>;
    abl: Array<[string, number, number, number, number]>;
    points: Array<[number, number]>;
  };
  /** Watchlist coverage: [watchlist, ranked, missing, ranked above floor, ranked below floor, traded set aside]. */
  coverage: [number, number, number, number, number, number];
  /** Every protocol accounted for: [total, priced, traded, comps, near listing, out of bounds, no mcap, sheets, bridges, wrapped, versioned, exchange]. */
  acct: [number, number, number, number, number, number, number, number, number, number, number, number];
  /** Career table, short strings the page builds steps from: [label, action, routine, risk, lock]. */
  careers: Record<string, [string, string, string, string, string]>;
  cats: string[];
  fams: string[];
  chains: string[];
  rows: CompactRow[];
}

/** The snapshot's `source` as a label: the fetching endpoint and the fetch time, with any http:// or
 * https:// address dropped whole, so the page never renders one and board.json keeps its own copy. */
export function sourceLabel(source: string): string {
  return source
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,;])/g, '$1')
    .replace(/^[\s,:;]+|[\s,:;]+$/g, '') || 'sealed snapshot';
}

const r3 = (x: number): number => Math.round(x * 1000) / 1000;
/** Two decimals for the six fitted terms: the detail sheet shows them to two places, and the
 *  third decimal would cost ~1.1 KB of dossier text for nothing a reader can see. */
const r2 = (x: number): number => Math.round(x * 100) / 100;

/** The page's data object, from the same board the file carries. */
export function pageData(radar: Radar, snapshot: Snapshot, validation: Validation): PageData {
  const m = radar.model;
  const cats: string[] = [];
  const fams: string[] = [];
  const chains: string[] = [];
  const idx = (list: string[], v: string | null): number => {
    if (v === null) return -1;
    let i = list.indexOf(v);
    if (i < 0) { list.push(v); i = list.length - 1; }
    return i;
  };
  const rows: CompactRow[] = radar.rows.map((row) => {
    const f = row.farm;
    const t = row.model;
    return [
      row.name,
      idx(cats, row.category),
      idx(fams, row.family),
      idx(chains, row.chains[0] ?? null),
      idx(chains, row.chains[1] ?? null),
      Math.round(row.tvl_usd / 1000),
      row.change_7d === null ? null : Math.round(row.change_7d * 10) / 10,
      row.age_days,
      Math.round(row.implied_cover * 1e6),
      Math.round(row.implied_value_usd / 1000),
      f.verdict === 'Worth' ? 0 : f.verdict === 'Marginal' ? 1 : 2,
      f.net_usd,
      f.per_hour_usd,
      Math.round(f.chance * 100),
      Math.round(f.break_even * 1000),
      f.capital_usd,
      f.gas_usd,
      f.days,
      Math.round(f.hours * 10),
      f.cost_usd,
      Math.round(f.basis_usd / 1000),
      row.on_watchlist ? 1 : 0,
      [r2(t.line_log), r2(t.category_log), r2(t.family_log), r2(t.chain_log), r2(t.growth_log), r2(t.hold_log)],
    ];
  });
  const careers: PageData['careers'] = {};
  for (const c of Object.values(CAREERS)) {
    careers[c.key] = [c.label, c.action, c.routine, c.risk, c.lock];
  }
  const miss = (v: Validation['record']): PageData['validation']['rec'] => [v.n, r3(v.bias), r3(v.mad), r3(v.p10), r3(v.p90), Math.round(v.within2x * 1000) / 1000, Math.round(v.within3x * 1000) / 1000, r3(v.med)];
  return {
    meta: [snapshot.as_of, snapshot.floor_usd, snapshot.watchlist.length, snapshot.protocols.length, m.pool.traded, radar.rows.length, PRICE_HORIZON_YEARS, BAND_LOG, sourceLabel(snapshot.source)],
    model: [r3(m.line.a), r3(m.line.b), r3(m.growth.level), r3(m.growth.slope), r3(m.hold.a), r3(m.hold.b), r3(m.scale), r3(m.cover.p10), r3(m.cover.p50), r3(m.cover.p90), TILT_MIN_N, WEIGHT_HALF_TVL],
    tilts: {
      cat: m.category.map((t) => [t.key, t.n, r3(t.value)] as [string, number, number]),
      fam: m.family.map((t) => [t.key, t.n, r3(t.value)] as [string, number, number]),
      chain: m.chain.map((t) => [t.key, t.n, r3(t.value)] as [string, number, number]),
    },
    slice: [SLICE.season_days, SLICE.gas_per_leg_usd, SLICE.idle_yield_per_year, SLICE.exit_cost_bps, SLICE.hours_per_week, SLICE.capture, SLICE.chance_floor, SLICE.chance_ceiling, SLICE.hour_usd, SLICE.worth_per_hour_usd, SLICE.marginal_per_hour_usd, SLICE.worth_break_even, SLICE.marginal_break_even],
    validation: {
      rec: miss(validation.record),
      launch: miss(validation.launch),
      rank: r3(validation.rank_corr),
      blind: validation.blind === null ? null : [validation.blind.from, validation.blind.n, Math.round(validation.blind.within3x * 1000) / 1000, r3(validation.blind.corr)],
      later: validation.later.map((s) => [s.from, s.n, r3(s.corr), Math.round(s.misses.within3x * 1000) / 1000] as [string, number, number, number]),
      abl: validation.ablations.map((a) => [a.term, r3(a.record_med), r3(a.delta_record), r3(a.launch_med), r3(a.delta_launch)] as [string, number, number, number, number]),
      points: validation.points.map((p) => [Math.round(p[0] * 1e6), Math.round(p[1] * 1e6)] as [number, number]),
    },
    coverage: [radar.coverage.watchlist, radar.coverage.watch_ranked, radar.coverage.missing.length, radar.coverage.ranked_above_floor, radar.coverage.ranked_below_floor, radar.coverage.traded_set_aside],
    acct: [snapshot.protocols.length, radar.rows.length, m.pool.traded, m.pool.comps, radar.coverage.traded_detail.near_listing, radar.coverage.traded_detail.out_of_bounds, radar.coverage.traded_detail.no_mcap, radar.coverage.left_out.sheets, radar.coverage.left_out.bridges, radar.coverage.left_out.wrapped, radar.coverage.left_out.versioned, radar.coverage.left_out.exchange],
    careers,
    cats,
    fams,
    chains,
    rows,
  };
}

/** zdata.js: an assignment the page's script reads with no request. */
export function dataScript(data: PageData): string {
  return `globalThis.LAUNCH_RADAR = ${JSON.stringify(data)};\n`;
}
