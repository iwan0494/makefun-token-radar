// The board: who is ranked, in what order, and what a reader can do about each one.
//
// Ronde 2 ranks every early protocol the snapshot records: a no-token protocol a launch could still name,
// with no wrapped or bridged product, no version of another protocol and no exchange's balance sheet in
// the list. That is 198 rows, the 40 the house's watchlist names included, each priced by the cover its
// record implies at one horizon (the token lists a year after its listing day; a protocol with no listing
// day is read from the snapshot day and the row says so). Ranking by that value alone put a $2.7B
// curator at the top and a $40M vault at the bottom; the farm plan beside each row is what decides
// whether either is worth a reader's week, and it reads its payoff at the band's tenth percentile, not the
// middle. Traded tokens are set aside and counted.

import { chainOf, clip, daysBetween, exp, familyOf, fitComps, growthTerm, holdTerm, log, recordsToken, tiltValue } from './comps.ts';
import type { Comps, Protocol, Snapshot } from './types.ts';
import { farmPlan, type Economics } from './farm.ts';

/** The horizon every row is priced at: years after a protocol's listing day. */
export const PRICE_HORIZON_YEARS = 1;
/** The band's half-width in logs: one fitted record covers about this much of its own peer range. */
export const BAND_LOG = 0.9;

export interface RowModel {
  line_log: number;
  category_log: number;
  family_log: number;
  chain_log: number;
  growth_log: number;
  hold_log: number;
  origin: 'counted' | 'snapshot';
  origin_days: number;
  priced_age_years: number;
}

export interface Row {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  family: string | null;
  chains: string[];
  on_watchlist: boolean;
  token_status: 'pre-token';
  implied_value_low_usd: number;
  implied_value_high_usd: number;
  ratio_low: number;
  ratio_p50: number;
  ratio_high: number;
  /** The row's own fitted cover (market cap per dollar of TVL at the horizon): it differs per row, never a pool constant. */
  implied_cover: number;
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  origin: 'counted' | 'snapshot';
  origin_days: number;
  growth_state: 'reported' | 'unreported';
  cohort: string;
  /** The pool's tenth-percentile fitted ratio: the band end every plan is priced at. */
  ratio_p10_floor: number;
  farm: Economics;
  model: RowModel;
}

export interface Coverage {
  watchlist: number;
  watch_ranked: number;
  missing: string[];
  ranked: number;
  ranked_above_floor: number;
  ranked_below_floor: number;
  no_listing_day: number;
  traded_set_aside: number;
  early_left_out: number;
  /** Why the 144 early protocols that are not on the board were set aside, by the same rules. */
  left_out: { sheets: number; bridges: number; wrapped: number; versioned: number; exchange: number };
  /** Why the traded tokens that are not comps did not anchor the fit. */
  traded_detail: { with_cover: number; near_listing: number; out_of_bounds: number; no_mcap: number };
  traded_notes: Array<{ slug: string; name: string; reason: string }>;
}

export interface Radar {
  rows: Row[];
  coverage: Coverage;
  model: Comps;
}

/** The house's watchlist exclusions, as the board reads them. */
const WRAPPED = /(^|\s)(wrapped|staked|staking)(\s|$)|^(wbtc|weth|steth|reth|cbeth|sfrxeth|usdt0)\b/i;
const BRIDGED = /(^|\s)(bridge)(\s|$)/i;
const VERSIONED = /\s(v\d+(\.\d+)?|\d+\.\d+)$/i;
const EXCHANGE = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)/i;
const SHEET_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** Why a no-token record is an early protocol a launch could still name, rather than a wrapper or a sheet. */
export function isEarly(p: Protocol): boolean {
  return !recordsToken(p)
    && !WRAPPED.test(p.name)
    && !BRIDGED.test(p.name)
    && !VERSIONED.test(p.name)
    && !EXCHANGE.test(p.name)
    && !(p.category !== null && SHEET_CATEGORIES.has(p.category));
}

/** The one reason a no-token protocol was set aside from the board, in the order the rules apply. */
export function leftOutReason(p: Protocol): 'sheets' | 'bridges' | 'wrapped' | 'versioned' | 'exchange' | null {
  if (WRAPPED.test(p.name)) return 'wrapped';
  if (BRIDGED.test(p.name)) return 'bridges';
  if (VERSIONED.test(p.name)) return 'versioned';
  if (EXCHANGE.test(p.name)) return 'exchange';
  if (p.category !== null && SHEET_CATEGORIES.has(p.category)) return 'sheets';
  return null;
}

/** A protocol's origin: its listing day when it records one, else the snapshot day. */
export function originOf(p: Protocol, asOf: string): { origin: 'counted' | 'snapshot'; days: number } {
  const days = daysBetween(p.listed_at, asOf);
  return days === null ? { origin: 'snapshot', days: 0 } : { origin: 'counted', days };
}

/** The age a row is priced at: the time from its origin to the holiday after the listing day. */
export function pricedAge(p: Protocol, asOf: string): number {
  return originOf(p, asOf).days / 365.25 + PRICE_HORIZON_YEARS;
}

