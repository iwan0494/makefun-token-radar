// Token Radar R6 — the model: comps-fitted value, launch odds from the peers' record,
// and a farm plan netted to the dollar for every pre-token protocol.
//
// What is fitted, never typed in:
//   * log market cap on log TVL, 7-day growth, record years and chain count, fitted by OLS on the
//     60 traded comps the snapshot itself supports (see compsForFit). Extreme cover ratios are
//     trimmed from the fit only (cover outside [median/10, median*10]); validation still scores
//     every comp, so the trim cannot flatter the numbers.
//   * launch odds from a logistic regression on every protocol the board does not set aside as a
//     product (614 rows): P(records a token | TVL, growth, record years, chains). A pre-token
//     protocol's odds are the peers' record, not a hand-set number.
//   * the value band: ceiling = implied x e^0.9; floor = implied x the 1st percentile of the
//     leave-one-out recorded-over-predicted ratios (the model's own worst case).
//   * rank ranges from 50 seeded bootstrap refits of the value model.
//
// Farm economics (stated, costed to the dollar): deposit clipped to 0.05% of TVL ($100-$2,000);
// gas $12 over three legs; idle 4.5% a year on the deposit over the window; exit 15 bps; 1.5 hours
// a week at $20 an hour. The window is 84 days at 10% launch odds and shortens 2.4 days per point
// of odds to a 21-day floor: a likely launch is farmed in a short sprint, a long shot gets the
// full quarter. Expected gross = odds x ceiling x 15% community allocation x (deposit / TVL).
// Worth needs net >= $20/hour AND break-even odds <= 30%; Marginal is net > 0; the rest Skip.

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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const YEAR_MS = 31_557_600_000;

/** The fitted value model: log(mcap) = b0 + b1*log(TVL) + b2*growth + b3*recordYears + b4*log1p(chains). */
export const VALUE_TERMS = 5;
export const GROWTH_CLIP = 0.5;
export const WINSOR = 10;
export const CEIL_LOG = 0.9;
export const COMMUNITY_ALLOC = 0.15;
export const GAS_TOTAL_USD = 12;
export const IDLE_RATE_YEAR = 0.045;
export const EXIT_BPS = 15;
export const HOURS_PER_WEEK = 1.5;
export const RATE_PER_HOUR_USD = 20;
export const WINDOW_TOP_DAYS = 84;
export const WINDOW_FLOOR_DAYS = 21;
export const WINDOW_ODDS_PIVOT = 0.1;
export const WINDOW_SLOPE_DAYS = 240;
export const WORTH_PER_HOUR_USD = 20;
export const WORTH_BREAK_EVEN_MAX = 0.3;
export const BOOTSTRAP_REFITS = 50;
export const BOOTSTRAP_SEED = 20261122;
export const MODEL_VERSION = 'radar-r6';

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to the snapshot date, clamped at zero; null when absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Record years (time since first listed), 0 when the snapshot carries no listing date. */
export function recordYears(asOf: string, listedAt: string | null): number {
  if (listedAt === null) return 0;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, (a - b) / YEAR_MS);
}

/** 7-day growth as a fraction, clipped to +/-GROWTH_CLIP; 0 when unreported. */
export function growthFrac(p: SnapshotProtocol): number {
  if (p.change_7d === null) return 0;
  return Math.max(-GROWTH_CLIP, Math.min(GROWTH_CLIP, p.change_7d / 100));
}

/** The value model's design row for one protocol. */
export function valueFeatures(p: SnapshotProtocol, asOf: string): number[] {
  return [1, Math.log(p.tvl_usd), growthFrac(p), recordYears(asOf, p.listed_at), Math.log1p(p.chains.length)];
}

/** Solve A x = b by Gaussian elimination with partial pivoting; null when singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const m = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    const tmp = m[c];
    m[c] = m[piv];
    m[piv] = tmp;
    const d = m[c][c];
    if (d === 0 || !Number.isFinite(d)) return null;
    for (let j = c; j <= n; j++) m[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c];
      if (f === 0) continue;
      for (let j = c; j <= n; j++) m[r][j] -= f * m[c][j];
    }
  }
  return m.map((r) => r[n]);
}

/** Ordinary least squares of y on the rows of X; null when the system is singular. */
export function ols(X: number[][], y: number[]): number[] | null {
  const k = X[0].length;
  const A: number[][] = [];
  for (let i = 0; i < k; i++) A.push(new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < k; a++) {
      b[a] += X[i][a] * y[i];
      for (let c = 0; c < k; c++) A[a][c] += X[i][a] * X[i][c];
    }
  }
  return solveLinear(A, b);
}

