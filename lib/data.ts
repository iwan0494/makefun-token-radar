// The snapshot's shape and the board's rule: which protocols are subjects, which
// anchor the fit, and which are set aside. Nothing here names a protocol: every
// list below is read off the snapshot's own ten fields.

export interface Protocol {
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
  protocols: Protocol[];
  watchlist: string[];
}

/** The snapshot as the house sealed it: 758 protocols, ten fields each, no more. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (typeof raw.as_of !== 'string' || !Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: as_of, protocols and watchlist are required');
  }
  for (const p of raw.protocols) {
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number') {
      throw new Error('snapshot: every protocol needs a slug, a name and a TVL');
    }
  }
  return raw;
}

/** Whole dollars, truncated toward zero: $2.76B, $45.9M, $860k, $95. */
export function usd(x: number): string {
  const n = Math.abs(x);
  const sign = x < 0 ? '-' : '';
  if (n >= 1e12) return `${sign}$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${sign}$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${sign}$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
  if (n >= 1e3) return `${sign}$${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k`;
  return `${sign}$${Math.round(n)}`;
}

/** A plain number at a glance: 2.76B, 45.9M, 860k, 95. */
export function num(x: number): string {
  const n = Math.abs(x);
  const sign = x < 0 ? '-' : '';
  if (n >= 1e12) return `${sign}${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${sign}${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${sign}${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
  if (n >= 1e3) return `${sign}${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k`;
  return `${sign}${Math.round(n)}`;
}

/** Days between two YYYY-MM-DD dates, or null when either is missing. */
export function daysBetween(a: string | null, b: string): number | null {
  if (a === null) return null;
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 86_400_000);
}

/** A span of days in the words a reader would use: 3 h, 21 days, 2.8 months, 1.5 years. */
export function span(days: number): string {
  if (days < 1.5) return `${Math.max(1, Math.round(days * 24))} h`;
  if (days < 45) return `${Math.round(days)} days`;
  if (days < 400) return `${(days / 30.44).toFixed(1)} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}

/** Years since the listing day, or null when the snapshot records none. */
export function ageYears(p: Protocol, asOf: string): number | null {
  const d = daysBetween(p.listed_at, asOf);
  return d === null ? null : Math.max(0, d / 365.25);
}

export function clip(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** The family a protocol's category reads as: lowercased, hyphenated, one word. */
export function familyOf(p: Protocol): string {
  return (p.category ?? 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

/** A protocol records a token when DefiLlama gives it a CoinGecko id or a ticker. */
export function recordsToken(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

// ---------------------------------------------------------------- the board's rule

const VERSION_END = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_START = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const PRODUCT_CATEGORY = new Set([
  'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX',
]);

/**
 * A wrapped, staked or bridged product, or a versioned name: not a protocol still
 * waiting on a launch of its own. The rule is the watchlist's own, read off the
 * snapshot's ten fields; the parent protocol is not among them, so the watchlist
 * itself (given in the file) is the authority on the floor.
 */
export function isProduct(p: Protocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORY.has(p.category)) return true;
  if (VERSION_END.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  if (EXCHANGE_START.test(p.name)) return true;
  return false;
}

/** The board's subjects: no token on record, and not a product of another protocol. */
export function isBoardSubject(p: Protocol): boolean {
  return !recordsToken(p) && !isProduct(p);
}

/** The fit's anchors: a token that trades, with a market cap, a TVL and a listing day. */
export function isComp(p: Protocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.listed_at !== null;
}

/** The whole universe, accounted for: priced, traded, or set aside with its reason. */
export function accountFor(snap: Snapshot): {
  priced: number;
  traded: number;
  setAside: number;
  noMcap: number;
  belowFloor: number;
  onWatchlist: number;
} {
  let priced = 0;
  let traded = 0;
  let noMcap = 0;
  let products = 0;
  let belowFloor = 0;
  for (const p of snap.protocols) {
    if (recordsToken(p)) {
      traded++;
      if (p.mcap_usd === null) noMcap++;
    } else if (isProduct(p)) {
      products++;
    } else {
      priced++;
      if (p.tvl_usd < snap.floor_usd) belowFloor++;
    }
  }
  return { priced, traded, setAside: products, noMcap, belowFloor, onWatchlist: snap.watchlist.length };
}