/** The log cover a protocol's record implies, term by term. */
export function termsOf(model: Comps, p: Protocol, asOf: string): { terms: RowModel; ratioLog: number } {
  const { origin, days } = originOf(p, asOf);
  const family = familyOf(p);
  const priced = days / 365.25 + PRICE_HORIZON_YEARS;
  const line_log = model.line.a + model.line.b * log(clip(p.tvl_usd, 5_000_000, 1e12));
  const category_log = tiltValue(model.category, p.category);
  const family_log = tiltValue(model.family, family);
  const chain_log = tiltValue(model.chain, chainOf(p));
  const growth_log = growthTerm(p.change_7d, model.growth.level, model.growth.slope);
  const hold_log = holdTerm(model.hold, priced);
  const ratioLog = line_log + category_log + family_log + chain_log + growth_log + hold_log;
  return { terms: { line_log, category_log, family_log, chain_log, growth_log, hold_log, origin, origin_days: days, priced_age_years: priced }, ratioLog };
}

/** Why a traded token is not on the ranked board: the snapshot's own record, in one line. */
export function tradedReason(p: Protocol): string {
  const family = familyOf(p);
  const kind = family === null ? 'A protocol with a token' : `A ${family.replace(/^./, (c) => c.toUpperCase())} protocol`;
  const cap = p.mcap_usd === null ? 'no market cap recorded' : `market cap ${Math.round(p.mcap_usd / 1e6)}M`;
  return `${kind}: ${p.symbol ?? 'its token'} already trades, ${cap} against ${Math.round(p.tvl_usd / 1e6)}M TVL, so its answer is the market's, not a launch's`;
}

/** A row's cohort: the watchlist, the below-floor early protocols, and the rest. */
export function cohortOf(row: { on_watchlist: boolean; tvl_usd: number }, floor: number): string {
  if (row.on_watchlist) return 'watchlist';
  return row.tvl_usd < floor ? 'below floor' : 'above floor';
}

/** Build the board: every early protocol, ranked by implied value at one horizon. */
export function buildRadar(snapshot: Snapshot, given?: Comps): Radar {
  const model = given ?? fitComps(snapshot.protocols, snapshot.as_of);
  const watch = new Set(snapshot.watchlist);
  const early = snapshot.protocols.filter(isEarly);
  const ratioP10 = model.cover.p10;
  const priced = early.map((p) => {
    const { terms, ratioLog } = termsOf(model, p, snapshot.as_of);
    const ratio = exp(ratioLog);
    const value = Math.max(1, Math.round(p.tvl_usd * ratio));
    const low = Math.max(1, Math.round(p.tvl_usd * ratio * exp(-BAND_LOG)));
    const high = Math.max(low + 1, Math.round(p.tvl_usd * ratio * exp(BAND_LOG)));
    const ageDays = daysBetween(p.listed_at, snapshot.as_of);
    return { p, terms, ratio, ratioLog, value, low, high, ageDays };
  });
  priced.sort((a, b) => b.value - a.value || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));
  const rows: Row[] = priced.map(({ p, terms, ratio, ratioLog, value, low, high, ageDays }, i) => {
    const plan = farmPlan(model, p, snapshot.as_of, value, terms.origin_days, ratio, ratioP10);
    const onWatch = watch.has(p.slug);
    const row = {
      on_watchlist: onWatch,
      tvl_usd: p.tvl_usd,
    };
    return {
      slug: p.slug,
      name: p.name,
      rank: i + 1,
      implied_value_usd: value,
      farm_steps: plan.steps,
      category: p.category,
      family: familyOf(p),
      chains: p.chains,
      on_watchlist: onWatch,
      token_status: 'pre-token',
      implied_value_low_usd: low,
      implied_value_high_usd: high,
      ratio_low: ratio * exp(-BAND_LOG),
      ratio_p50: ratio,
      ratio_high: ratio * exp(BAND_LOG),
      implied_cover: ratio,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: ageDays === null ? null : Math.round(ageDays),
      origin: terms.origin,
      origin_days: terms.origin_days,
      growth_state: p.change_7d === null ? 'unreported' : 'reported',
      cohort: cohortOf(row, snapshot.floor_usd),
      ratio_p10_floor: ratioP10,
      farm: plan.economics,
      model: terms,
    } as Row;
  });
  const traded = snapshot.protocols.filter(recordsToken);
  const earlyAll = snapshot.protocols.filter((p) => !recordsToken(p));
  const leftOut = { sheets: 0, bridges: 0, wrapped: 0, versioned: 0, exchange: 0 };
  for (const p of earlyAll) {
    if (isEarly(p)) continue;
    const reason = leftOutReason(p);
    if (reason !== null) leftOut[reason] += 1;
  }
  const pool = model.pool;
  return {
    rows,
    model,
    coverage: {
      watchlist: snapshot.watchlist.length,
      watch_ranked: rows.filter((r) => r.on_watchlist).length,
      missing: snapshot.watchlist.filter((slug) => !rows.some((r) => r.slug === slug)),
      ranked: rows.length,
      ranked_above_floor: rows.filter((r) => r.tvl_usd >= snapshot.floor_usd).length,
      ranked_below_floor: rows.filter((r) => r.tvl_usd < snapshot.floor_usd).length,
      no_listing_day: rows.filter((r) => r.origin === 'snapshot').length,
      traded_set_aside: traded.length,
      early_left_out: earlyAll.length - early.length,
      left_out: leftOut,
      traded_detail: {
        with_cover: pool.with_mcap,
        near_listing: pool.near_listing,
        out_of_bounds: pool.with_mcap - pool.near_listing - pool.comps,
        no_mcap: pool.traded - pool.with_mcap,
      },
      traded_notes: traded.filter((p) => watch.has(p.slug)).map((p) => ({ slug: p.slug, name: p.name, reason: tradedReason(p) })),
    },
  };
}