/** Categories whose market cap tracks an underlying or wrapped asset, not a protocol token's
 *  value against its TVL — they cannot anchor the comps fit. */
export const PRODUCT_CATEGORIES = new Set([
  'CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC',
  'Stablecoin Issuer', 'Algo-Stables', 'Stablecoin Wrapper', 'Anchor BTC', 'Decentralized BTC', 'Token Locker',
]);

/** The traded comps the value model is fitted on: a positive market cap, a listing date and a
 *  7-day change on record, not a product category, and listed before 2026 (a token listed this
 *  year has had no full year of price discovery, so its market cap is not yet a comp). */
export function compsForFit(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) =>
      p.mcap_usd !== null && p.mcap_usd > 0 &&
      p.listed_at !== null && p.listed_at < '2026-01-01' &&
      p.change_7d !== null &&
      !PRODUCT_CATEGORIES.has(p.category === null ? '' : p.category),
  );
}

/** Fit the value model on `train`: OLS on log market cap, trimming training comps whose cover
 *  (mcap / TVL) lies outside [median/10, median*10] — the fit's own outliers, never the test's. */
export function fitValueModel(train: SnapshotProtocol[], asOf: string): { beta: number[]; kept: number; dropped: number } | null {
  const covers = train.map((p) => (p.mcap_usd as number) / p.tvl_usd).sort((a, b) => a - b);
  const med = covers[Math.floor(covers.length / 2)];
  const kept = train.filter((p) => {
    const c = (p.mcap_usd as number) / p.tvl_usd;
    return c >= med / WINSOR && c <= med * WINSOR;
  });
  const use = kept.length >= 15 ? kept : train;
  const X = use.map((p) => valueFeatures(p, asOf));
  const y = use.map((p) => Math.log(p.mcap_usd as number));
  const beta = ols(X, y);
  if (beta === null) return null;
  return { beta, kept: use.length, dropped: train.length - use.length };
}

/** A fitted value model's prediction for one protocol, in whole dollars. */
export function predictValue(beta: number[], p: SnapshotProtocol, asOf: string): number {
  const x = valueFeatures(p, asOf);
  let v = 0;
  for (let j = 0; j < beta.length; j++) v += x[j] * beta[j];
  return Math.max(1, Math.exp(v));
}

/** The p-th percentile (0..1) of a sorted array, by linear interpolation. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const at = p * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

export interface ValidationStats {
  n: number;
  within3: number;
  within3Pct: number;
  medianMiss: number;
}

/** Summarise recorded-over-predicted ratios: share within 3x and the median miss. */
export function summariseRatios(ratios: number[]): ValidationStats {
  const within = ratios.filter((r) => r >= 1 / 3 && r <= 3).length;
  const miss = ratios.map((r) => Math.max(r, 1 / r)).sort((a, b) => a - b);
  return {
    n: ratios.length,
    within3: within,
    within3Pct: ratios.length === 0 ? 0 : (100 * within) / ratios.length,
    medianMiss: miss.length === 0 ? 0 : miss[Math.floor(miss.length / 2)],
  };
}

/** Leave-one-out validation over the comps, plus the raw ratios (for the band floor and scatter). */
export function looValidation(comps: SnapshotProtocol[], asOf: string): { stats: ValidationStats; ratios: number[]; points: Array<[number, number, number]> } {
  const ratios: number[] = [];
  const points: Array<[number, number, number]> = [];
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const fit = fitValueModel(train, asOf);
    if (fit === null) continue;
    const pred = predictValue(fit.beta, comps[i], asOf);
    const rec = comps[i].mcap_usd as number;
    ratios.push(rec / pred);
    points.push([pred, rec, comps[i].tvl_usd]);
  }
  return { stats: summariseRatios(ratios), ratios, points };
}

