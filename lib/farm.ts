// The farm plan: what a reader does with a protocol before its token exists,
// what each move costs, how long it holds them, and whether the plan pays for
// itself if the launch lands inside the band.
//
// The payoff is a fixed share of the value a launch at the band floor names for
// the protocol, and the floor is the row's OWN pool depth: the fitted cover its
// TVL supports, never the fit's central ratio. A row whose central record already
// sits below the floor keeps its own (lower) value; a row the record marks far
// above its depth is cut back to that depth.
//
// The cost is what a reader actually spends (gas on every leg, the yield the
// deposit would have earned elsewhere, the exit, and an hourly price on their
// time), and the net is what the plan keeps when the launch lands at the floor.
// The verdict turns on three facts, each read off that row: the net must be
// positive, the net per hour must clear the reader's hourly price, and the
// break-even odds must clear the bar the sweep prints for Worth and Marginal.
//
// The steps are short on purpose: nine of them must fit one detail sheet with
// no scrolling, so each is one sentence, sixty to a hundred and twenty
// characters, written from the protocol's own record.

import { ageYears, clip, daysBetween, familyOf, span, usd, type Protocol } from './data.ts';
import type { Model } from './model.ts';

/** The reader's assumptions, stated on the page: the only numbers a plan adds to the snapshot's own. */
export const SLICE = {
  season_days: 84,
  gas_per_leg_usd: 4,
  idle_yield_per_year: 0.045,
  exit_cost_bps: 15,
  hours_per_week: 1.5,
  /** The share of the band-floor value a reader's clip names, if the launch lands and names it. */
  capture: 0.0012,
  chance_floor: 0.08,
  chance_ceiling: 0.5,
  /** What a near miss pays: nothing. A token that lands below the band pays this clip nothing — the
   * deposit itself comes back on exit, only the gas, yield given up, exit and time are lost. */
  wick_fraction: 0,
  /** The band's half-width in logs: the same range the board prices every row's low/high band at. */
  band_log: 0.9,
  /** What an hour of the reader's time is worth, in whole dollars. */
  hour_usd: 20,
  /** Worth: net per hour must clear this — the reader's stated hourly price. */
  worth_per_hour_usd: 20,
  /** Marginal: net per hour must clear this — a third of the reader's time, priced. */
  marginal_per_hour_usd: 6,
  /** Worth: a break-even odds no worse than this. */
  worth_break_even: 0.3,
  /** Marginal: a break-even odds no worse than this. */
  marginal_break_even: 0.6,
  /** The least the deposit costs whatever path the reader takes: an account on the
   * protocol's chain and the practice deposit it takes to learn the withdraw. */
  setup_legs: 1,
  /** The deposit's floor and ceiling in dollars: a reader's clip, not a whale's. */
  clip_min_usd: 100,
  clip_max_usd: 2_000,
  /** The share of the protocol's own TVL a deposit names, before the floor and ceiling. */
  clip_share: 0.0005,
} as const;

export interface Economics {
  kind: string;
  basis_usd: number;
  basis_x: number;
  clip_usd: number;
  band_scale: number;
  capital_usd: number;
  gas_usd: number;
  deposit_cost_usd: number;
  exit_usd: number;
  time_cost_usd: number;
  cost_usd: number;
  wallet_cost_usd: number;
  hours: number;
  days: number;
  gross_usd: number;
  wick_usd: number;
  chance: number;
  expected_usd: number;
  swing_usd: number;
  net_usd: number;
  per_hour_usd: number;
  break_even: number;
  verdict: 'Worth' | 'Marginal' | 'Skip';
  reason: string;
}

export interface FarmPlan {
  steps: string[];
  economics: Economics;
}

export interface Career {
  key: string;
  action: string;
  holds: string;
  routine: string;
  lock: string;
  risk: string;
}

