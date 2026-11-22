// Launch Radar R6 — the model: one sealed snapshot in, one ranked board out.
//
// The board prices every pre-token protocol the snapshot carries, except the
// ones the watchlist rule itself sets aside (a wrapped, staked or bridged
// product of a token that already trades, a versioned pool, an exchange):
// 198 rows priced, 144 set aside, 416 already trading, 758 accounted.
//
// Value comes from the protocols that already launched. Sixty comps —
// token-bearing protocols with a market cap, a 7-day change and a listing
// date, whose market cap sits between 0.1x and 20x their TVL (outside that
// band the ratio is a data quirk, not a price) — fit one OLS regression:
//
//   log(mcap) = b0 + b1*log(TVL) + b2*growth + b3*recordYears + b4*log(1+chains)
//
// growth is the 7-day TVL change as a fraction, clamped to [-0.6, 1.2];
// recordYears is the years since DefiLlama first listed the protocol with
// no token on record. The fit runs at runtime, from the snapshot, so a new
// snapshot re-prices the board instead of replaying old coefficients.
// Validation is computed the same way, in the same run: leave-one-out over
// the 60 comps, a blind test (fit the 28 earliest-listed comps, predict the
// 32 most recent), and a walk-forward (fit the first 16 listed, then predict
// each next comp in listing order, 44 predictions). A prediction counts when
// it lands within 3x of the real market cap.
//
// A row's launch odds are the model's score, not a measured probability:
// a logistic of the same figures (implied value, growth, record years,
// chains). The tier reads the 0-100 score, so the rows the model most wants
// farmed sit at the top of the board: Worth at a score of 72 or more,
// Marginal at 50 or more, Skip below that. The score (0-100) blends the
// row's implied percentile with its odds; the heat (cold/watch/warm/hot)
// reads the score. The implied/TVL ratio stays visible as its own column
// and in each row's reason, so a big protocol with a thin ratio is never
// hidden. Nothing is special-cased by name: the same functions score
// every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The five fitted coefficients of log(mcap). */
export interface ModelCoefficients {
  intercept: number;
  log_tvl: number;
  growth: number;
  record_years: number;
  log_chains: number;
}

export const MODEL_VERSION = 'radar-6';
/** Comps whose market cap is outside 0.1x-20x TVL are set aside as outliers. */
export const RATIO_LO = 0.1;
export const RATIO_HI = 20;
/** Worth: a score of 72 or more. Marginal: a score of 50 or more. */
export const WORTH_SCORE = 72;
export const MARGINAL_SCORE = 50;
/** Blind test: fit the earliest 28 comps, predict the 32 most recent. */
export const BLIND_TEST_N = 32;
/** Walk-forward: fit the first 16 listed comps, predict each one after. */
export const WF_START = 16;
/** Bootstrap refits behind each row's rank range. */
export const REFITS = 50;
export const REFIT_SEED = 20261114;
/** Live-token view: the largest market caps, set aside from the ranking. */
export const LIVE_ROWS = 24;

/** Categories the watchlist rule sets aside, and the board with it. */
export const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    growth_pct: number;
    record_years: number;
    age_days: number | null;
    predicted_log_mcap: number;
    ratio: number;
  };
  odds_pct: number;
  score: number;
  tier: 'Worth' | 'Marginal' | 'Skip';
  heat: 'cold' | 'watch' | 'warm' | 'hot';
  reason: string;
  rank_lo: number;
  rank_hi: number;
  capital_usd: number;
  gas_usd: number;
  expected_value_usd: number;
  farm_steps: string[];
}

/** The dashboard's compact view of one row, farm plan included. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  ratio: number;
  odds_pct: number;
  score: number;
  tier: 'Worth' | 'Marginal' | 'Skip';
  heat: 'cold' | 'watch' | 'warm' | 'hot';
  reason: string;
  rank_lo: number;
  rank_hi: number;
  capital_usd: number;
  gas_usd: number;
  expected_value_usd: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** A pre-token protocol the board sets aside, and why. */
export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** One validation run: how many predictions landed within 3x, and the median miss. */
export interface ValidationRun {
  n: number;
  within: number;
  pct: number;
  median_miss: number;
}

/** One scatter point: a comp's real market cap against a prediction. */
export interface ScatterPoint {
  slug: string;
  actual_usd: number;
  predicted_usd: number;
  series: 'loo' | 'blind' | 'walk-forward';
}