/** Blind test: fit on comps listed before 2024, test on comps listed from 2024 on. */
export function blindValidation(comps: SnapshotProtocol[], asOf: string): ValidationStats {
  const train = comps.filter((p) => (p.listed_at as string) < '2024-01-01');
  const test = comps.filter((p) => (p.listed_at as string) >= '2024-01-01');
  const fit = fitValueModel(train, asOf);
  if (fit === null) return { n: test.length, within3: 0, within3Pct: 0, medianMiss: 0 };
  return summariseRatios(test.map((p) => (p.mcap_usd as number) / predictValue(fit.beta, p, asOf)));
}

/** Walk-forward: five cutoffs, train on comps listed before each cutoff, test on comps listed in
 *  the six months after it (disjoint windows, pooled). */
export const WF_CUTOFFS = ['2023-01-01', '2023-07-01', '2024-01-01', '2024-07-01', '2025-01-01'];
export function walkForwardValidation(comps: SnapshotProtocol[], asOf: string): ValidationStats {
  const ratios: number[] = [];
  for (let ci = 0; ci < WF_CUTOFFS.length; ci++) {
    const cut = WF_CUTOFFS[ci];
    const next = ci + 1 < WF_CUTOFFS.length ? WF_CUTOFFS[ci + 1] : '2026-01-01';
    const train = comps.filter((p) => (p.listed_at as string) < cut);
    const test = comps.filter((p) => (p.listed_at as string) >= cut && (p.listed_at as string) < next);
    if (train.length < 10 || test.length === 0) continue;
    const fit = fitValueModel(train, asOf);
    if (fit === null) continue;
    for (const p of test) ratios.push((p.mcap_usd as number) / predictValue(fit.beta, p, asOf));
  }
  return summariseRatios(ratios);
}

/** Ablation: leave-one-out within-3x with each value term dropped in turn. */
export function ablation(comps: SnapshotProtocol[], asOf: string): Array<{ label: string; within3Pct: number; medianMiss: number }> {
  const out: Array<{ label: string; within3Pct: number; medianMiss: number }> = [];
  const variants: Array<{ label: string; drop: number }> = [
    { label: 'Full model', drop: -1 },
    { label: 'No growth term', drop: 2 },
    { label: 'No record term', drop: 3 },
    { label: 'No chains term', drop: 4 },
    { label: 'No cover trim', drop: -2 },
  ];
  for (const v of variants) {
    const ratios: number[] = [];
    for (let i = 0; i < comps.length; i++) {
      const train = comps.filter((_, j) => j !== i);
      let beta: number[] | null;
      if (v.drop === -2) {
        const X = train.map((p) => valueFeatures(p, asOf));
        const y = train.map((p) => Math.log(p.mcap_usd as number));
        beta = ols(X, y);
      } else if (v.drop >= 0) {
        const X = train.map((p) => valueFeatures(p, asOf).filter((_, j) => j !== v.drop));
        const y = train.map((p) => Math.log(p.mcap_usd as number));
        const b = ols(X, y);
        beta = b === null ? null : b;
        if (beta !== null) {
          const full = predictWithDropped(beta, v.drop, comps[i], asOf);
          ratios.push((comps[i].mcap_usd as number) / full);
          continue;
        }
      } else {
        const fit = fitValueModel(train, asOf);
        beta = fit === null ? null : fit.beta;
      }
      if (beta === null) continue;
      ratios.push((comps[i].mcap_usd as number) / predictValue(beta, comps[i], asOf));
    }
    const s = summariseRatios(ratios);
    out.push({ label: v.label, within3Pct: s.within3Pct, medianMiss: s.medianMiss });
  }
  return out;
}

/** Predict with a beta fitted on a dropped feature (the dropped coefficient is 0). */
function predictWithDropped(beta: number[], drop: number, p: SnapshotProtocol, asOf: string): number {
  const x = valueFeatures(p, asOf).filter((_, j) => j !== drop);
  let v = 0;
  for (let j = 0; j < beta.length; j++) v += x[j] * beta[j];
  return Math.max(1, Math.exp(v));
}

/** The watchlist rule, from the competition's own words, plus the three product shapes it implies:
 *  any bridge category (Cross Chain Bridge included), a version marker with or without its space,
 *  and a name carrying wrapped / staked / staking anywhere (Restaking is a staking product). */
export const SET_ASIDE_CATEGORIES = new Set([
  'Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX',
]);
const VERSION_MARKER = / ?(V2|v2|2\.0|V3|v3|3\.0)$/;
const PRODUCT_WORD = /(wrapped|staked|staking)/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