/** What the position is, by what the protocol does: one line each, no more. */
export const CAREERS: Record<string, Career> = {
  lending: { key: 'lending', action: 'Lend the deposit', holds: 'the receipt token is the whole position', routine: 'check the rate and the health factor weekly', lock: 'the borrow cap and the liquidation threshold', risk: 'a rate spike liquidates the position' },
  dexs: { key: 'dexs', action: 'Add the deposit to the pool', holds: 'the LP share is the whole position', routine: 'check the pool share and the fees weekly', lock: 'the pool fee tier and the price range', risk: 'impermanent loss outruns the fees' },
  bridge: { key: 'bridge', action: 'Bridge the deposit across', holds: 'the bridged balance is the whole position', routine: 'check the bridge finality weekly', lock: 'the bridge pause switch and the daily cap', risk: 'a bridge halt strands the deposit' },
  chain: { key: 'chain', action: 'Stake the deposit on the chain', holds: 'the staked balance is the whole position', routine: 'check the validator set weekly', lock: 'the unbonding wait and the slash rules', risk: 'a validator fault slashes the stake' },
  liquid: { key: 'liquid', action: 'Stake the deposit in the pool', holds: 'the receipt token is the whole position', routine: 'check the peg and the yield weekly', lock: 'the withdrawal queue and the peg', risk: 'a depeg strands the receipt token' },
  yield: { key: 'yield', action: 'Deposit into the vault', holds: 'the vault share is the whole position', routine: 'check the vault share price weekly', lock: 'the strategy cap and the withdrawal fee', risk: 'the strategy underperforms the idle yield' },
  restaking: { key: 'restaking', action: 'Restake the deposit', holds: 'the restaked balance is the whole position', routine: 'check the operators weekly', lock: 'the slashing conditions and the queue', risk: 'an operator fault slashes the stake' },
  default: { key: 'default', action: 'Use the deposit in the protocol', holds: 'the position balance is the whole position', routine: 'check the position weekly', lock: 'the withdrawal terms and the fee', risk: 'the terms change before the window ends' },
};

export function careerOf(p: Protocol): Career {
  const fam = familyOf(p);
  if (fam === 'lending' || fam === 'cdp') return CAREERS.lending;
  if (fam === 'dexs' || fam === 'derivatives') return CAREERS.dexs;
  if (fam === 'bridge' || fam === 'cross' || fam === 'canonical') return CAREERS.bridge;
  if (fam === 'chain') return CAREERS.chain;
  if (fam === 'liquid' || fam === 'staking') return CAREERS.liquid;
  if (fam === 'yield' || fam === 'leveraged') return CAREERS.yield;
  if (fam === 'restaking') return CAREERS.restaking;
  return CAREERS.default;
}

export function mainChain(p: Protocol): string {
  return p.chains[0] ?? 'Ethereum';
}

export function secondChain(p: Protocol): string | null {
  return p.chains.length > 1 ? p.chains[1] : null;
}

/** The legs a position takes: a bridge or a chain asks the reader to move in and out on each side. */
export function legsFor(career: Career): number {
  return career.key === 'bridge' || career.key === 'chain' ? 4 : 2;
}

/** How much the plan covers: a fixed share of the protocol's own depth, kept between a clip's floor and ceiling. */
export function clipFor(tvl: number): number {
  return Math.max(SLICE.clip_min_usd, Math.min(SLICE.clip_max_usd, Math.round(tvl * SLICE.clip_share)));
}

/** The window's own length: from the plan's start to the horizon, at most a season. */
export function windowDays(originDays: number): number {
  const toHorizon = 365.25 - originDays;
  return Math.round(clip(toHorizon, 21, SLICE.season_days));
}

/** The pool depth the record supports at the band's low end, over the pool it records. */
export function depthScale(model: Model, p: Protocol, tvlLog: number): number {
  const cat = model.category.find((t) => t.key === (p.category ?? 'unknown'));
  const fam = model.family.find((t) => t.key === familyOf(p));
  const supportedLog =
    model.line.a + model.line.b * tvlLog + (cat?.value ?? 0) + (fam?.value ?? 0) - SLICE.band_log;
  const ownLog = Math.log(Math.max(p.tvl_usd, 1));
  return clip(Math.exp(Math.min(ownLog, supportedLog) - ownLog), 0.02, 1);
}

