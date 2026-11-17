// The farm plan: what a reader does with a protocol before its token exists, what each move costs,
// how long it holds them, and whether the plan pays for itself if the launch lands inside the band.
//
// Ronde 2 reads the plan from the band's low end, not its middle. The payoff is a fixed share of the
// value a launch at the band floor names for the protocol, and the floor is the row's OWN pool depth,
// the fitted cover its TVL supports, not the fit's central ratio. A row whose central record already sits
// below the floor keeps its own (lower) value; a row the record marks far above its depth is cut back to
// that depth. The pool's tenth-percentile cover only bounds the floor from below: no row is ever priced
// above the gross value its depth supports at the low end of the peer range.
//
// The cost is what a reader actually spends (gas on every leg, the yield the deposit would have earned
// elsewhere, the exit, and an hourly price on their time), and the net is what the plan keeps when the
// launch lands at the floor. The verdict turns on three facts, each read off that row: the net must be
// positive, the net per hour must clear the reader's hourly price, and the break-even odds (the launch
// chance at which chance x gross + (1 - chance) x wick pays every cost) must clear the bar the sweep
// prints for Worth and Marginal. The bars are stated assumptions, printed by scripts/pool-check.ts,
// not typed into the rows.
//
// The steps are written from the protocol's own record: its category chooses the kind of position,
// its first chain names where, its TVL sizes the deposit, its age since the listing day sets how long a
// campaign can run before the horizon, and its band-floor value sets what the position pays.
// The economics are the radar's own stated assumptions (SLICE, below), not the model's claim: a plan
// is a reader's case, and the board shows it beside the value so the two can be judged apart.

import { clip, daysBetween, exp, familyOf, recordsToken, tiltValue } from './comps.ts';
import { careerOf, mainChain, secondChain, type Career } from './careers.ts';
import type { Comps, Protocol } from './types.ts';

/** The reader's assumptions, stated on the page: the only numbers a plan adds to the snapshot's own. */
export const SLICE = {
  season_days: 84,
  gas_per_leg_usd: 4,
  idle_yield_per_year: 0.045,
  exit_cost_bps: 15,
  hours_per_week: 1.5,
  /**
   * The share of the band-floor value a reader's clip names, if the launch lands and names it.
   * Swept from the pool's own distribution (scripts/pool-check.ts): 0,0012 names 31 Worth / 35
   * Marginal / 132 Skip of 198 — the same proportions as the board's best entry; a larger share
   * lets the gross outrun the cost for almost every row.
   */
  capture: 0.0012,
  chance_floor: 0.08,
  chance_ceiling: 0.5,
  /** The share of the band-floor value a near miss still pays: a token that lands below the floor wicks. */
  wick_fraction: 0.2,
  /** The band's half-width in logs: the same range lib/board.ts prices every row's low/high band at. */
  band_log: 0.9,
  /** What an hour of the reader's time is worth, in whole dollars. */
  hour_usd: 20,
  /**
   * Worth: net per hour must clear this. The reader's stated hourly price, so a Worth plan pays at
   * least what the time is worth before it is counted as worth doing.
   */
  worth_per_hour_usd: 20,
  /**
   * Marginal: net per hour must clear this, i.e. the plan pays its gas, yield and exit over a third of
   * the reader's time, and Worth needs the whole hour's price.
   */
  marginal_per_hour_usd: 6,
  /**
   * Worth: a break-even odds no worse than this. Set from the sweep's own Worth candidates at one
   * decimal (scripts/pool-check.ts prints the distribution); a plan needing more is Marginal at best.
   */
  worth_break_even: 0.3,
  /**
   * Marginal: a break-even odds no worse than this. Set from the sweep's median candidate at one
   * decimal; a plan below it is Skip, because the record's chance cannot carry that price.
   */
  marginal_break_even: 0.6,
  /**
   * The least the deposit costs whatever path the reader takes: an account on the protocol's chain and
   * the practice deposit it takes to learn the withdraw, paid before the campaign's own gas. It is the
   * half-leg the sweep's per-leg gas covers and the legs count does not.
   */
  setup_legs: 1,
  /** The deposit's floor and ceiling in dollars: a reader's clip, not a whale's. */
  clip_min_usd: 100,
  clip_max_usd: 2_000,
  /** The share of the protocol's own TVL a deposit names, before the floor and ceiling. */
  clip_share: 0.0005,
} as const;

