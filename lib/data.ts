// The sealed snapshot: one protocol per row, the watchlist, the floor.
// Nothing here touches the network or the clock; every date is read off the
// snapshot's own as_of, so two runs over the same input agree byte for byte.

export interface Protocol {
  slug: string;
  name: string;
  category: string;
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
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** Parse the snapshot, refusing a shape the fit cannot read. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as unknown;
  if (typeof raw !== 'object' || raw === null) throw new Error('snapshot: not an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || typeof o.floor_usd !== 'number' || !Array.isArray(o.protocols) || !Array.isArray(o.watchlist)) {
    throw new Error('snapshot: as_of, floor_usd, protocols and watchlist are required');
  }
  const protocols = (o.protocols as unknown[]).map((p, i) => {
    const q = p as Record<string, unknown>;
    if (typeof q.slug !== 'string' || typeof q.name !== 'string' || typeof q.category !== 'string' || !Array.isArray(q.chains) || typeof q.tvl_usd !== 'number') {
      throw new Error(`snapshot: protocol ${i} lacks slug, name, category, chains or tvl_usd`);
    }
    return {
      slug: q.slug,
      name: q.name,
      category: q.category,
      chains: (q.chains as unknown[]).map(String),
      tvl_usd: q.tvl_usd,
      // The snapshot's change is in percent (-8.2 means -8.2%); the model,
      // the board and the page all work in fractions, so divide it here, once.
      change_7d: typeof q.change_7d === 'number' ? q.change_7d / 100 : null,
      mcap_usd: typeof q.mcap_usd === 'number' ? q.mcap_usd : null,
      listed_at: typeof q.listed_at === 'string' ? q.listed_at : null,
      gecko_id: typeof q.gecko_id === 'string' ? q.gecko_id : null,
      symbol: typeof q.symbol === 'string' ? q.symbol : null,
    } as Protocol;
  });
  return { as_of: o.as_of, floor_usd: o.floor_usd, protocols, watchlist: (o.watchlist as unknown[]).map(String) };
}

/** Years between a listing date and the snapshot's as_of, null when unlisted. */
export function ageYears(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const ms = Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}

/** A protocol has a token when DefiLlama names one for it. */
export function hasToken(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/**
 * Categories set aside as products, not priced: exchanges, bridges and
 * staking products are infrastructure whose "token" would not be a protocol
 * launch the radar exists to find. A watchlist name is always priced, even
 * when its category sits in this set.
 */
export const PRODUCT_CATEGORIES: ReadonlySet<string> = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Staking Pool',
  'Restaking',
  'Anchor BTC',
  'Decentralized BTC',
  'Restaked BTC',
  'Farm',
  'Leveraged Farming',
]);

/** The board's subjects: pre-token protocols, products set aside. */
export function isBoardSubject(p: Protocol, watchlist: ReadonlySet<string>): boolean {
  if (hasToken(p)) return false;
  return !PRODUCT_CATEGORIES.has(p.category) || watchlist.has(p.slug);
}

/** The family is the category lower-cased and dashed, so it is not stored. */
export function familyOf(category: string): string {
  return category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface Accounting {
  total: number;
  priced: number;
  traded: number;
  setAside: number;
  belowFloor: number;
}

/** The 758 accounted for: priced + traded + set aside, nothing missing. */
export function accounting(snapshot: Snapshot): Accounting {
  const watch = new Set(snapshot.watchlist);
  let priced = 0;
  let traded = 0;
  let setAside = 0;
  let belowFloor = 0;
  for (const p of snapshot.protocols) {
    if (hasToken(p)) {
      traded++;
    } else if (isBoardSubject(p, watch)) {
      priced++;
      if (p.tvl_usd < snapshot.floor_usd) belowFloor++;
    } else {
      setAside++;
    }
  }
  return { total: snapshot.protocols.length, priced, traded, setAside, belowFloor };
}