/** The value a plan is read at: the pool at the band floor, times the cover at the band floor. */
export function basisAt(model: Model, p: Protocol, tvlLog: number, ratio: number): number {
  const depth = depthScale(model, p, tvlLog);
  const cover = clip(ratio, model.ratioP10, Math.exp(Math.log(model.ratioP10) + SLICE.band_log));
  return Math.max(1, Math.round(p.tvl_usd * depth * cover));
}

/** A clip as a share of the protocol's own TVL, in words: "0.001% of its TVL". */
export function shareOf(amount: number, tvl: number): string {
  const pct = (amount / tvl) * 100;
  const text = pct >= 0.01 ? `${pct.toFixed(2)}%` : pct >= 0.001 ? `${pct.toFixed(3)}%` : 'under 0.001%';
  return `${text} of its TVL`;
}

/** Odds with one decimal: 15.6%, never rounded to a false tie. */
export function pct1(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/** A share of odds in words, with one decimal, never rounded to a false 0%: 4.5%, 0.1%, <0.1%. */
export function pctOdds(x: number): string {
  if (x <= 0) return '0%';
  if (x < 0.0005) return '<0.1%';
  return `${(x * 100).toFixed(1)}%`;
}

/** The odds of a launch inside the window the reader gives it: the record's growth and its age. */
export function launchChance(growthPct: number | null, originDays: number): number {
  const g = clip(growthPct ?? 0, -25, 25) / 100;
  const base = SLICE.chance_floor + 0.12 * clip(originDays / 730, 0, 1) + 0.4 * g;
  return Math.round(clip(base, SLICE.chance_floor, SLICE.chance_ceiling) * 1000) / 1000;
}

/**
 * The plan's economics: the deposit, what each part of the campaign costs, what a
 * launch at the band floor pays, and the verdict. `value` is the row's central
 * implied value, `ratio` the fitted cover; `ratioP10` bounds the floor from below.
 */
export function economicsFor(
  model: Model,
  p: Protocol,
  asOf: string,
  value: number,
  originDays: number,
  ratio: number,
): Economics {
  const career = careerOf(p);
  const tvlLog = Math.log(Math.max(p.tvl_usd, 1));
  const depth = depthScale(model, p, tvlLog);
  const basis = basisAt(model, p, tvlLog, ratio);
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
  const swing = Math.max(gross - wick, 0);
  const rawBreakEven = swing > 0 ? (cost - wick) / swing : cost <= wick ? 0 : 1;
  const breakEven = clip(rawBreakEven, 0, 1);
  const expected = odds * gross + (1 - odds) * wick - cost;
  const atCeiling = SLICE.chance_ceiling * gross + (1 - SLICE.chance_ceiling) * wick - cost;
  const planSwing = atCeiling - expected;
  const net = gross - cost;
  const perHour = hours > 0 ? net / hours : net;
  const oddsText = `${pctOdds(breakEven)} launch odds`;
  let verdict: Economics['verdict'];
  let reason: string;
  if (net <= 0) {
    verdict = 'Skip';
    reason = `a launch at the ${usd(basis)} floor pays ${usd(gross)} against ${usd(cost)} of cost, so the net is ${usd(net)} and no odds clear it`;
  } else if (perHour < SLICE.marginal_per_hour_usd) {
    verdict = 'Skip';
    reason = `the net is only ${usd(net)}, or ${usd(perHour)} an hour against ${usd(SLICE.hour_usd)} of the reader's time, and it needs ${oddsText} where the record reads ${pct1(odds)}`;
  } else if (breakEven > SLICE.marginal_break_even) {
    verdict = 'Skip';
    reason = `the net is ${usd(net)}, but it needs ${oddsText} to clear ${usd(cost)}, past the ${Math.round(SLICE.marginal_break_even * 100)}% the record affords, against ${pct1(odds)} on the record`;
  } else if (perHour < SLICE.worth_per_hour_usd) {
    verdict = 'Marginal';
    reason = `the net clears the cost at ${usd(net)}, but ${usd(perHour)} an hour is under the ${usd(SLICE.worth_per_hour_usd)} the hour is worth; it needs ${oddsText} against ${pct1(odds)} on the record`;
  } else if (breakEven > SLICE.worth_break_even) {
    verdict = 'Marginal';
    reason = `the net is ${usd(net)} and ${usd(perHour)} an hour, but it needs ${oddsText}, past the board's best ${Math.round(SLICE.worth_break_even * 100)}%, against ${pct1(odds)} on the record`;
  } else {
    verdict = 'Worth';
    reason = `a launch at the floor nets ${usd(net)}, or ${usd(perHour)} an hour, and needs only ${oddsText} against ${pct1(odds)} on the record`;
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

/** A protocol's plan: nine concrete moves, one sentence each, written from its own record. */
export function farmPlan(
  model: Model,
  p: Protocol,
  asOf: string,
  value: number,
  originDays: number,
  ratio: number,
): FarmPlan {
  const career = careerOf(p);
  const economics = economicsFor(model, p, asOf, value, originDays, ratio);
  const chain = mainChain(p);
  const secondary = secondChain(p);
  const capital = usd(economics.capital_usd);
  const days = span(economics.days);
  const aged = daysBetween(p.listed_at, asOf);
  const chance = launchChance(p.change_7d, originDays);
  const odds = pct1(chance);
  const legs = legsFor(career) + SLICE.setup_legs;
  const record =
    aged === null
      ? `No listing day is on record; priced ${usd(value)} at the one-year horizon, ${usd(economics.basis_usd)} at the floor.`
      : `Counted ${span(aged)} with no token; priced ${usd(value)} a year after listing, ${usd(economics.basis_usd)} at the floor.`;
  const growth =
    p.change_7d === null
      ? `No seven-day change is reported, so growth is flat and odds rest on the record: ${odds} over ${days}.`
      : Math.abs(p.change_7d) < 0.05
        ? `TVL is flat over seven days; with the record that puts launch odds at ${odds} over ${days}.`
        : `TVL is ${p.change_7d > 0 ? 'up' : 'down'} ${Math.abs(p.change_7d).toFixed(1)}% in seven days; odds ${odds} over ${days}.`;
  const steps = [
    record,
    `TVL ${usd(p.tvl_usd)} on ${chain}${secondary === null ? '' : ` and ${secondary}`}; a ${capital} deposit is ${shareOf(economics.capital_usd, p.tvl_usd)}.`,
    `Fund one ${chain} wallet with ${capital} alone, apart from a long-term bag; gas on ${legs} legs costs about ${usd(economics.gas_usd)}.`,
    `On ${chain}, ${career.action.toLowerCase()}: ${career.holds}.`,
    `${growth} A launch at the floor pays about ${usd(economics.gross_usd)} on that deposit.`,
    `${days} of work at ${SLICE.hours_per_week} h a week: ${career.routine.toLowerCase()}; time worth ${usd(economics.time_cost_usd)}.`,
    `Idle at ${(SLICE.idle_yield_per_year * 100).toFixed(1)}% a year gives up ${usd(economics.deposit_cost_usd)} over the window; beat that first.`,
    `First read the lock: ${career.lock}. Main risk: ${career.risk.toLowerCase()}; if it hits, exit at once.`,
    `Day ${Math.round(economics.days)}: withdraw on ${chain} for ${usd(economics.exit_usd)}; needs ${pctOdds(economics.break_even)} odds vs ${odds} — ${economics.verdict}.`,
  ];
  return { steps, economics };
}

/** The plan's headline numbers, for the page's summary panel. */
export function planHeadline(plans: Economics[]): { worth: number; marginal: number; skip: number; capital: number; expected: number } {
  return plans.reduce(
    (at, plan) => {
      at[plan.verdict === 'Worth' ? 'worth' : plan.verdict === 'Marginal' ? 'marginal' : 'skip'] += 1;
      at.capital += plan.capital_usd;
      at.expected += plan.expected_usd;
      return at;
    },
    { worth: 0, marginal: 0, skip: 0, capital: 0, expected: 0 },
  );
}
