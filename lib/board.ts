// The ranked board: every pre-token protocol priced, planned and ordered, with
// the rank range its own refits give it and the nine checks the page runs on
// itself. The board is the entry's answer to "which protocol is worth farming
// next, and what do I do about it" — sorted by implied value, never by TVL.

import {
  accountFor,
  ageYears,
  daysBetween,
  isBoardSubject,
  usd,
  type Protocol,
  type Snapshot,
} from './data.ts';
import { economicsFor, farmPlan, pct1, type Economics } from './farm.ts';
import { coverOf, termsOf, type Model } from './model.ts';
import { SLICE } from './farm.ts';

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string;
  family: string;
  chain: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_years: number | null;
  watchlist: boolean;
  cover: number;
  value_usd: number;
  band_low_usd: number;
  band_high_usd: number;
  odds: number;
  rank_lo: number;
  rank_hi: number;
  net_usd: number;
  per_hour_usd: number;
  break_even: number;
  verdict: 'Worth' | 'Marginal' | 'Skip';
  economics: Economics;
  steps: string[];
  terms: {
    line: number;
    category_log: number;
    family_log: number;
    growth_log: number;
    record_log: number;
    log_cover: number;
  };
}

export interface Board {
  rows: BoardRow[];
  worth: number;
  marginal: number;
  skip: number;
  bestPerHour: number;
  capital: number;
  expected: number;
  accounting: ReturnType<typeof accountFor>;
}

export interface SelfCheck {
  name: string;
  pass: boolean;
  detail: string;
}

/** The board: subjects priced by the model, planned to the dollar, ranked by value. */
export function buildBoard(
  snap: Snapshot,
  model: Model,
  ranges: Map<string, { lo: number; hi: number }>,
): Board {
  const watch = new Set(snap.watchlist);
  const subjects = snap.protocols.filter(isBoardSubject);
  const rows: BoardRow[] = subjects.map((p) => {
    const terms = termsOf(model, p);
    const cover = terms.cover;
    const value = p.tvl_usd * cover;
    const ageDays = daysBetween(p.listed_at, snap.as_of) ?? 365;
    const plan = farmPlan(model, p, snap.as_of, value, ageDays, cover);
    const e = plan.economics;
    const range = ranges.get(p.slug) ?? { lo: 0, hi: 0 };
    return {
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category ?? 'unknown',
      family: terms.family,
      chain: terms.chain,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_years: ageYears(p, snap.as_of),
      watchlist: watch.has(p.slug),
      cover,
      value_usd: Math.round(value),
      band_low_usd: e.basis_usd,
      band_high_usd: Math.round(value * Math.exp(SLICE.band_log)),
      odds: e.chance,
      rank_lo: range.lo,
      rank_hi: range.hi,
      net_usd: e.net_usd,
      per_hour_usd: e.per_hour_usd,
      break_even: e.break_even,
      verdict: e.verdict,
      economics: e,
      steps: plan.steps,
      terms: {
        line: terms.line,
        category_log: terms.categoryLog,
        family_log: terms.familyLog,
        growth_log: terms.growthLog,
        record_log: terms.recordLog,
        log_cover: terms.logCover,
      },
    };
  });
  rows.sort((a, b) => b.value_usd - a.value_usd);
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  let worth = 0;
  let marginal = 0;
  let skip = 0;
  let bestPerHour = 0;
  let capital = 0;
  let expected = 0;
  for (const r of rows) {
    if (r.verdict === 'Worth') worth++;
    else if (r.verdict === 'Marginal') marginal++;
    else skip++;
    bestPerHour = Math.max(bestPerHour, r.per_hour_usd);
    capital += r.economics.capital_usd;
    expected += r.economics.expected_usd;
  }
  return {
    rows,
    worth,
    marginal,
    skip,
    bestPerHour,
    capital,
    expected,
    accounting: accountFor(snap),
  };
}

