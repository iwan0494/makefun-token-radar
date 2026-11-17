// The shapes the radar passes around: the snapshot's ten fields, the fitted comps, one scored
// protocol, and a board row.
//
// Nothing in this file names a protocol. The snapshot's own numbers are the only evidence: a
// protocol's TVL, its reported seven-day change, its category and chains, and how long DefiLlama has
// tracked it with no token on record.

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

/** One traded token as the comps fit reads it: its record in log space. */
export interface Comp {
  slug: string;
  category: string | null;
  family: string | null;
  tvl_usd: number;
  /** log(market cap / TVL): what the market pays per dollar of TVL for this token. */
  ratio_log: number;
  growth_pct: number | null;
  /** Years from the listing day to the snapshot day. */
  age_years: number;
  /** The listing day, as an epoch in milliseconds. */
  listed_ms: number;
  /** The listing day as the snapshot writes it. */
  growth_listed: string;
  weight: number;
}

/** A fitted Huber line, kept in its own bounds: a coefficient that runs to the bound says so. */
export interface Line {
  a: number;
  b: number;
  lo: number;
  hi: number;
  pinned: 'free' | 'lo' | 'hi';
  n: number;
}

/** A tilted level: a group's mean residual, shrunk by n / (n + prior). */
export interface Tilt {
  key: string;
  n: number;
  raw: number;
  value: number;
}

/** What the comps pool carries, before and after the filters. */
export interface PoolCount {
  traded: number;
  with_mcap: number;
  near_listing: number;
  comps: number;
}

/** Every fitted term of the radar, all from the snapshot's traded tokens. */
export interface Comps {
  as_of: string;
  pool: PoolCount;
  line: Line;
  category: Tilt[];
  family: Tilt[];
  growth: { level: number; slope: number; n: number };
  /** The hold term applied at one year and beyond: level + slope * log1p(age). */
  hold: { a: number; b: number; lo: number; hi: number };
  /** Where the record's slope moves after the follow split: level, and the young correction per year. */
  follow: { a: number; b: number; from_years: number };
  follow_from: string;
  follow_n: number;
  scale: number;
  cover: { n: number; p10: number; p50: number; p90: number };
  /** What one line of a fitted comp recovered its own ratio with: its own withheld miss. */
  fit_mean_log: number;
}

/** The arithmetic of one protocol's implied value, in logs of its ratio to TVL. */
export interface Terms {
  line_log: number;
  category_log: number;
  family_log: number;
  growth_log: number;
  hold_log: number;
  young_log: number;
}

/** A protocol scored: the terms, the ratio and what it is worth. */
export interface Scored {
  protocol: Protocol;
  status: 'pre-token' | 'traded';
  on_watchlist: boolean;
  age_years: number | null;
  terms: Terms;
  ratio_log: number;
  central_usd: number;
  lo_usd: number;
  hi_usd: number;
}