export function isSetAside(p: SnapshotProtocol): boolean {
  if (SET_ASIDE_CATEGORIES.has(p.category === null ? '' : p.category)) return true;
  if (VERSION_MARKER.test(p.name)) return true;
  if (PRODUCT_WORD.test(p.name)) return true;
  if (EXCHANGE_PREFIX.test(p.name)) return true;
  return false;
}

/** A protocol records no token: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The board's universe: pre-token protocols that are not set-aside products. */
export function pricedProtocols(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => isPreToken(p) && !isSetAside(p));
}

/** Logistic regression by IRLS (capped logits, 100 iterations) for P(records a token). */
export function fitOddsModel(rows: SnapshotProtocol[], asOf: string): number[] | null {
  const X = rows.map((p) => [1, Math.log(p.tvl_usd), growthFrac(p), recordYears(asOf, p.listed_at), Math.log1p(p.chains.length)]);
  const y = rows.map((p) => (p.symbol === null ? 0 : 1));
  const k = 5;
  let beta = [-1, 0, 0, 0, 0];
  for (let it = 0; it < 100; it++) {
    const A: number[][] = [];
    for (let i = 0; i < k; i++) A.push(new Array<number>(k).fill(0));
    const b = new Array<number>(k).fill(0);
    for (let i = 0; i < X.length; i++) {
      let z = 0;
      for (let j = 0; j < k; j++) z += X[i][j] * beta[j];
      z = Math.max(-30, Math.min(30, z));
      const pr = 1 / (1 + Math.exp(-z));
      const w = Math.max(1e-6, pr * (1 - pr));
      for (let a = 0; a < k; a++) {
        b[a] += X[i][a] * (y[i] - pr);
        for (let c = 0; c < k; c++) A[a][c] += w * X[i][a] * X[i][c];
      }
    }
    // A whisper of ridge keeps the step finite when the classes separate.
    for (let j = 0; j < k; j++) A[j][j] += 1e-6;
    const step = solveLinear(A, b);
    if (step === null) return null;
    let mx = 0;
    beta = beta.map((v, j) => {
      mx = Math.max(mx, Math.abs(step[j]));
      return v + step[j];
    });
    if (mx < 1e-7) break;
  }
  return beta;
}

/** Launch odds for one protocol under the fitted odds model (0..1). */
export function launchOdds(beta: number[], p: SnapshotProtocol, asOf: string): number {
  const x = [1, Math.log(p.tvl_usd), growthFrac(p), recordYears(asOf, p.listed_at), Math.log1p(p.chains.length)];
  let z = 0;
  for (let j = 0; j < beta.length; j++) z += x[j] * beta[j];
  z = Math.max(-30, Math.min(30, z));
  return 1 / (1 + Math.exp(-z));
}

/** The farm window in days: 84 at 10% odds, 2.4 days shorter per point of odds, floored at 21. */
export function windowDays(odds: number): number {
  const w = Math.round(WINDOW_TOP_DAYS - WINDOW_SLOPE_DAYS * (odds - WINDOW_ODDS_PIVOT));
  return Math.max(WINDOW_FLOOR_DAYS, Math.min(WINDOW_TOP_DAYS, w));
}

export interface FarmMoney {
  deposit: number;
  window: number;
  weeks: number;
  gas: number;
  idle: number;
  exit: number;
  timeHours: number;
  timeCost: number;
  totalCost: number;
  ceiling: number;
  floor: number;
  grossAtLaunch: number;
  expectedGross: number;
  net: number;
  perHour: number;
  breakEven: number;
}

/** The farm's money for one row, netted to the dollar. */
export function farmMoney(implied: number, odds: number, tvl: number, floorFactor: number): FarmMoney {
  const deposit = Math.min(2000, Math.max(100, 0.0005 * tvl));
  const window = windowDays(odds);
  const weeks = window / 7;
  const gas = GAS_TOTAL_USD;
  const idle = IDLE_RATE_YEAR * deposit * (window / 365);
  const exit = (EXIT_BPS / 10000) * deposit;
  const timeHours = HOURS_PER_WEEK * weeks;
  const timeCost = RATE_PER_HOUR_USD * timeHours;
  const totalCost = gas + idle + exit + timeCost;
  const ceiling = implied * Math.exp(CEIL_LOG);
  const floor = implied * floorFactor;
  const grossAtLaunch = ceiling * COMMUNITY_ALLOC * (deposit / tvl);
  const expectedGross = odds * grossAtLaunch;
  const net = expectedGross - totalCost;
  const perHour = timeHours === 0 ? 0 : net / timeHours;
  const breakEven = grossAtLaunch === 0 ? 1 : totalCost / grossAtLaunch;
  return { deposit, window, weeks, gas, idle, exit, timeHours, timeCost, totalCost, ceiling, floor, grossAtLaunch, expectedGross, net, perHour, breakEven };
}

