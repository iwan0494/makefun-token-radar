// Launch Radar: one sealed snapshot in, one ranked board of early protocols out.
//
//   node main.ts --input ../kit/input/snapshot.json --output out
//
// The order, and why:
//   1. read the snapshot (lib/comps.ts reads nothing else) and fit the comps model from the snapshot's
//      own traded tokens. The model is always fitted here, from these bytes; there is no frozen list of
//      parameters and no protocol name anywhere in the fit.
//   2. price every early protocol at the one-year horizon and rank the board (lib/board.ts), writing
//      /output/board.json with the gate's fields and the terms each row was priced with.
//   3. validate the fit the only way a one-day snapshot allows (lib/validate.ts): a record priced by a
//      model that never saw it, a listing priced the same way, a later-snapshot split, and an ablation.
//   4. copy dashboard/ to /output/dashboard/ with the page's only data, data.js, beside index.html; copy
//      screenshots/; write /output/dossier.json with the vendored make.fun library.
//
// Node 22 or newer, the standard library only, no network, no environment besides MAKEFUN_OUTPUT_DIR.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRadar } from './lib/board.ts';
import { fitComps } from './lib/comps.ts';
import { dataScript, pageData } from './lib/data.ts';
import { validate } from './lib/validate.ts';
import { buildDossier } from './vendor/makefun-board.ts';
import type { Snapshot } from './lib/types.ts';

const here = fileURLToPath(new URL('./', import.meta.url));

/** The scorer's caps: the text cap shapes the dossier, the rest refuse an entry the gate would. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}\.(png|jpg|jpeg|webp|gif)$/i;
const MAX_ROWS = 4_000;
const MIN_ROWS = 100;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`launch radar: ${message}\n`);
  process.exit(1);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`);
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

/** The snapshot, checked field by field before a single number is read from it. */
function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Partial<Snapshot>;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist) || typeof raw.as_of !== 'string') {
    fail('the snapshot is not the ten-field document this entry reads: no protocols array, no watchlist, no as_of');
  }
  const protocols = raw.protocols.map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category ?? null,
    chains: Array.isArray(p.chains) ? p.chains : [],
    tvl_usd: Number(p.tvl_usd),
    change_7d: typeof p.change_7d === 'number' ? p.change_7d : null,
    mcap_usd: typeof p.mcap_usd === 'number' ? p.mcap_usd : null,
    listed_at: p.listed_at ?? null,
    gecko_id: p.gecko_id ?? null,
    symbol: p.symbol ?? null,
  }));
  return {
    as_of: raw.as_of,
    source: typeof raw.source === 'string' ? raw.source : 'DefiLlama protocols',
    floor_usd: typeof raw.floor_usd === 'number' ? raw.floor_usd : 50_000_000,
    protocols,
    watchlist: raw.watchlist,
  };
}

/** The gate's own checks, run here so a refused board fails in this run and not at the scorer. */
function gateIssue(rows: Array<{ slug: string; name: string; rank: number; implied_value_usd: number; farm_steps: string[] }>, snapshot: Snapshot): string | null {
  if (rows.length < MIN_ROWS || rows.length > MAX_ROWS) return `the board holds ${rows.length} rows, outside ${MIN_ROWS}–${MAX_ROWS}`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const row of rows) {
    if (!known.has(row.slug)) return `a row names ${row.slug}, which the snapshot does not list`;
    if (seen.has(row.slug)) return `${row.slug} is on the board twice`;
    seen.add(row.slug);
    if (typeof row.name !== 'string' || row.name.trim() === '') return `${row.slug} has no name`;
    if (!Number.isInteger(row.rank) || row.rank < 1) return `${row.slug} has no rank`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1 || row.implied_value_usd > 100_000_000_000_000) return `${row.slug} has no whole implied value`;
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} carries ${row.farm_steps?.length ?? 0} farm steps, outside 3–12`;
    for (const step of row.farm_steps) {
      if (typeof step !== 'string' || step.trim().length < 20 || step.trim().length > 600) return `${row.slug} carries a farm step of ${typeof step === 'string' ? step.trim().length : 0} characters, outside 20–600`;
    }
  }
  const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i += 1) if (ranks[i] !== i + 1) return `the ranks are not exactly 1 to ${rows.length}`;
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i]!.implied_value_usd > rows[i - 1]!.implied_value_usd) return `rank ${rows[i]!.rank} carries more value than the rank above it`;
  }
  if (new Set(rows.map((r) => r.implied_value_usd)).size === 1) return 'every row carries the same implied value';
  const missing = snapshot.watchlist.filter((slug) => !seen.has(slug));
  if (missing.length > 0) return `${missing.length} watchlist protocols are missing: ${missing.slice(0, 4).join(', ')}`;
  return null;
}

const started = Date.now();
const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const fitStarted = Date.now();
const model = fitComps(snapshot.protocols, snapshot.as_of, { lo: -2, hi: 0.5 }, { hold_on: false });
const fitMs = Date.now() - fitStarted;
const radar = buildRadar(snapshot, model);
if (radar.coverage.missing.length > 0) fail(`the board leaves ${radar.coverage.missing.length} watchlist protocols out: ${radar.coverage.missing.slice(0, 4).join(', ')}`);
const issue = gateIssue(radar.rows, snapshot);
if (issue !== null) fail(`the board the model wrote would fail the gate: ${issue}`);

const validation = validate(model, snapshot);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: radar.rows })}\n`);

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashboardFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
if (!dashboardFiles.includes('index.html')) fail('dashboard/ carries no index.html');
// data.js sits beside radar.js and index.html, and index.html loads it last: the dossier shows source by
// path and cuts the first file past 65,536 bytes, and data.js is far past it, so it must be the file that
// is cut, never the page that reads it.
writeFileSync(join(out, 'dashboard', 'data.js'), dataScript(pageData(radar, snapshot, validation)));
dashboardFiles.push('data.js');
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
if (shots.length > SCREENSHOT_CAPS.max) fail(`screenshots/ holds ${shots.length} images, more than the gate's ${SCREENSHOT_CAPS.max}`);
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
  if (statSync(join(out, 'screenshots', name)).size > SCREENSHOT_CAPS.max_bytes) fail(`screenshots/${name} is past the gate's 512 KiB cap`);
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }));

const seconds = ((Date.now() - started) / 1000).toFixed(1);
const verdicts = radar.rows.reduce<Record<string, number>>((at, r) => {
  at[r.farm.verdict] = (at[r.farm.verdict] ?? 0) + 1;
  return at;
}, {});
process.stdout.write(
  `launch radar: fit on ${model.pool.comps} comps of ${model.pool.traded} traded tokens in ${fitMs} ms; line a ${model.line.a.toFixed(3)} b ${model.line.b.toFixed(3)}; hold ${model.hold.a.toFixed(3)} + ${model.hold.b.toFixed(3)} log(1+age)\n` +
    `launch radar: ${radar.rows.length} rows ranked (${radar.coverage.watch_ranked}/${snapshot.watchlist.length} on the watchlist, ${radar.coverage.ranked_below_floor} below the floor), ${radar.coverage.traded_set_aside} traded set aside; plans Worth ${verdicts.Worth ?? 0} / Marginal ${verdicts.Marginal ?? 0} / Skip ${verdicts.Skip ?? 0}\n` +
    `launch radar: wrote board.json, data.js, dashboard/ (${dashboardFiles.length} files), screenshots/ (${shots.length}) and dossier.json to ${out} in ${seconds}s\n`,
);
