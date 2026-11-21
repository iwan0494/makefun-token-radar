// The farm plan's economics: a small clip of TVL, costed to the dollar
// against a launch at the band floor. Every number on the page comes from
// the row's own figures; the verdict turns on the net, the net per hour and
// the break-even odds, with the break-even cap tested before the hourly rate.

export type Verdict = 'Worth' | 'Marginal' | 'Skip';

export const SLICE = 0.0012;
export const CLIP_SHARE = 0.0005;
export const CLIP_MIN_USD = 100;
export const CLIP_MAX_USD = 2000;
export const GAS_PER_LEG_USD = 4;
export const LEGS = 3;
export const IDLE_YIELD = 0.045;
export const EXIT_BPS = 0.0015;
export const HOURS_PER_WEEK = 1.5;
export const HOURLY_RATE_USD = 20;
export const WORTH_HOURLY_USD = 20;
export const WORTH_BREAK_EVEN = 0.3;
export const MARGINAL_HOURLY_USD = 6;
export const MARGINAL_BREAK_EVEN = 0.6;
export const SEASON_MAX_DAYS = 84;
export const SEASON_MIN_DAYS = 21;

export interface FarmInput {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvlUsd: number;
  change7d: number | null;
  ageYears: number | null;
  listedAt: string | null;
  impliedValueUsd: number;
  bandLoUsd: number;
}

export interface FarmPlan {
  deposit: number;
  gas: number;
  idle: number;
  exitFee: number;
  timeCost: number;
  hours: number;
  gross: number;
  cost: number;
  net: number;
  perHour: number;
  breakEven: number;
  odds: number;
  windowDays: number;
  ageDays: number;
  verdict: Verdict;
  steps: string[];
  money: string;
}

/** Dollars, short: $2.76B, $320.2M, $310k, $2.0k, $884. */
export function fmtUsd(x: number): string {
  if (!Number.isFinite(x)) return '$0';
  const sign = x < 0 ? '-' : '';
  const v = Math.abs(x);
  if (v >= 1e9) return `${sign}$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${sign}$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e4) return `${sign}$${Math.round(v / 1e3)}k`;
  if (v >= 1e3) return `${sign}$${(v / 1e3).toFixed(1)}k`;
  if (v >= 100) return `${sign}$${Math.round(v)}`;
  if (v >= 1) return `${sign}$${Math.round(v)}`;
  return `${sign}$${v.toFixed(2)}`;
}

/** Days of work: until a year past listing, at most a 12-week season. */
export function windowDays(listedAt: string | null, asOf: string): number {
  if (listedAt === null) return SEASON_MAX_DAYS;
  const horizon = Date.parse(`${listedAt}T00:00:00Z`) + 365.25 * 24 * 60 * 60 * 1000;
  const now = Date.parse(`${asOf}T00:00:00Z`);
  const days = (horizon - now) / (24 * 60 * 60 * 1000);
  return Math.max(SEASON_MIN_DAYS, Math.min(SEASON_MAX_DAYS, Math.floor(days)));
}

/**
 * Launch odds on the record: an 8% floor, up to 12 points for two years of
 * age, and up to 10 points either way for seven-day growth. Rounded to two
 * decimals here; the board shows one.
 */
export function launchChance(growthPct: number, originDays: number): number {
  const g = Math.max(-25, Math.min(25, growthPct)) / 100;
  const base = 0.08 + 0.12 * Math.max(0, Math.min(1, originDays / 730)) + 0.4 * g;
  return Math.round(Math.max(0.08, Math.min(0.5, base)) * 100) / 100;
}

function ageDays(ageYears: number | null, listedAt: string | null, asOf: string): number {
  if (ageYears !== null) return Math.round(ageYears * 365.25);
  if (listedAt === null) return 0;
  return Math.max(0, Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${listedAt}T00:00:00Z`)) / (24 * 60 * 60 * 1000)));
}

function ageText(ageYears: number | null): string {
  if (ageYears === null) return 'an unlisted stretch';
  if (ageYears < 1) return `${Math.max(1, Math.round(ageYears * 12))} months`;
  return `${ageYears.toFixed(1)} years`;
}

/** What the deposit does in the protocol, by the protocol's category. */
const CAREERS: Record<string, string> = {
  Dexs: 'provide the pair',
  Lending: 'lend the deposit',
  CDP: 'open the vault',
  'CDP Manager': 'open the managed vault',
  Yield: 'stake the deposit in the vault',
  'Yield Aggregator': 'stake the deposit in the vault',
  'Risk Curators': 'place the deposit with the curator vault',
  'Onchain Capital Allocator': 'allocate the deposit through the vault',
  'Liquid Staking': 'stake the deposit',
  'Liquid Restaking': 'restake the deposit',
  Chain: 'bridge the deposit to the chain and use the protocol',
  'Prediction Market': 'back the market with the deposit',
  RWA: 'take the tokenized position',
  Derivatives: 'open the position',
  'Collateral Markets': 'post the deposit as collateral',
  'Basis Trading': 'fund the basis trade',
};