export type Verdict = 'Worth' | 'Marginal' | 'Skip';

/** Worth needs $20/hour AND break-even at or under 30% odds; Marginal is any positive net. */
export function verdictOf(m: FarmMoney): Verdict {
  if (m.perHour >= WORTH_PER_HOUR_USD && m.breakEven <= WORTH_BREAK_EVEN_MAX) return 'Worth';
  if (m.net > 0) return 'Marginal';
  return 'Skip';
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0] : 'its main chain';
}

/** The farm's core action, from the protocol's own category — never its name. */
export function actionFor(p: SnapshotProtocol, deposit: number, chain: string): string {
  const c = (p.category === null ? '' : p.category).toLowerCase();
  const name = p.name;
  const d = `$${Math.round(deposit).toLocaleString('en-US')}`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply ${d} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('farm')) return `Provide ${d} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge ${d} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake ${d} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit ${d} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund ${d} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit ${d} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit ${d} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint ${d} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy ${d} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit ${d} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** Whole dollars, with commas, no decimals. */
export function money(n: number): string {
  const v = Math.round(n);
  const neg = v < 0;
  const s = String(Math.abs(v));
  const parts: string[] = [];
  for (let i = s.length; i > 0; i -= 3) parts.unshift(s.slice(Math.max(0, i - 3), i));
  return (neg ? '-$' : '$') + parts.join(',');
}

/** One farm step: action, then its cost and time, inside the gate's 20..600 characters. */
export function stepText(text: string, cost: string, time: string): string {
  let s = `${text} Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** Nine farm steps for one row, every number from the row's own economics. */
export function farmSteps(p: SnapshotProtocol, m: FarmMoney, odds: number): string[] {
  const chain = chainOf(p);
  const dep = money(m.deposit);
  const idle = money(m.idle);
  const exit = money(m.exit);
  const total = money(m.totalCost);
  const gross = money(m.grossAtLaunch);
  const expected = money(m.expectedGross);
  const net = money(m.net);
  const be = (100 * m.breakEven).toFixed(1);
  const od = (100 * odds).toFixed(1);
  const weeks = (m.weeks).toFixed(1).replace(/\.0$/, '');
  return [
    stepText(
      'Open a fresh wallet that holds only the farm funds, and keep its seed phrase offline — never paste it anywhere.',
      'no fee to open the wallet',
      '5 minutes',
    ),
    stepText(
      actionFor(p, m.deposit, chain),
      `${dep} of capital and about $4 of gas`,
      '15 minutes to set up',
    ),
    stepText(
      'Do one qualifying action each week — a deposit, a borrow, a swap or a vote — so the wallet stays active in every snapshot.',
      'about $2 of gas a week',
      '10 minutes a week',
    ),
    stepText(
      `Hold the position for the full ${m.window}-day window so the activity is counted across more than one snapshot.`,
      `the ${dep} stays in the position; idle cost ${idle} at 4.5% a year`,
      `${m.window} days`,
    ),
    stepText(
      `Check ${p.name}'s own points or rewards page each week and confirm the position is credited before the window ends.`,
      'no fee to check',
      '5 minutes a week',
    ),
    stepText(
      `Add up the costs before you commit: ${dep} deposit, $12 gas over three legs, ${idle} idle, ${exit} exit at 15 bps — ${total} all in.`,
      `${total} total cost`,
      '5 minutes to verify',
    ),
    stepText(
      `If the token launches at the band's top end, this position is worth ${gross}; weighted by ${od}% launch odds that is ${expected} expected, and the plan breaks even at ${be}% odds.`,
      `break-even at ${be}% odds`,
      '5 minutes to check',
    ),
    stepText(
      `If the token launches, claim only from the link ${p.name} itself publishes, then unwind in one transaction and pay the ${exit} exit fee.`,
      `${exit} exit fee`,
      '15 minutes to unwind',
    ),
    stepText(
      `Write the wallet, the dates and every transaction in a farm log, then re-check the position when the ${m.window}-day window ends. Net for this plan: ${net} over ${weeks} weeks of work.`,
      'nothing but the log',
      '5 minutes',
    ),
  ];
}