export interface Economics {
  kind: string;
  /** The value the payoff is read at: the protocol's band-low value, not the central one. */
  basis_usd: number;
  /** How far below the central value that basis sits, in multiples. */
  basis_x: number;
  /** The base deposit: the protocol's depth, at a fixed share of its TVL. */
  clip_usd: number;
  /** Scale on the base deposit: the launch lands at or above the band-low value, so it is not marked down. */
  band_scale: number;
  /** What the reader puts in: the base deposit, kept within a floor and a ceiling. */
  capital_usd: number;
  /** Gas on every leg the position needs. */
  gas_usd: number;
  /** What the deposit earns elsewhere over the window: the deposit's opportunity cost. */
  deposit_cost_usd: number;
  /** The exit, at the stated bps of the deposit. */
  exit_usd: number;
  /** The reader's time, at the stated hourly price: the cost the ledger's dollars leave out. */
  time_cost_usd: number;
  /** Everything the reader spends: gas, deposit idle, exit, time. */
  cost_usd: number;
  /** Gas, deposit idle and exit: the dollars that leave the wallet. */
  wallet_cost_usd: number;
  hours: number;
  days: number;
  /** What the launch pays the plan at the band's low end. */
  gross_usd: number;
  /** What a near miss pays: a token that lands below the band still names the protocol. */
  wick_usd: number;
  /** The chance of a launch the record supports. */
  chance: number;
  /** The record's chance rolled into one number: chance x gross + (1 - chance) x wick, less cost. */
  expected_usd: number;
  /** The half-swing of that expectation where the record is shown at the chance's upper bound. */
  swing_usd: number;
  /** What the plan keeps if the launch lands at the floor: the gross less every cost. */
  net_usd: number;
  /** The net spread over the hours the window asks of the reader. */
  per_hour_usd: number;
  /** The launch chance at which the plan breaks even: 0 to 1, 1 when no launch clears the cost. */
  break_even: number;
  verdict: 'Worth' | 'Marginal' | 'Skip';
  /** Why the verdict is what it is, in the row's own numbers. */
  reason: string;
}

export interface FarmPlan {
  steps: string[];
  economics: Economics;
}

