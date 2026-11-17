// The farm plan: what a reader does with a protocol before its token exists, what each move costs,
// how long it holds them, and whether the plan pays for itself if the launch lands inside the band.
//
// The steps are written from the protocol's own record: its category chooses the kind of position,
// its first chain names where, its TVL sizes the clip, its age since the listing day sets how long a
// campaign can run before the horizon, and its implied value sets the price the position is read at.
// The economics are the radar's own stated assumptions (SLICE, below), not the model's claim: a plan
// is a reader's case, and the board shows it beside the value so the two can be judged apart.

import { clip, daysBetween, recordsToken } from './comps.ts';
import { careerOf, mainChain, secondChain, type Career } from './careers.ts';
import type { Comps, Protocol } from './types.ts';

/** The reader's assumptions, stated on the page: the only numbers a plan adds to the snapshot's own. */
export const SLICE = {
  season_days: 84,
  gas_per_leg_usd: 4,
  idle_yield_per_year: 0.045,
  exit_cost_bps: 15,
  hours_per_week: 1.5,
  capture: 0.01,
  chance_floor: 0.08,
  chance_ceiling: 0.5,
  wick_fraction: 0.35,
} as const;

export interface Economics {
  kind: string;
  capital_usd: number;
  cost_usd: number;
  days: number;
  gross_usd: number;
  net_usd: number;
  chance: number;
  expected_usd: number;
  break_even: number;
  per_hour_usd: number;
  verdict: 'Worth' | 'Marginal' | 'Skip';
}

export interface FarmPlan {
  steps: string[];
  economics: Economics;
}

/** A dollar figure a reader can read at a glance: $4.20M, $860k, $95. */
export function usd(x: number): string {
  const n = Math.abs(x);
  if (n >= 1e12) return `$${(x / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(x / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(x / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
  if (n >= 1e3) return `$${(x / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k`;
  return `$${Math.round(x)}`;
}

/** A span of days in the words a reader would use. */
export function span(days: number): string {
  if (days < 1.5) return `${Math.max(1, Math.round(days * 24))} h`;
  if (days < 45) return `${Math.round(days)} days`;
  if (days < 400) return `${(days / 30.44).toFixed(1)} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}

/** How much the reader can put in: a share of their capital that the protocol's depth can absorb. */
export function clipFor(tvl: number): number {
  return Math.max(250, Math.min(10_000, Math.round(tvl * 0.00002)));
}

/** The window's own length: from the plan's start to the horizon, at most a season. */
export function windowDays(originDays: number): number {
  const toHorizon = 365.25 - originDays;
  return Math.round(clip(toHorizon, 21, SLICE.season_days));
}

/** The plan's economics: the clip, its costs, what a launch inside the band pays, and the verdict. */
export function economicsFor(model: Comps, p: Protocol, asOf: string, implied: number, originDays: number): Economics {
  const career = careerOf(p.category);
  const capital = clipFor(p.tvl_usd);
  const days = windowDays(originDays);
  const legs = career.key === 'bridge' || career.key === 'chain' ? 4 : 2;
  const gas = legs * SLICE.gas_per_leg_usd;
  const idle = capital * SLICE.idle_yield_per_year * (days / 365.25);
  const exit = capital * SLICE.exit_cost_bps / 10_000;
  const cost = gas + idle + exit;
  const gross = Math.max(1, implied) * SLICE.capture;
  const breakEven = Math.min(0.95, cost / Math.max(cost + gross, 1));
  const odds = launchChance(p.change_7d, originDays);
  const net = Math.round(odds * gross - cost);
  const hours = Math.max(1, SLICE.hours_per_week * (days / 7));
  const perHour = net / hours;
  const expected = odds * net - (1 - odds) * cost;
  const verdict: Economics['verdict'] = net <= 0 || expected <= 0 ? 'Skip' : perHour >= 6 ? 'Worth' : 'Marginal';
  return {
    kind: career.key,
    capital_usd: capital,
    cost_usd: Math.round(cost),
    days,
    gross_usd: Math.round(gross),
    net_usd: net,
    chance: odds,
    expected_usd: Math.round(expected),
    break_even: Math.round(breakEven * 1000) / 1000,
    per_hour_usd: Math.round(perHour * 10) / 10,
    verdict,
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

/** A protocol's plan: nine concrete moves, written from its own record. */
export function farmPlan(model: Comps, p: Protocol, asOf: string, implied: number, originDays: number): FarmPlan {
  const career = careerOf(p.category);
  const economics = economicsFor(model, p, asOf, implied, originDays);
  const chain = mainChain(p);
  const secondary = secondChain(p);
  const capital = usd(economics.capital_usd);
  const days = span(economics.days);
  const aged = daysBetween(p.listed_at, asOf);
  const chance = launchChance(p.change_7d, originDays);
  const odds = Math.round(chance * 100);
  const record = aged === null
    ? `No listing day is on record, so the radar dates this protocol from the snapshot (${asOf}) and prices it at the one-year horizon: ${usd(implied)}.`
    : `DefiLlama has counted ${p.name} for ${span(aged)} without a token on record, which the radar prices at ${usd(implied)} one year after its listing day.`;
  const growth = p.change_7d === null
    ? `The snapshot reports no seven-day change, so the growth term is flat and the plan's odds rest on the record alone: ${odds}% over ${days}.`
    : `TVL is ${p.change_7d > 0 ? 'up' : 'down'} ${Math.abs(p.change_7d).toFixed(1)}% in seven days, which lifts or trims the cover; it sets the plan's launch odds at ${odds}% over ${days}.`;
  const steps = [
    record,
    `Its TVL is ${usd(p.tvl_usd)} on ${chain}${secondary === null ? '' : ` and ${secondary}`}, so a ${capital} clip is ${shareOf(economics.capital_usd, p.tvl_usd)}: small enough to stay in through a bad week.`,
    `Fund a wallet on ${chain} with ${capital} alone, and keep it apart from a long-term bag so the exit is one transaction.`,
    `On ${chain}, ${career.action.toLowerCase()}: ${career.holds}; that balance is the campaign's whole position.`,
    `${growth} A launch inside the radar's band pays about ${usd(economics.gross_usd)} on that clip, before ${usd(economics.cost_usd)} of gas, idle cost and exit.`,
    `The work: ${career.routine.toLowerCase()}, for ${days}, at ${SLICE.hours_per_week} h a week, and log every transaction with its date and size.`,
    `Before the first deposit, read this lock: ${career.lock}. A locked position cannot be unwound inside the window.`,
    `The plan's main risk is this: ${career.risk.toLowerCase()}. If it happens, exit at once and write the plan off rather than adding to it.`,
    `On day ${Math.round(economics.days)}, withdraw and route out on ${chain} for about ${usd(economics.capital_usd * SLICE.exit_cost_bps / 10_000)} of exit cost. Expected value at ${odds}% odds is ${usd(economics.expected_usd)}; the deposit is all you hold until a launch names it.`,
  ];
  return { steps, economics };
}

/** The plan's three headline numbers, for the page's summary panel. */
export function planHeadline(plans: Economics[]): { worth: number; marginal: number; skip: number; capital: number; net: number } {
  return plans.reduce<{ worth: number; marginal: number; skip: number; capital: number; net: number }>(
    (at, plan) => {
      at[plan.verdict === 'Worth' ? 'worth' : plan.verdict === 'Marginal' ? 'marginal' : 'skip'] += 1;
      at.capital += plan.capital_usd;
      at.net += plan.net_usd;
      return at;
    },
    { worth: 0, marginal: 0, skip: 0, capital: 0, net: 0 },
  );
}

export { recordsToken };