/** One row of board.json. */
export interface BoardRow {
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
  value_floor_usd: number;
  value_ceiling_usd: number;
  launch_odds_pct: number;
  verdict: Verdict;
  /** z33-style triage: score 0-100 + tier (cold/watch/warm/hot) + one concrete reason. The score
   *  is probability + estimate, never a guarantee: 50 points of launch odds, 50 points of farm
   *  value (net per hour mapped from -$30/h to +$30/h). Tier follows the verdict, so a hot row
   *  is always a row the farm math already calls Worth. */
  tier_score: number;
  tier: 'cold' | 'watch' | 'warm' | 'hot';
  tier_reason: string;
  deposit_usd: number;
  window_days: number;
  cost_usd: number;
  expected_gross_usd: number;
  gross_at_launch_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  break_even_odds_pct: number;
  rank_range: [number, number];
  model: {
    log_tvl: number;
    growth_pct: number;
    record_years: number;
    log_chains: number;
    intercept_log: number;
    tvl_log: number;
    growth_log: number;
    record_log: number;
    chains_log: number;
  };
  farm_steps: string[];
}

/** Score 0-100: half launch odds, half farm value (net/hour from -$30 to +$30). */
export function tierScore(odds: number, perHour: number): number {
  const value = Math.max(0, Math.min(1, (perHour + 30) / 60));
  return Math.round(50 * odds + 50 * value);
}

/** Tier from verdict + score: hot is always Worth, cold is always Skip. */
export function tierOf(verdict: Verdict, score: number): 'cold' | 'watch' | 'warm' | 'hot' {
  if (verdict === 'Worth') return score >= 60 ? 'hot' : 'warm';
  if (verdict === 'Marginal') return score >= 45 ? 'warm' : 'watch';
  return score >= 25 ? 'watch' : 'cold';
}

/** One concrete reason + the effort estimate, from the row's own numbers. */
export function tierReason(odds: number, m: FarmMoney): string {
  const od = (100 * odds).toFixed(1);
  const net = (m.net >= 0 ? '+' : '') + money(m.net) + '/h';
  const be = (100 * m.breakEven).toFixed(1);
  const hours = (m.timeHours).toFixed(1).replace(/\.0$/, '');
  return `${od}% launch odds · net ${net} · break-even ${be}% · ${hours} h + ${money(m.deposit)} over ${m.window} days`;
}

/** The dashboard's compact row: arrays keep zdata.js small; app.js rebuilds the steps. */
export type RadarRow = [
  number, string, string, string | null, string, number, number | null, number | null,
  number, number, Verdict, number, number, number, number, number, number, number,
  number, number, number, number, number, number, number, number, number, string, string,
];

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  floor_usd: number;
  model_version: string;
  counts: { total: number; traded: number; set_aside: number; priced: number; watchlist: number };
  beta: number[];
  floor_factor: number;
  ceil_factor: number;
  loo: ValidationStats;
  blind: ValidationStats;
  walk_forward: ValidationStats;
  ablation: Array<{ label: string; within3Pct: number; medianMiss: number }>;
  scatter: Array<[number, number, number]>;
  econ: {
    alloc: number; gas: number; idle_rate: number; exit_bps: number;
    hours_week: number; rate_hour: number; win_top: number; win_floor: number;
    win_pivot: number; win_slope: number;
  };
  verdicts: { worth: number; marginal: number; skip: number };
  live: Array<[string, string | null, number, number]>;
  rows: RadarRow[];
}

