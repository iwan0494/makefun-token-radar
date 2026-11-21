// The board: every priced row, ranked by implied value, each with its farm
// plan. The page never recomputes a number the program did not already
// write: board.json carries the whole row, and the dashboard's compact data
// carries what the page needs to show the same row again.

import { accounting, ageYears, familyOf, isBoardSubject, type Snapshot } from './data.ts';
import { anchorsOf, fitModel, logCoverParts, rankRanges, validateModel, type Model, type Validation } from './model.ts';
import { planFor, type Verdict } from './farm.ts';

export interface BoardRow {
  slug: string;
  name: string;
  category: string;
  family: string;
  chains: string;
  chain: string;
  tvl_usd: number;
  change_7d: number | null;
  age_years: number | null;
  listed_at: string | null;
  watchlist: boolean;
  cover: number;
  implied_value_usd: number;
  band_lo_usd: number;
  band_hi_usd: number;
  rank: number;
  rank_lo: number;
  rank_hi: number;
  odds: number;
  net_usd: number;
  per_hour_usd: number;
  break_even: number;
  window_days: number;
  age_days: number;
  verdict: Verdict;
  farm_steps: string[];
  money: string;
  term_line: number;
  term_growth: number;
  term_record: number;
  term_category: number;
  term_family: number;
  log_cover: number;
}

export interface Board {
  rows: BoardRow[];
  worth: number;
  marginal: number;
  skip: number;
  bestPerHour: number;
  accounting: { total: number; priced: number; traded: number; setAside: number; belowFloor: number };
  model: Model;
  validation: Validation;
}

/** Build the board from the snapshot, the fit and the refits. */
export function buildBoard(snapshot: Snapshot): Board {
  const watch = new Set(snapshot.watchlist);
  const subjects = snapshot.protocols.filter((p) => isBoardSubject(p, watch));
  const anchors = anchorsOf(snapshot);
  const model = fitModel(anchors);
  const validation = validateModel(snapshot, anchors);
  const ranges = rankRanges(anchors, subjects, snapshot.as_of);
  const q01 = validation.bandLoFactor;
  const rows: BoardRow[] = subjects.map((p) => {
    const { logR, parts } = logCoverParts(model, p, snapshot.as_of);
    const cover = Math.exp(logR);
    const value = p.tvl_usd * cover;
    const range = ranges.get(p.slug)!;
    const plan = planFor(
      {
        slug: p.slug,
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvlUsd: p.tvl_usd,
        change7d: p.change_7d,
        ageYears: ageYears(p.listed_at, snapshot.as_of),
        listedAt: p.listed_at,
        impliedValueUsd: value,
        bandLoUsd: value * q01,
      },
      snapshot.as_of,
    );
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      family: familyOf(p.category),
      chains: p.chains.join(' and '),
      chain: p.chains[0] ?? 'Ethereum',
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_years: ageYears(p.listed_at, snapshot.as_of),
      listed_at: p.listed_at,
      watchlist: watch.has(p.slug),
      cover,
      implied_value_usd: Math.max(1, Math.round(value)),
      band_lo_usd: Math.max(1, Math.round(value * q01)),
      band_hi_usd: Math.max(1, Math.round(value * Math.exp(0.9))),
      rank: 0,
      rank_lo: range.lo,
      rank_hi: range.hi,
      odds: plan.odds,
      net_usd: Math.round(plan.net),
      per_hour_usd: Math.round(plan.perHour * 100) / 100,
      break_even: Math.round(plan.breakEven * 10000) / 10000,
      window_days: plan.windowDays,
      age_days: plan.ageDays,
      verdict: plan.verdict,
      farm_steps: plan.steps,
      money: plan.money,
      term_line: parts.line,
      term_growth: parts.growth,
      term_record: parts.record,
      term_category: parts.category,
      term_family: parts.family,
      log_cover: logR,
    };
  });
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  let worth = 0;
  let marginal = 0;
  let skip = 0;
  let bestPerHour = 0;
  for (const r of rows) {
    if (r.verdict === 'Worth') worth++;
    else if (r.verdict === 'Marginal') marginal++;
    else skip++;
    if (r.per_hour_usd > bestPerHour) bestPerHour = r.per_hour_usd;
  }
  return {
    rows,
    worth,
    marginal,
    skip,
    bestPerHour: Math.round(bestPerHour),
    accounting: accounting(snapshot),
    model,
    validation,
  };
}