/** A dollar figure a reader can read at a glance: $4.20M, $860k, $95. */
export function usd(x: number): string {
  const n = Math.abs(x);
  const sign = x < 0 ? '-' : '';
  if (n >= 1e12) return `${sign}$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${sign}$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${sign}$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
  if (n >= 1e3) return `${sign}$${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k`;
  return `${sign}$${Math.round(n)}`;
}
/** A span of days in the words a reader would use. */
export function span(days: number): string {
  if (days < 1.5) return `${Math.max(1, Math.round(days * 24))} h`;
  if (days < 45) return `${Math.round(days)} days`;
  if (days < 400) return `${(days / 30.44).toFixed(1)} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}

/** The legs a position takes: a bridge or a chain asks the reader to move in and out on each side. */
export function legsFor(career: Career): number {
  return career.key === 'bridge' || career.key === 'chain' ? 4 : 2;
}

/**
 * How much the plan covers: a fixed share of the protocol's own depth, kept between a clip's floor and
 * its ceiling. The payoff is a share of the band-floor value, which a wider pool carries more of, so a
 * reader's exposure rides with the TVL without a whale's deposit ever buying a verdict with its size.
 */
export function clipFor(tvl: number): number {
  return Math.max(SLICE.clip_min_usd, Math.min(SLICE.clip_max_usd, Math.round(tvl * SLICE.clip_share)));
}

/** The window's own length: from the plan's start to the horizon, at most a season. */
export function windowDays(originDays: number): number {
  const toHorizon = 365.25 - originDays;
  return Math.round(clip(toHorizon, 21, SLICE.season_days));
}

/**
 * The plan's basis: the pool depth the record supports at the band's low end, times the fitted cover.
 * The pool is the row's own TVL, cut back to what the peer line at that TVL supports (line + tilts,
 * less the band's half-width) when the row records a deeper pool than its size affords; a row already
 * below that band keeps its own pool. The cover is the row's fitted ratio, cut to that same band floor
 * so a strength that pushes the ratio above what the peer range holds is read at the bar, never above
 * it. `ratioP10` bounds the fitted ratio from below: no plan is priced on a cover under the pool's p10.
 */
export function bandFloor(ratioLog: number, ratioP10: number): number {
  return Math.max(exp(ratioLog - SLICE.band_log), ratioP10);
}

/**
 * The share of the row's TVL a plan is priced on: the pool the record supports at the band's low end,
 * over the pool it records. The supported pool is the peer line at this TVL, plus the row's own category
 * and family tilts, less the band's half-width; a row that records a deeper pool than that keeps only the
 * supported share, and a row already inside its band keeps all of its depth.
 */
export function depthScale(model: Comps, p: Protocol, tvlLog: number): number {
  const supportedLog = model.line.a + model.line.b * tvlLog
    + tiltValue(model.category, p.category)
    + tiltValue(model.family, familyOf(p))
    - SLICE.band_log;
  const ownLog = Math.log(Math.max(p.tvl_usd, 1));
  return clip(exp(Math.min(ownLog, supportedLog) - ownLog), 0.02, 1);
}

/** The value a plan is read at: the pool at the band floor, times the cover at the band floor. */
export function basisAt(model: Comps, p: Protocol, tvlLog: number, ratio: number, ratioP10: number): number {
  const depth = depthScale(model, p, tvlLog);
  const cover = clip(ratio, ratioP10, exp(ratioP10 + SLICE.band_log));
  return Math.max(1, Math.round(p.tvl_usd * depth * cover));
}

/** A hundred words a reader can read at a glance: 102.0M, 860k, 95. */
export function num(x: number): string {
  const n = Math.abs(x);
  const sign = x < 0 ? '-' : '';
  if (n >= 1e12) return `${sign}${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${sign}${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${sign}${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
  if (n >= 1e3) return `${sign}${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k`;
  return `${sign}${Math.round(n)}`;
}

/**
 * The plan's economics: the deposit, what each part of the campaign costs, what a launch at the band
 * floor pays, and the verdict. `value` is the row's central implied value, `ratio` the fitted cover and
 * `ratioLog` the row's whole fitted record, so the floor is read from the row's own pool depth; `ratioP10`
 * is the pool's tenth-percentile cover, which bounds the floor from below. The deposit is a share of the
 * protocol's own TVL, kept between a clip's floor and ceiling; it is not derived from the payoff, so a
 * large protocol cannot buy a verdict with its own size.
 */
export function economicsFor(
  model: Comps,
  p: Protocol,
  asOf: string,
  value: number,
  originDays: number,
  ratio: number,
  ratioP10: number,
): Economics {
  const career = careerOf(p.category);
  const tvlLog = Math.log(Math.max(p.tvl_usd, 1));
  const depth = depthScale(model, p, tvlLog);
  const basis = basisAt(model, p, tvlLog, ratio, ratioP10);
  const clipUsd = clipFor(p.tvl_usd);
  const capital = clipUsd;
  const days = windowDays(originDays);
  const legs = legsFor(career);
  const gas = (legs + SLICE.setup_legs) * SLICE.gas_per_leg_usd;
  const idle = capital * SLICE.idle_yield_per_year * (days / 365.25);
  const exit = capital * SLICE.exit_cost_bps / 10_000;
  const hours = Math.max(1, SLICE.hours_per_week * (days / 7));
  const time = hours * SLICE.hour_usd;
  const walletCost = gas + idle + exit;
  const cost = walletCost + time;
  const gross = basis * SLICE.capture;
  const wick = gross * SLICE.wick_fraction;
  const odds = launchChance(p.change_7d, originDays);
  // The break-even odds: the chance at which the game's expectation, gross at the top and the wick at
  // the bottom, pays every cost on the way. It is 1 when even a certain launch never covers the cost,
  // and 0 when the wick alone already does; in between it is a real share of the odds (0 to 1).
  const swing = Math.max(gross - wick, 0);
  const rawBreakEven = swing > 0 ? (cost - wick) / swing : (cost <= wick ? 0 : 1);
  const breakEven = clip(rawBreakEven, 0, 1);
  // The record rolled into one number: the launch pays the gross, a near miss the wick, either way the
  // costs are paid; and how far that expectation moves at the chance's upper bound.
  const expected = odds * gross + (1 - odds) * wick - cost;
  const atCeiling = SLICE.chance_ceiling * gross + (1 - SLICE.chance_ceiling) * wick - cost;
  const planSwing = atCeiling - expected;
  // What the plan keeps if the launch lands at the floor, and what that is worth per hour of the window.
  const net = gross - cost;
  const perHour = hours > 0 ? net / hours : net;
  let verdict: Economics['verdict'];
  let reason: string;
  const oddsText = `${Math.round(breakEven * 100)}% launch odds`;
  if (net <= 0) {
    verdict = 'Skip';
    reason = `a launch at the ${usd(basis)} floor pays ${usd(gross)} against ${usd(cost)} of cost, so the net is ${usd(net)} and no odds clear it`;
  } else if (perHour < SLICE.marginal_per_hour_usd) {
    verdict = 'Skip';
    reason = `the net is only ${usd(net)}, or ${usd(perHour)} an hour against ${usd(SLICE.hour_usd)} of the reader's time, and it needs ${oddsText} where the record reads ${Math.round(odds * 100)}%`;
  } else if (perHour < SLICE.worth_per_hour_usd) {
    verdict = 'Marginal';
    reason = `the net clears the cost at ${usd(net)}, but ${usd(perHour)} an hour is under the ${usd(SLICE.worth_per_hour_usd)} the hour is worth; it needs ${oddsText} against ${Math.round(odds * 100)}% on the record`;
  } else if (breakEven > SLICE.marginal_break_even) {
    verdict = 'Skip';
    reason = `the net is ${usd(net)}, but it needs ${oddsText} to clear ${usd(cost)}, past the ${Math.round(SLICE.marginal_break_even * 100)}% the record affords, against ${Math.round(odds * 100)}% on the record`;
  } else if (breakEven > SLICE.worth_break_even) {
    verdict = 'Marginal';
    reason = `the net is ${usd(net)} and ${usd(perHour)} an hour, but it needs ${oddsText}, past the board's best ${Math.round(SLICE.worth_break_even * 100)}%, against ${Math.round(odds * 100)}% on the record`;
  } else {
    verdict = 'Worth';
    reason = `a launch at the floor nets ${usd(net)}, or ${usd(perHour)} an hour, and needs only ${oddsText} against ${Math.round(odds * 100)}% on the record`;
  }
  return {
    kind: career.key,
    basis_usd: basis,
    basis_x: Math.round((value / Math.max(basis, 1)) * 10) / 10,
    clip_usd: clipUsd,
    band_scale: Math.round(depth * 1000) / 1000,
    capital_usd: capital,
    gas_usd: Math.round(gas),
    deposit_cost_usd: Math.round(idle),
    exit_usd: Math.round(exit),
    time_cost_usd: Math.round(time),
    cost_usd: Math.round(cost),
    wallet_cost_usd: Math.round(walletCost),
    hours: Math.round(hours * 10) / 10,
    days,
    gross_usd: Math.round(gross),
    wick_usd: Math.round(wick),
    chance: odds,
    expected_usd: Math.round(expected),
    swing_usd: Math.round(planSwing),
    net_usd: Math.round(net),
    per_hour_usd: Math.round(perHour),
    break_even: Math.round(breakEven * 1000) / 1000,
    verdict,
    reason,
  };
}

/** The odds of a launch inside the window the reader gives it: the record's growth and its age. */
export function launchChance(growthPct: number | null, originDays: number): number {
  const g = growthPct === null ? 0 : clip(growthPct, -25, 25) / 100;
  const base = SLICE.chance_floor + 0.12 * clip(originDays / 730, 0, 1) + 0.4 * g;
  return Math.round(clip(base, SLICE.chance_floor, SLICE.chance_ceiling) * 100) / 100;
}

/** A clip as a share of the protocol's own TVL, in words: "0.001% of its TVL". */
export function shareOf(amount: number, tvl: number): string {
  const pct = (amount / tvl) * 100;
  const text = pct >= 0.01 ? `${pct.toFixed(2)}%` : pct >= 0.001 ? `${pct.toFixed(3)}%` : 'under 0.001%';
  return `${text} of its TVL`;
}

/** A protocol's plan: nine concrete moves, written from its own record, and the verdict they earn. */
export function farmPlan(
  model: Comps,
  p: Protocol,
  asOf: string,
  value: number,
  originDays: number,
  ratio: number,
  ratioP10: number,
): FarmPlan {
  const career = careerOf(p.category);
  const economics = economicsFor(model, p, asOf, value, originDays, ratio, ratioP10);
  const chain = mainChain(p);
  const secondary = secondChain(p);
  const capital = usd(economics.capital_usd);
  const days = span(economics.days);
  const aged = daysBetween(p.listed_at, asOf);
  const chance = launchChance(p.change_7d, originDays);
  const odds = Math.round(chance * 100);
  const legs = legsFor(career) + SLICE.setup_legs;
  const record = aged === null
    ? `No listing day is on record, so the radar dates this protocol from the snapshot (${asOf}) and prices it at the one-year horizon: ${usd(value)} centrally, ${usd(economics.basis_usd)} at the band's low end.`
    : `DefiLlama has counted ${p.name} for ${span(aged)} without a token on record, which the radar prices at ${usd(value)} one year after its listing day: ${usd(economics.basis_usd)} at the band's low end.`;
  const growth = p.change_7d === null
    ? `The snapshot reports no seven-day change, so the growth term is flat and the odds rest on the record alone: ${odds}% over ${days}.`
    : `TVL is ${p.change_7d > 0 ? 'up' : 'down'} ${Math.abs(p.change_7d).toFixed(1)}% in seven days; with the record that puts launch odds at ${odds}% over ${days}.`;
  const steps = [
    record,
    `Its TVL is ${usd(p.tvl_usd)} on ${chain}${secondary === null ? '' : ` and ${secondary}`}, so a ${capital} deposit is ${shareOf(economics.capital_usd, p.tvl_usd)}: small enough to stay in through a bad week.`,
    `Fund a wallet on ${chain} with ${capital} alone, and keep it apart from a long-term bag so the exit is one transaction; gas on ${legs} legs, the practice deposit included, costs about ${usd(economics.gas_usd)}.`,
    `On ${chain}, ${career.action.toLowerCase()}: ${career.holds}; that balance is the campaign's whole position.`,
    `${growth} A launch at the band floor pays about ${usd(economics.gross_usd)} on that deposit, before ${usd(economics.wallet_cost_usd)} of gas, yield given up and exit.`,
    `The window is ${days} of work at ${SLICE.hours_per_week} h a week: ${career.routine.toLowerCase()}; at ${usd(SLICE.hour_usd)} an hour that time is worth ${usd(economics.time_cost_usd)}, and the plan is read with it counted.`,
    `The deposit earns nothing here that it would not earn idle: at ${(SLICE.idle_yield_per_year * 100).toFixed(1)}% a year it gives up ${usd(economics.deposit_cost_usd)} over the window, which a genuine position should beat before its token is counted.`,
    `Before the first deposit, read this lock: ${career.lock}. The main risk is this: ${career.risk.toLowerCase()}; if it happens, exit at once and write the plan off rather than adding to it.`,
    `On day ${Math.round(economics.days)}, withdraw and route out on ${chain} for about ${usd(economics.exit_usd)} of exit cost: with a near miss paying ${usd(economics.wick_usd)}, the plan needs ${Math.round(economics.break_even * 100)}% launch odds against ${odds}% on the record, and the verdict is ${economics.verdict}: ${economics.reason}.`,
  ];
  return { steps, economics };
}

/** The plan's headline numbers, for the page's summary panel. */
export function planHeadline(plans: Economics[]): { worth: number; marginal: number; skip: number; capital: number; expected: number } {
  return plans.reduce<{ worth: number; marginal: number; skip: number; capital: number; expected: number }>(
    (at, plan) => {
      at[plan.verdict === 'Worth' ? 'worth' : plan.verdict === 'Marginal' ? 'marginal' : 'skip'] += 1;
      at.capital += plan.capital_usd;
      at.expected += plan.expected_usd;
      return at;
    },
    { worth: 0, marginal: 0, skip: 0, capital: 0, expected: 0 },
  );
}

/** The bars the sweep reads off a board: the best and median break-even odds, at one decimal. */
export function barsFrom(breakEvens: number[]): { best: number; median: number } {
  const floor = (x: number) => Math.floor(x * 10) / 10;
  const sorted = [...breakEvens].sort((a, b) => a - b);
  const half = sorted.length / 2;
  const median = sorted.length % 2 === 0 ? (sorted[half - 1]! + sorted[half]!) / 2 : sorted[Math.floor(half)]!;
  return { best: floor(sorted[0] ?? 1), median: floor(median) };
}

export { recordsToken };