/** A seeded LCG: the bootstrap refits are deterministic — no Math.random anywhere. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Rank ranges from seeded bootstrap refits: the 5th and 95th percentile of each row's rank. */
export function rankRanges(
  priced: SnapshotProtocol[],
  comps: SnapshotProtocol[],
  beta: number[],
  asOf: string,
): Map<string, [number, number]> {
  const base = new Map<string, number>();
  const scored = priced
    .map((p) => ({ slug: p.slug, iv: predictValue(beta, p, asOf) }))
    .sort((a, b) => b.iv - a.iv || (a.slug < b.slug ? -1 : 1));
  scored.forEach((r, i) => base.set(r.slug, i + 1));
  const ranks = new Map<string, number[]>();
  for (const p of priced) ranks.set(p.slug, [base.get(p.slug) as number]);
  const rand = lcg(BOOTSTRAP_SEED);
  for (let b = 0; b < BOOTSTRAP_REFITS; b++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < comps.length; i++) sample.push(comps[Math.floor(rand() * comps.length)]);
    const fit = fitValueModel(sample, asOf);
    if (fit === null) continue;
    const order = priced
      .map((p) => ({ slug: p.slug, iv: predictValue(fit.beta, p, asOf) }))
      .sort((x, y) => y.iv - x.iv || (x.slug < y.slug ? -1 : 1));
    order.forEach((r, i) => (ranks.get(r.slug) as number[]).push(i + 1));
  }
  const out = new Map<string, [number, number]>();
  for (const [slug, list] of ranks) {
    const s = [...list].sort((a, b) => a - b);
    out.set(slug, [s[Math.floor(0.05 * (s.length - 1))], s[Math.ceil(0.95 * (s.length - 1))]]);
  }
  return out;
}