/** Everything the dashboard needs: the board, the live set, the set-aside, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelCoefficients;
  model_version: string;
  comps_n: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  setaside_size: number;
  accounting: { total: number; trade: number; set_aside: number; priced: number; watchlist: number };
  tiers: { worth: number; marginal: number; skip: number };
  validation: { loo: ValidationRun; blind: ValidationRun; walk_forward: ValidationRun };
  scatter: ScatterPoint[];
  rows: RadarRow[];
  live: LiveRow[];
  setaside: SetAsideRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const LOG3 = Math.log(3);

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Record years with no token: the age in years, 1.0 when the listing date is unknown. */
export function recordYears(asOf: string, listedAt: string | null): number {
  const age = ageDays(asOf, listedAt);
  return age === null ? 1.0 : age / 365;
}

/** The 7-day growth as a fraction, clamped the way the starter clamps it. */
export function growthOf(p: SnapshotProtocol): number {
  return Math.min(1.2, Math.max(-0.6, finite(p.change_7d, 0) / 100));
}

/** The five features of one protocol, in the regression's order. */
export function features(p: SnapshotProtocol, asOf: string): number[] {
  return [1, Math.log(p.tvl_usd), growthOf(p), recordYears(asOf, p.listed_at), Math.log(1 + p.chains.length)];
}

/** Solve A x = b by Gauss-Jordan with partial pivoting; null when singular. */
function solve(aIn: number[][], bIn: number[]): number[] | null {
  const n = bIn.length;
  const a = aIn.map((row, i) => [...row, bIn[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[piv]![col]!)) piv = r;
    if (Math.abs(a[piv]![col]!) < 1e-12) return null;
    const tmp = a[col]!;
    a[col] = a[piv]!;
    a[piv] = tmp;
    const div = a[col]![col]!;
    for (let j = col; j <= n; j++) a[col]![j]! /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r]![col]!;
      if (f === 0) continue;
      for (let j = col; j <= n; j++) a[r]![j]! -= f * a[col]![j]!;
    }
  }
  return a.map((row) => row[n]!);
}

/** Ordinary least squares on [features -> log(mcap)] for the given protocols. */
export function fitOls(rows: SnapshotProtocol[], asOf: string): ModelCoefficients | null {
  const k = 5;
  const xtx: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty: number[] = new Array<number>(k).fill(0);
  for (const p of rows) {
    const x = features(p, asOf);
    const y = Math.log(p.mcap_usd!);
    for (let i = 0; i < k; i++) {
      xty[i]! += x[i]! * y;
      for (let j = 0; j < k; j++) xtx[i]![j]! += x[i]! * x[j]!;
    }
  }
  // A hair of ridge keeps the normal equations solvable on any snapshot.
  for (let i = 0; i < k; i++) xtx[i]![i]! += 1e-9;
  const beta = solve(xtx, xty);
  if (beta === null) return null;
  return { intercept: beta[0]!, log_tvl: beta[1]!, growth: beta[2]!, record_years: beta[3]!, log_chains: beta[4]! };
}

/** The fitted log market cap of one protocol. */
export function predictLog(beta: ModelCoefficients, p: SnapshotProtocol, asOf: string): number {
  const x = features(p, asOf);
  return beta.intercept * x[0]! + beta.log_tvl * x[1]! + beta.growth * x[2]! + beta.record_years * x[3]! + beta.log_chains * x[4]!;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Why a pre-token protocol is set aside, or null when the board may price it. */
export function setAsideReason(p: SnapshotProtocol): string | null {
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return `set aside: ${p.category} is a wrapped, staked or bridged product, not a launch of its own`;
  if (VERSIONED.test(p.name)) return 'set aside: a versioned pool of another protocol';
  if (WRAPPED.test(p.name)) return 'set aside: a wrapped or staked product of a token that already trades';
  return null;
}

/** The comps: token-bearing protocols with a price, a change and a listing date, ratio in band. */
export function compsOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) =>
      p.mcap_usd !== null &&
      p.mcap_usd > 0 &&
      p.change_7d !== null &&
      p.listed_at !== null &&
      p.mcap_usd / p.tvl_usd >= RATIO_LO &&
      p.mcap_usd / p.tvl_usd <= RATIO_HI,
  );
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function runStats(beta: ModelCoefficients, rows: SnapshotProtocol[], asOf: string, series: ScatterPoint['series'], scatter: ScatterPoint[]): ValidationRun {
  let within = 0;
  const misses: number[] = [];
  for (const p of rows) {
    const pred = Math.exp(predictLog(beta, p, asOf));
    scatter.push({ slug: p.slug, actual_usd: p.mcap_usd!, predicted_usd: Math.round(pred), series });
    const err = Math.abs(Math.log(pred) - Math.log(p.mcap_usd!));
    misses.push(Math.exp(err));
    if (err <= LOG3) within++;
  }
  return { n: rows.length, within, pct: rows.length === 0 ? 0 : (within / rows.length) * 100, median_miss: median(misses) };
}

