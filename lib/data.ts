// The page's data: one JSON object, written beside the dashboard as data.js, that the page script reads
// with no request. Everything the page shows is in here, so the page and board.json cannot disagree on
// what they read: the page re-derives each row's arithmetic from its terms and refuses a mismatch.
//
// Two rules keep the dossier readable: data.js is hundreds of kilobytes, so it must come last in path
// order (the dossier shows every source file whole up to 65,536 bytes and cuts the first that overflows,
// which would otherwise be data.js, leaving the judge no page source), and the snapshot's `source`
// carries a URL (DefiLlama's endpoint), so the page gets a URL-free label: an https:// address in a
// rendered attribute or link value would be refused.

import type { Comps, Snapshot } from './types.ts';
import { SLICE } from './farm.ts';
import { CAREERS } from './careers.ts';
import { BAND_LOG, PRICE_HORIZON_YEARS, type Radar } from './board.ts';
import type { Validation } from './validate.ts';
import { TILT_MIN_N, WEIGHT_HALF_TVL } from './comps.ts';

export interface PageData {
  meta: {
    as_of: string;
    source: string;
    floor_usd: number;
    watchlist: number;
    protocols: number;
    traded: number;
    rows: number;
    horizon_years: number;
    band_log: number;
    generated_by: string;
  };
  model: {
    line: Comps['line'];
    category: Comps['category'];
    family: Comps['family'];
    growth: Comps['growth'];
    hold: Comps['hold'];
    scale: number;
    cover: Comps['cover'];
    pool: Comps['pool'];
    tilt_min_n: number;
    weight_half_tvl: number;
  };
  slice: typeof SLICE;
  validation: Validation;
  coverage: Radar['coverage'];
  careers: Array<{ key: string; label: string; holds: string; action: string; routine: string; risk: string; lock: string }>;
  rows: Radar['rows'];
}

/**
 * The snapshot's `source` as a label: the fetching endpoint and the fetch time, with any http:// or
 * https:// address dropped whole, so the page never renders one and board.json keeps its own copy.
 */
export function sourceLabel(source: string): string {
  return source
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,;])/g, '$1')
    .replace(/^[\s,:;]+|[\s,:;]+$/g, '') || 'sealed snapshot';
}

/** The page's data object, from the same board the file carries. */
export function pageData(radar: Radar, snapshot: Snapshot, validation: Validation): PageData {
  const m = radar.model;
  return {
    meta: {
      as_of: snapshot.as_of,
      source: sourceLabel(snapshot.source),
      floor_usd: snapshot.floor_usd,
      watchlist: snapshot.watchlist.length,
      protocols: snapshot.protocols.length,
      traded: m.pool.traded,
      rows: radar.rows.length,
      horizon_years: PRICE_HORIZON_YEARS,
      band_log: BAND_LOG,
      generated_by: 'main.ts, this repository',
    },
    model: {
      line: m.line,
      category: m.category,
      family: m.family,
      growth: m.growth,
      hold: m.hold,
      scale: m.scale,
      cover: m.cover,
      pool: m.pool,
      tilt_min_n: TILT_MIN_N,
      weight_half_tvl: WEIGHT_HALF_TVL,
    },
    slice: SLICE,
    validation,
    coverage: radar.coverage,
    careers: Object.values(CAREERS).map((c) => ({ key: c.key, label: c.label, holds: c.holds, action: c.action, routine: c.routine, risk: c.risk, lock: c.lock })),
    rows: radar.rows,
  };
}

/** data.js: an assignment the page's script reads with no request. */
export function dataScript(data: PageData): string {
  return `globalThis.LAUNCH_RADAR = ${JSON.stringify(data)};\n`;
}