/** The whole build: fit, validate, score, price the farm, rank. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const asOf = snapshot.as_of;
  const comps = compsForFit(snapshot);
  const fit = fitValueModel(comps, asOf);
  if (fit === null) throw new SnapshotError('the comps fit is singular');
  const beta = fit.beta;
  const loo = looValidation(comps, asOf);
  const sortedRatios = [...loo.ratios].sort((a, b) => a - b);
  const floorFactor = percentile(sortedRatios, 0.01);
  const blind = blindValidation(comps, asOf);
  const wf = walkForwardValidation(comps, asOf);
  const abl = ablation(comps, asOf);

  const priced = pricedProtocols(snapshot);
  const oddsTrain = snapshot.protocols.filter((p) => !isSetAside(p));
  const oddsBeta = fitOddsModel(oddsTrain, asOf);
  if (oddsBeta === null) throw new SnapshotError('the odds fit is singular');
  const ranges = rankRanges(priced, comps, beta, asOf);

  const r4 = (n: number): number => Math.round(10000 * n) / 10000;
  const scored = priced.map((p) => {
    const x = valueFeatures(p, asOf);
    // The board's implied value is the sum of the ROUNDED term table below, so the dashboard
    // page — which sums the same stored terms — recomputes the exact same dollars.
    const terms = [beta[0], beta[1] * x[1], beta[2] * x[2], beta[3] * x[3], beta[4] * x[4]].map(r4);
    const iv = Math.max(1, Math.round(Math.exp(terms.reduce((a, b) => a + b, 0))));
    const odds = launchOdds(oddsBeta, p, asOf);
    const money1 = farmMoney(iv, odds, p.tvl_usd, floorFactor);
    const verdict = verdictOf(money1);
    return { p, iv, odds, money: money1, verdict, x, terms };
  });
  scored.sort((a, b) => b.iv - a.iv || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const board: BoardRow[] = scored.map((s, i) => {
    const p = s.p;
    const range = ranges.get(p.slug) as [number, number];
    // Round every money figure to cents BEFORE the steps are written, so the dashboard page —
    // which rebuilds the same steps from these stored cents — prints the identical dollars.
    const c = (n: number): number => Math.round(100 * n) / 100;
    const rm: FarmMoney = {
      deposit: c(s.money.deposit), window: s.money.window, weeks: s.money.weeks, gas: c(s.money.gas),
      idle: c(s.money.idle), exit: c(s.money.exit), timeHours: s.money.timeHours, timeCost: c(s.money.timeCost),
      totalCost: c(s.money.totalCost), ceiling: s.money.ceiling, floor: s.money.floor,
      grossAtLaunch: c(s.money.grossAtLaunch), expectedGross: c(s.money.expectedGross), net: c(s.money.net),
      perHour: c(s.money.perHour), breakEven: s.money.breakEven,
    };
    return {
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: ageDays(asOf, p.listed_at),
      implied_value_usd: s.iv,
      value_floor_usd: Math.max(1, Math.round(rm.floor)),
      value_ceiling_usd: Math.max(1, Math.round(rm.ceiling)),
      launch_odds_pct: Math.round(1000 * s.odds) / 10,
      verdict: s.verdict,
      tier_score: tierScore(s.odds, rm.perHour),
      tier: tierOf(s.verdict, tierScore(s.odds, rm.perHour)),
      tier_reason: tierReason(s.odds, rm),
      deposit_usd: rm.deposit,
      window_days: rm.window,
      cost_usd: rm.totalCost,
      expected_gross_usd: rm.expectedGross,
      gross_at_launch_usd: rm.grossAtLaunch,
      net_usd: rm.net,
      net_per_hour_usd: rm.perHour,
      break_even_odds_pct: Math.round(1000 * rm.breakEven) / 10,
      rank_range: range,
      model: {
        log_tvl: Math.round(10000 * s.x[1]) / 10000,
        growth_pct: Math.round(100 * growthFrac(p) * 100) / 100,
        record_years: Math.round(100 * s.x[3]) / 100,
        log_chains: Math.round(10000 * s.x[4]) / 10000,
        intercept_log: s.terms[0],
        tvl_log: s.terms[1],
        growth_log: s.terms[2],
        record_log: s.terms[3],
        chains_log: s.terms[4],
      },
      farm_steps: farmSteps(p, rm, s.odds),
    };
  });

  const verdicts = { worth: 0, marginal: 0, skip: 0 };
  for (const r of board) {
    if (r.verdict === 'Worth') verdicts.worth++;
    else if (r.verdict === 'Marginal') verdicts.marginal++;
    else verdicts.skip++;
  }

  const live = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => ((b.mcap_usd as number) - (a.mcap_usd as number)) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => [p.name, p.category, p.tvl_usd, p.mcap_usd as number] as [string, string | null, number, number]);

  const rows: RadarRow[] = board.map((r) => [
    r.rank, r.slug, r.name, r.category, r.chains.join('|'), r.tvl_usd, r.change_7d, r.age_days,
    r.implied_value_usd, r.launch_odds_pct, r.verdict, r.deposit_usd, r.window_days,
    Math.round(100 * r.cost_usd) / 100, Math.round(100 * r.expected_gross_usd) / 100,
    Math.round(100 * r.net_usd) / 100, Math.round(100 * r.net_per_hour_usd) / 100,
    r.break_even_odds_pct, r.value_floor_usd, r.value_ceiling_usd, r.rank_range[0], r.rank_range[1],
    r.model.growth_pct, r.model.record_years, r.chains.length,
    Math.round(100 * r.gross_at_launch_usd) / 100,
    r.tier_score, r.tier, r.tier_reason,
    r.model.intercept_log, r.model.tvl_log, r.model.growth_log, r.model.record_log, r.model.chains_log,
  ]);

  const radar: RadarData = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    counts: {
      total: snapshot.protocols.length,
      traded: snapshot.protocols.filter((p) => !isPreToken(p)).length,
      set_aside: snapshot.protocols.filter((p) => isPreToken(p) && isSetAside(p)).length,
      priced: priced.length,
      watchlist: snapshot.watchlist.length,
    },
    beta: beta.map((b) => Math.round(10000 * b) / 10000),
    floor_factor: Math.round(100000 * floorFactor) / 100000,
    ceil_factor: Math.round(10000 * Math.exp(CEIL_LOG)) / 10000,
    loo: loo.stats,
    blind,
    walk_forward: wf,
    ablation: abl,
    scatter: loo.points.map(([a, b, t]) => [Math.round(a), Math.round(b), t] as [number, number, number]),
    econ: {
      alloc: COMMUNITY_ALLOC, gas: GAS_TOTAL_USD, idle_rate: IDLE_RATE_YEAR, exit_bps: EXIT_BPS,
      hours_week: HOURS_PER_WEEK, rate_hour: RATE_PER_HOUR_USD, win_top: WINDOW_TOP_DAYS,
      win_floor: WINDOW_FLOOR_DAYS, win_pivot: WINDOW_ODDS_PIVOT, win_slope: WINDOW_SLOPE_DAYS,
    },
    verdicts,
    live,
    rows,
  };
  return { board, radar };
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
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i].implied_value_usd > board[i - 1].implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0].implied_value_usd === board[board.length - 1].implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0].implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** The dashboard's dataset as one script at the output root (never inside dashboard/, so the
 *  dossier's 65,536-byte text budget holds the page's source whole). */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