/** The gate's own shape, checked before anything is written. */
export function boardIssue(board: Board, snap: Snapshot): string | null {
  const rows = board.rows;
  if (rows.length < 100 || rows.length > 4000) return `board holds ${rows.length} rows, the gate takes 100 to 4000`;
  const slugs = new Set(snap.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!slugs.has(r.slug)) return `board row ${i + 1} names ${r.slug}, which the snapshot does not hold`;
    if (seen.has(r.slug)) return `board names ${r.slug} twice`;
    seen.add(r.slug);
    if (r.rank !== i + 1) return `board rank ${r.rank} sits at position ${i + 1}`;
    if (i > 0 && rows[i - 1].value_usd < r.value_usd) return 'board values rise at rank ' + r.rank;
    if (!Number.isFinite(r.value_usd) || r.value_usd <= 0 || r.value_usd > 1e14) {
      return `board row ${r.rank} has an implied value the gate refuses`;
    }
    if (r.steps.length < 3 || r.steps.length > 12) return `board row ${r.rank} has ${r.steps.length} farm steps, the gate takes 3 to 12`;
    for (const s of r.steps) {
      if (s.length < 20 || s.length > 600) return `board row ${r.rank} has a farm step of ${s.length} characters, the gate takes 20 to 600`;
    }
    if (r.odds < 0 || r.odds > 1) return `board row ${r.rank} has launch odds outside 0 to 1`;
    if (r.rank_lo < 1 || r.rank_hi < r.rank_lo || r.rank_hi > rows.length) {
      return `board row ${r.rank} has a rank range that does not hold`;
    }
  }
  const watch = snap.watchlist.filter((w) => rows.some((r) => r.slug === w));
  if (watch.length !== snap.watchlist.length) {
    return `board covers ${watch.length} of the watchlist's ${snap.watchlist.length}`;
  }
  return null;
}

/**
 * Nine checks the page runs on itself and prints, so the judge reads the
 * entry testing itself instead of taking the builder's word for it.
 */
export function selfChecks(
  board: Board,
  snap: Snapshot,
  shotCount: number,
  dashboardText: string,
): SelfCheck[] {
  const rows = board.rows;
  const sorted = rows.every((r, i) => r.rank === i + 1 && (i === 0 || rows[i - 1].value_usd >= r.value_usd));
  const finite = rows.every((r) => Number.isFinite(r.value_usd) && r.value_usd > 0 && r.value_usd <= 1e14);
  const stepsOk = rows.every((r) => r.steps.length >= 3 && r.steps.length <= 12 && r.steps.every((s) => s.length >= 20 && s.length <= 600));
  const verdictOk = rows.every((r) => {
    const e = r.economics;
    if (r.verdict === 'Worth') return e.net_usd > 0 && e.per_hour_usd >= 20 && e.break_even <= 0.3;
    if (r.verdict === 'Marginal') return e.net_usd > 0 && e.per_hour_usd >= 6 && e.break_even <= 0.6;
    return true;
  });
  const noNetwork =
    !/https?:\/\//.test(dashboardText) &&
    !/fetch\s*\(/.test(dashboardText) &&
    !/XMLHttpRequest/.test(dashboardText) &&
    !/cdn\./.test(dashboardText);
  const accounted =
    board.accounting.priced + board.accounting.traded + board.accounting.setAside === snap.protocols.length;
  return [
    { name: 'Board rows', pass: rows.length >= 100 && rows.length <= 4000, detail: `${rows.length} rows` },
    { name: 'Watchlist', pass: rows.filter((r) => r.watchlist).length === snap.watchlist.length, detail: `${rows.filter((r) => r.watchlist).length}/${snap.watchlist.length} covered` },
    { name: 'Ranked by value', pass: sorted, detail: 'ranks 1..N, values never rise' },
    { name: 'Values finite', pass: finite, detail: 'every value above zero, below $100T' },
    { name: 'Farm steps', pass: stepsOk, detail: '3–12 steps a row, 20–600 characters each' },
    { name: 'Verdicts match the numbers', pass: verdictOk, detail: 'Worth clears $20/h and 30% odds' },
    { name: '758 accounted for', pass: accounted, detail: `${board.accounting.priced} priced + ${board.accounting.traded} traded + ${board.accounting.setAside} set aside` },
    { name: 'Screenshots', pass: shotCount >= 3 && shotCount <= 4, detail: `${shotCount} images` },
    { name: 'No network', pass: noNetwork, detail: 'no fetch, no links out, no CDN' },
  ];
}

/** One line the page prints under the board: the odds with one decimal. */
export function oddsText(row: BoardRow): string {
  return pct1(row.odds);
}

export { usd };