function careerOf(category: string): string {
  return CAREERS[category] ?? 'use the deposit with the protocol';
}

/** The plan for one row: its money, its verdict, its nine moves. */
export function planFor(input: FarmInput, asOf: string): FarmPlan {
  const chain = input.chains[0] ?? 'Ethereum';
  const chainText = input.chains.length > 1 ? input.chains.join(' and ') : chain;
  const deposit = Math.max(CLIP_MIN_USD, Math.min(CLIP_MAX_USD, CLIP_SHARE * input.tvlUsd));
  const share = (deposit / Math.max(1, input.tvlUsd)) * 100;
  // Never print a share that rounds to zero: below a thousandth of a
  // percent the deposit is "<0.001%", not "0.000%".
  const shareText = share < 0.001 ? '<0.001' : share < 0.01 ? share.toFixed(3) : share.toFixed(2);
  const window = windowDays(input.listedAt, asOf);
  const hours = (window / 7) * HOURS_PER_WEEK;
  const gas = LEGS * GAS_PER_LEG_USD;
  const idle = deposit * IDLE_YIELD * (window / 365.25);
  const gross = input.bandLoUsd * SLICE;
  const exitFee = gross * EXIT_BPS;
  const timeCost = hours * HOURLY_RATE_USD;
  const cost = gas + idle + exitFee + timeCost;
  const net = gross - cost;
  const perHour = hours > 0 ? net / hours : 0;
  const breakEven = gross > 0 ? cost / gross : Infinity;
  const growthPct = (input.change7d ?? 0) * 100;
  const originDays = ageDays(input.ageYears, input.listedAt, asOf);
  const odds = launchChance(growthPct, originDays);
  const verdict: Verdict =
    perHour >= WORTH_HOURLY_USD && breakEven <= WORTH_BREAK_EVEN
      ? 'Worth'
      : perHour >= MARGINAL_HOURLY_USD && breakEven <= MARGINAL_BREAK_EVEN
        ? 'Marginal'
        : 'Skip';
  const up = growthPct >= 0;
  const growthText = `TVL is ${up ? 'up' : 'down'} ${Math.abs(growthPct).toFixed(1)}% in seven days`;
  const steps = [
    `Counted ${ageText(input.ageYears)} with no token; priced ${fmtUsd(input.impliedValueUsd)} a year after listing, ${fmtUsd(input.bandLoUsd)} at the floor.`,
    `TVL ${fmtUsd(input.tvlUsd)} on ${chainText}; a ${fmtUsd(deposit)} deposit is ${shareText}% of its TVL.`,
    `Fund one ${chain} wallet with ${fmtUsd(deposit)} alone, apart from a long-term bag; gas on ${LEGS} legs costs about ${fmtUsd(gas)}.`,
    `On ${chain}, ${careerOf(input.category)}; the position balance is the whole position.`,
    `${growthText}; odds ${(odds * 100).toFixed(1)}% over ${window} days. A launch at the floor pays about ${fmtUsd(gross)} on that deposit.`,
    `${window} days of work at ${HOURS_PER_WEEK} h a week; check the position weekly; time worth ${fmtUsd(timeCost)}.`,
    `Idle at ${(IDLE_YIELD * 100).toFixed(1)}% a year gives up ${fmtUsd(idle)} over the window; beat that first.`,
    `First read the lock: the withdrawal terms and the fee. Main risk: the terms change before the window ends; if it hits, exit at once.`,
    `Day ${window}: withdraw on ${chain} for ${fmtUsd(exitFee)}; needs ${(breakEven * 100).toFixed(1)}% odds vs ${(odds * 100).toFixed(1)}% — ${verdict}.`,
  ];
  const money =
    `Capital ${fmtUsd(deposit)} · ${shareText}% of its TVL — gross ${fmtUsd(gross)}, cost ${fmtUsd(cost)}, net ${fmtUsd(net)}, ${fmtUsd(perHour)}/h. ` +
    `It nets ${fmtUsd(net)}, or ${fmtUsd(perHour)} an hour, and needs only ${(breakEven * 100).toFixed(1)}% launch odds against ${(odds * 100).toFixed(1)}% on the record.`;
  return { deposit, gas, idle, exitFee, timeCost, hours, gross, cost, net, perHour, breakEven, odds, windowDays: window, ageDays: originDays, verdict, steps, money };
}