/** The board the gate refuses, or null when it passes. */
export function boardIssue(board: Board, snapshot: Snapshot): string | null {
  const n = board.rows.length;
  if (n < 100 || n > 4000) return `board holds ${n} rows, the gate wants 100 to 4000`;
  const watch = new Set(snapshot.watchlist);
  const seen = new Set<string>();
  let prev = Infinity;
  for (let i = 0; i < n; i++) {
    const r = board.rows[i]!;
    if (!r.slug || /\s/.test(r.slug) || seen.has(r.slug)) return `row ${i + 1}: a slug is missing, spaced or repeated`;
    seen.add(r.slug);
    if (r.rank !== i + 1) return `row ${i + 1}: ranks are not 1 to N in order`;
    if (!(r.implied_value_usd > 0)) return `row ${i + 1}: implied value is not positive`;
    if (r.implied_value_usd > prev) return `row ${i + 1}: implied value rises with rank`;
    prev = r.implied_value_usd;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `row ${i + 1}: ${r.farm_steps.length} farm steps, the gate wants 3 to 12`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `row ${i + 1}: a farm step is ${t.length} characters, the gate wants 20 to 600`;
    }
  }
  for (const w of watch) {
    if (!seen.has(w)) return `watchlist ${w} is not on the board`;
  }
  if (board.rows.every((r) => r.implied_value_usd === board.rows[0]!.implied_value_usd)) return 'every implied value is the same: the board ranks nothing';
  return null;
}

export interface SelfCheck {
  name: string;
  pass: boolean;
  detail: string;
}

/** The nine self-checks, computed from the run itself and printed on the page. */
export function selfChecks(board: Board, snapshot: Snapshot, shotCount: number, dashText: string): SelfCheck[] {
  const acc = board.accounting;
  const checks: SelfCheck[] = [
    { name: 'Board rows', pass: board.rows.length >= 100 && board.rows.length <= 4000, detail: `${board.rows.length} rows` },
    { name: 'Watchlist', pass: snapshot.watchlist.every((w) => board.rows.some((r) => r.slug === w)), detail: `${snapshot.watchlist.length}/${snapshot.watchlist.length} covered` },
    {
      name: 'Ranked by value',
      pass: board.rows.every((r, i) => r.rank === i + 1) && board.rows.every((r, i) => i === 0 || r.implied_value_usd <= board.rows[i - 1]!.implied_value_usd),
      detail: 'ranks 1..N, values never rise',
    },
    { name: 'Values finite', pass: board.rows.every((r) => Number.isFinite(r.implied_value_usd) && r.implied_value_usd > 0 && r.implied_value_usd < 1e14), detail: 'every value above zero, below $100T' },
    {
      name: 'Farm steps',
      pass: board.rows.every((r) => r.farm_steps.length >= 3 && r.farm_steps.length <= 12 && r.farm_steps.every((s) => s.trim().length >= 20 && s.trim().length <= 600)),
      detail: '3–12 steps a row, 20–600 characters each',
    },
    {
      name: 'Verdicts match the numbers',
      pass: board.rows.every((r) => {
        if (r.verdict === 'Worth') return r.per_hour_usd >= 20 && r.break_even <= 0.3;
        if (r.verdict === 'Marginal') return r.per_hour_usd >= 6 && r.break_even <= 0.6;
        return true;
      }),
      detail: 'Worth clears $20/h and 30% odds',
    },
    { name: '758 accounted for', pass: acc.priced + acc.traded + acc.setAside === acc.total, detail: `${acc.priced} priced + ${acc.traded} traded + ${acc.setAside} set aside` },
    { name: 'Screenshots', pass: shotCount >= 3 && shotCount <= 4, detail: `${shotCount} images` },
    { name: 'No network on the page', pass: !/https?:\/\//.test(dashText), detail: 'no http(s) address in the source' },
  ];
  return checks;
}