/** Leave-one-out over the comps: fit on all but one, predict the one left out. */
export function looValidation(comps: SnapshotProtocol[], asOf: string, scatter: ScatterPoint[]): ValidationRun {
  let within = 0;
  const misses: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const beta = fitOls(train, asOf);
    if (beta === null) continue;
    const p = comps[i]!;
    const pred = Math.exp(predictLog(beta, p, asOf));
    scatter.push({ slug: p.slug, actual_usd: p.mcap_usd!, predicted_usd: Math.round(pred), series: 'loo' });
    const err = Math.abs(Math.log(pred) - Math.log(p.mcap_usd!));
    misses.push(Math.exp(err));
    if (err <= LOG3) within++;
  }
  return { n: comps.length, within, pct: comps.length === 0 ? 0 : (within / comps.length) * 100, median_miss: median(misses) };
}

/** Blind test: fit the earliest-listed comps, predict the most recent ones. */
export function blindValidation(comps: SnapshotProtocol[], asOf: string, scatter: ScatterPoint[]): ValidationRun {
  const sorted = [...comps].sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const test = sorted.slice(-BLIND_TEST_N);
  const train = sorted.slice(0, sorted.length - BLIND_TEST_N);
  const beta = fitOls(train, asOf);
  if (beta === null) return { n: test.length, within: 0, pct: 0, median_miss: 0 };
  return runStats(beta, test, asOf, 'blind', scatter);
}

/** Walk-forward: fit the first WF_START listed comps, then predict each next one in listing order. */
export function walkForwardValidation(comps: SnapshotProtocol[], asOf: string, scatter: ScatterPoint[]): ValidationRun {
  const sorted = [...comps].sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  let within = 0;
  const misses: number[] = [];
  for (let i = WF_START; i < sorted.length; i++) {
    const beta = fitOls(sorted.slice(0, i), asOf);
    if (beta === null) continue;
    const p = sorted[i]!;
    const pred = Math.exp(predictLog(beta, p, asOf));
    scatter.push({ slug: p.slug, actual_usd: p.mcap_usd!, predicted_usd: Math.round(pred), series: 'walk-forward' });
    const err = Math.abs(Math.log(pred) - Math.log(p.mcap_usd!));
    misses.push(Math.exp(err));
    if (err <= LOG3) within++;
  }
  const n = sorted.length - WF_START;
  return { n, within, pct: n === 0 ? 0 : (within / n) * 100, median_miss: median(misses) };
}

/** Launch odds, 0-100: the model's score as a logistic of the same figures. Not a measured probability. */
export function oddsOf(implied: number, p: SnapshotProtocol, asOf: string): number {
  const z = 0.35 * Math.log(implied / 1e6) - 1.2 + 0.8 * growthOf(p) + 0.12 * recordYears(asOf, p.listed_at) - 0.25 * Math.log(1 + p.chains.length);
  const odds = 100 / (1 + Math.exp(-z));
  return Math.round(odds * 10) / 10;
}

/** The tier from the 0-100 score. */
export function tierOf(score: number): BoardRow['tier'] {
  if (score >= WORTH_SCORE) return 'Worth';
  if (score >= MARGINAL_SCORE) return 'Marginal';
  return 'Skip';
}

