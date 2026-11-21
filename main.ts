// Launch Radar, round 4: the program reads the sealed snapshot, fits the comps
// model fresh on every run, prices the pre-token board, plans every farm to
// the dollar, and writes the board, the dashboard's data and the dossier the
// judge reads. Node 22+, standard library only, no network.
//
//   MAKEFUN_OUTPUT_DIR=out node --experimental-strip-types main.ts --input <snapshot.json|dir>
//   main.ts --input /input --output /output   (the grader's own paths)

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard, boardIssue, selfChecks } from './lib/board.ts';
import { isBoardSubject, parseSnapshot } from './lib/data.ts';
import { anchorsOf, fitModel, rankRanges, validateModel } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const has = (name: string): boolean => process.argv.includes(`--${name}`);

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const skipDossier = has('skip-dossier');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const anchors = anchorsOf(snapshot);
const model = fitModel(anchors, snapshot.as_of);
const validation = validateModel(snapshot, anchors);
const subjects = snapshot.protocols.filter(isBoardSubject);
const ranges = rankRanges(anchors, subjects, snapshot.as_of);
const board2 = buildBoard(snapshot, model, ranges);
const issue = boardIssue(board2, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
mkdirSync(join(out, 'dashboard'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board2.rows })}\n`);

/** The dashboard's data, compact: one short array per row, so the page reads whole. */
function dataScript(checks: { name: string; pass: boolean; detail: string }[] | null): string {
  const round = (x: number, d: number): number => {
    const f = 10 ** d;
    return Math.round(x * f) / f;
  };
  // Ten fields a row, in board order (rank is the row's place, 1-based; the
  // family is the category lower-cased and dashed, so it is not stored); the
  // cover, the value, the odds, the band and the whole farm arithmetic are
  // derived on the page from the model and the row, so the data stays small
  // and the page can never disagree with the fit.
  const rows = board2.rows.map((r) => [
    r.slug, r.name, r.category, r.chains.join(' and '), r.tvl_usd,
    r.change_7d === null ? null : round(r.change_7d, 4),
    r.age_years === null ? null : round(r.age_years, 4),
    r.rank_lo, r.rank_hi, r.verdict === 'Worth' ? 0 : r.verdict === 'Marginal' ? 1 : 2,
  ]);
  const doc = {
    rows: board2.rows.length,
    watchlistSlugs: snapshot.watchlist,
    worth: board2.worth,
    marginal: board2.marginal,
    skip: board2.skip,
    bestPerHour: board2.bestPerHour,
    accounting: board2.accounting,
    model: {
      comps: model.comps,
      line: { a: round(model.line.a, 6), b: round(model.line.b, 6) },
      growth: round(model.growth, 6),
      recordSlope: round(model.recordSlope, 6),
      recordRef: model.recordRef,
      recordCap: model.recordCap,
      ratioP10: round(model.ratioP10, 6),
      category: model.category.map((t) => [t.key, t.n, round(t.value, 5)]),
      family: model.family.map((t) => [t.key, t.n, round(t.value, 5)]),
    },
    validation: {
      loo: { n: validation.loo.n, miss: round(validation.loo.medianMiss, 2), w3: round(validation.loo.within3 * 100, 1), w2: round(validation.loo.within2 * 100, 1), bias: round(validation.loo.bias, 2) },
      blind: { n: validation.blind.n, miss: round(validation.blind.medianMiss, 2), w3: round(validation.blind.within3 * 100, 1), w2: round(validation.blind.within2 * 100, 1), bias: round(validation.blind.bias, 2) },
      walkForward: { n: validation.walkForward.n, miss: round(validation.walkForward.medianMiss, 2), w3: round(validation.walkForward.within3 * 100, 1), w2: round(validation.walkForward.within2 * 100, 1), bias: round(validation.walkForward.bias, 2) },
      launch: { n: validation.launch.n, miss: round(validation.launch.medianMiss, 2), w3: round(validation.launch.within3 * 100, 1), w2: round(validation.launch.within2 * 100, 1), bias: round(validation.launch.bias, 2) },
      ablation: validation.ablation.map((a) => [a.term, round(a.medianMiss, 2), round(a.cost, 2)]),
      scatter: validation.scatter.map((p) => [round(p.recorded, 1), round(p.predicted, 1)]),
    },
    checks: checks ?? [],
    rowsData: rows,
  };
  return `window.RADAR = ${JSON.stringify(doc)};\n`;
}

// First pass without the checks, so the checks can read the finished files;
// second pass with the checks baked into the data the page reads.
const firstScript = dataScript(null);
writeFileSync(join(here, 'dashboard', 'zdata.js'), firstScript);
writeFileSync(join(out, 'dashboard', 'zdata.js'), firstScript);

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    if (join(to, name) === join(out, 'dashboard', 'zdata.js')) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3 && !skipDossier) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The nine self-checks, computed from the run itself and printed on the page.
const dashText =
  readdirSync(join(here, 'dashboard'))
    .filter((n) => /\.(html|css|js)$/.test(n))
    .map((n) => readFileSync(join(here, 'dashboard', n), 'utf8'))
    .join('\n');
const checks = selfChecks(board2, snapshot, shots.length, dashText);
const script = dataScript(checks);
writeFileSync(join(here, 'dashboard', 'zdata.js'), script);
writeFileSync(join(out, 'dashboard', 'zdata.js'), script);

if (!skipDossier) {
  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, {
      text_max_bytes: TEXT_MAX_BYTES,
      screenshots: SCREENSHOT_CAPS,
      dashboard: { max_files: 400, max_bytes: 4_194_304 },
    }),
  );
}

const v = validation;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board2.rows.length} rows scored\n` +
    `token radar: fit on ${model.comps} anchors: log r = ${model.line.a.toFixed(4)} + ${model.line.b.toFixed(4)} log(TVL), growth ${model.growth.toFixed(3)}, record slope ${model.recordSlope.toFixed(3)}\n` +
    `token radar: LOO miss x${v.loo.medianMiss.toFixed(2)} within3x ${(v.loo.within3 * 100).toFixed(1)}% (n=${v.loo.n}) | blind x${v.blind.medianMiss.toFixed(2)} ${(v.blind.within3 * 100).toFixed(1)}% (n=${v.blind.n}) | walk-forward x${v.walkForward.medianMiss.toFixed(2)} ${(v.walkForward.within3 * 100).toFixed(1)}% (n=${v.walkForward.n}) | launch x${v.launch.medianMiss.toFixed(2)} ${(v.launch.within3 * 100).toFixed(1)}% (n=${v.launch.n})\n` +
    `token radar: Worth ${board2.worth} / Marginal ${board2.marginal} / Skip ${board2.skip}, best $${board2.bestPerHour}/h\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'dashboard')} and ${join(out, 'screenshots')} (${shots.length} images)${skipDossier ? ' (dossier skipped)' : ` and ${join(out, 'dossier.json')}`}\n`,
);