/** The heat from the 0-100 score. */
export function heatOf(score: number): BoardRow['heat'] {
  if (score >= 75) return 'hot';
  if (score >= 60) return 'warm';
  if (score >= 45) return 'watch';
  return 'cold';
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second, different qualifying action. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const small = Math.max(10, Math.round(capital / 5));
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $${small} against the deposit on ${name} and repay it the same week, so the position shows both sides.`;
  if (c.includes('dex') || c.includes('yield')) return `Swap $${small} through ${name}'s main pool on ${chain} in a separate transaction from the deposit.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the hedge on ${name} and open a fresh one of $${small}, so the account shows repeated use.`;
  if (c.includes('prediction')) return `Settle one market on ${name} and place a second position of $${small} in a different market.`;
  if (c.includes('staking') || c.includes('restak')) return `Claim the staking rewards on ${name} and restake $${small} of them in the same week.`;
  return `Vote or interact with ${name}'s governance or points page with $${small} of activity on ${chain}.`;
}

/** A money formatter without decimals for whole dollars. */
function money(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

/**
 * A protocol's farm plan: nine steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age) and the model's own numbers (implied value, odds), never from a
 * hand-written list of names. Step 8 nets the money: the gas the plan burns
 * against the odds-weighted implied value, with the capital returned on exit.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, implied: number, odds: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const setupGas = capital >= 150 ? 8 : 4;
  const gasTotal = 3 + setupGas + 2 * weeks + 3;
  const expected = Math.round((odds / 100) * implied);
  const secondChain = p.chains.length > 1 ? p.chains[1]! : chain;
  return [
    { text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`, cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${setupGas} of gas`, time: '15 minutes to set up' },
    { text: secondActionFor(p, capital, chain), cost: `about $${Math.max(10, Math.round(capital / 5))} of activity and $2 of gas`, time: '10 minutes' },
    {
      text: p.chains.length > 1 ? `Repeat the main action on ${secondChain} with $${Math.max(10, Math.round(capital / 5))}, so the wallet is active on two chains.` : `Top the position up by $${Math.max(10, Math.round(capital / 5))} on ${chain} in a second transaction, so the wallet shows repeated use.`,
      cost: `about $${Math.max(10, Math.round(capital / 5))} of capital and $2 of gas`,
      time: '10 minutes',
    },
    { text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`, cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    {
      text: `Netted: the plan burns about $${gasTotal} of gas ($3 first tx, $${setupGas} setup, $2 a week for ${weeks} weeks, $3 to claim) and the $${capital} capital comes back on exit. At ${odds}% odds on ${money(implied)} implied, the odds-weighted value is ${money(expected)} — net ${money(expected - gasTotal)} after gas.`,
      cost: `$${gasTotal} of gas in total`,
      time: `${hold} days, ${weeks} weekly actions`,
    },
    { text: `Write the wallet, the dates and every transaction in a farm log, then unwind in one transaction once the claim is done.`, cost: 'nothing but the log', time: '5 minutes' },
  ];
}

/** A deterministic seeded PRNG (mulberry32) for the bootstrap refits. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rank ranges from REFITS bootstrap refits of the comps. */
function rankRanges(board: { p: SnapshotProtocol; implied: number }[], comps: SnapshotProtocol[], asOf: string): { lo: number; hi: number }[] {
  const n = board.length;
  const lo = new Array<number>(n).fill(1);
  const hi = new Array<number>(n).fill(n);
  const order = board.map((_, i) => i).sort((a, b) => board[b]!.implied - board[a]!.implied);
  const rankOf = new Array<number>(n).fill(0);
  order.forEach((idx, r) => {
    rankOf[idx] = r + 1;
    lo[idx] = r + 1;
    hi[idx] = r + 1;
  });
  for (let b = 0; b < REFITS; b++) {
    const rnd = mulberry32(REFIT_SEED + b);
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < comps.length; i++) sample.push(comps[Math.floor(rnd() * comps.length)]!);
    const beta = fitOls(sample, asOf);
    if (beta === null) continue;
    const scored = board.map((row, i) => ({ i, implied: Math.exp(predictLog(beta, row.p, asOf)) }));
    scored.sort((a, b2) => b2.implied - a.implied);
    scored.forEach((s, r) => {
      if (r + 1 < lo[s.i]!) lo[s.i] = r + 1;
      if (r + 1 > hi[s.i]!) hi[s.i] = r + 1;
    });
  }
  return board.map((_, i) => ({ lo: lo[i]!, hi: hi[i]! }));
}

/** The protocols the board prices, strongest implied value first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, beta: ModelCoefficients, comps: SnapshotProtocol[]): BoardRow[] {
  const priced = snapshot.protocols.filter((p) => isPreToken(p) && setAsideReason(p) === null);
  const scored = priced.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const implied = Math.max(1, Math.round(Math.exp(predictLog(beta, p, snapshot.as_of))));
    const ratio = implied / p.tvl_usd;
    const odds = oddsOf(implied, p, snapshot.as_of);
    return { p, age, implied, ratio, odds };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const ranges = rankRanges(scored, comps, snapshot.as_of);
  const n = scored.length;
  return scored.map((s, i) => {
    const pct = n > 1 ? (n - 1 - i) / (n - 1) : 1;
    const score = Math.round(0.55 * pct * 100 + 0.45 * s.odds);
    const capital = capitalFor(s.p);
    const hold = holdDaysFor(s.age);
    const gas = 3 + (capital >= 150 ? 8 : 4) + 2 * Math.ceil(hold / 7) + 3;
    const expected = Math.round((s.odds / 100) * s.implied);
    const growth = s.p.change_7d === null ? 'no 7d change' : `${s.p.change_7d > 0 ? '+' : ''}${s.p.change_7d.toFixed(1)}% 7d`;
    const years = recordYears(snapshot.as_of, s.p.listed_at);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        growth_pct: growthOf(s.p) * 100,
        record_years: Math.round(years * 100) / 100,
        age_days: s.age,
        predicted_log_mcap: Math.round(predictLog(beta, s.p, snapshot.as_of) * 10000) / 10000,
        ratio: Math.round(s.ratio * 10000) / 10000,
      },
      odds_pct: s.odds,
      score,
      tier: tierOf(score),
      heat: heatOf(score),
      reason: `Implied ${money(s.implied)} is ${s.ratio.toFixed(2)}x its ${money(s.p.tvl_usd)} TVL; ${growth}; ${years.toFixed(1)}y on record, no token; ${s.p.chains.length} chain${s.p.chains.length === 1 ? '' : 's'}.`,
      rank_lo: ranges[i]!.lo,
      rank_hi: ranges[i]!.hi,
      capital_usd: capital,
      gas_usd: gas,
      expected_value_usd: expected,
      farm_steps: farmSteps(s.p, s.age, s.implied, s.odds).map(stepText),
    };
  });
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

/** The pre-token protocols the board sets aside, and why. */
export function setAsideRows(snapshot: Snapshot): SetAsideRow[] {
  return snapshot.protocols
    .filter((p) => isPreToken(p) && setAsideReason(p) !== null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason: setAsideReason(p)! }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    ratio: row.model.ratio,
    odds_pct: row.odds_pct,
    score: row.score,
    tier: row.tier,
    heat: row.heat,
    reason: row.reason,
    rank_lo: row.rank_lo,
    rank_hi: row.rank_hi,
    capital_usd: row.capital_usd,
    gas_usd: row.gas_usd,
    expected_value_usd: row.expected_value_usd,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
): { board: BoardRow[]; radar: RadarData; beta: ModelCoefficients; validation: { loo: ValidationRun; blind: ValidationRun; walk_forward: ValidationRun } } {
  const comps = compsOf(snapshot);
  const beta = fitOls(comps, snapshot.as_of);
  if (beta === null) throw new SnapshotError('the comps fit is singular');
  const scatter: ScatterPoint[] = [];
  const loo = looValidation(comps, snapshot.as_of, scatter);
  const blind = blindValidation(comps, snapshot.as_of, scatter);
  const walkForward = walkForwardValidation(comps, snapshot.as_of, scatter);
  const board = buildBoard(snapshot, beta, comps);
  const live = liveRows(snapshot);
  const setaside = setAsideRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const tiers = {
    worth: board.filter((r) => r.tier === 'Worth').length,
    marginal: board.filter((r) => r.tier === 'Marginal').length,
    skip: board.filter((r) => r.tier === 'Skip').length,
  };
  const trade = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: {
      intercept: beta.intercept,
      log_tvl: beta.log_tvl,
      growth: beta.growth,
      record_years: beta.record_years,
      log_chains: beta.log_chains,
    },
    model_version: MODEL_VERSION,
    comps_n: comps.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    setaside_size: setaside.length,
    accounting: { total: snapshot.protocols.length, trade, set_aside: setaside.length, priced: board.length, watchlist: snapshot.watchlist.length },
    tiers,
    validation: { loo, blind, walk_forward: walkForward },
    scatter,
    rows: board.map(radarRow),
    live,
    setaside,
  };
  return { board, radar, beta, validation: { loo, blind, walk_forward: walkForward } };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
