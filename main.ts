// Token launch radar entry: scores the sealed snapshot and writes board.json, data.js, the dashboard and dossier.json.
// Standard library only, no network. Input: --input (default /input). Output: --output, MAKEFUN_OUTPUT_DIR, else /output.
// Output is byte-identical across runs.

import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

const require = createRequire(import.meta.url);
const Model = require('./dashboard/model.js');

const here = fileURLToPath(new URL('.', import.meta.url));
const FORMULA = 'implied_value_usd = launch value (TVL x fitted size curve read at last week\'s TVL, so 7-day growth moves it, x kept terms, each kept only if it cuts the held-out miss both leave-one-out and walk-forward) x token odds (logistic on the kept terms, fitted on peers that do or do not record a token)';
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function fail(code: number, message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => !n.startsWith('.') && statSync(join(dir, n)).isFile()).sort();
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) fail(2, `token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory>`);
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

let snapshot: any;
try {
  snapshot = JSON.parse(readFileSync(inputFile, 'utf8'));
} catch (e) {
  fail(2, `token radar: snapshot is not valid JSON: ${(e as Error).message}`);
}
if (snapshot === null || typeof snapshot !== 'object' || typeof snapshot.as_of !== 'string'
  || !Array.isArray(snapshot.protocols) || !Array.isArray(snapshot.watchlist)) {
  fail(2, 'token radar: snapshot must be an object with string as_of, array protocols and array watchlist');
}

function issue(rows: any[], snapshot: any): string | null {
 if (!Array.isArray(rows) || rows.length < 100 || rows.length > 4000) return `row count ${rows && rows.length}`;
 const slugs = new Set(snapshot.protocols.map(p => p.slug)), rowSlugs = new Set(rows.map(r => r.slug));
 for (const w of snapshot.watchlist) if (!rowSlugs.has(w)) return `watchlist missing: ${w}`;
 const seen = new Set();
 for (const r of rows) {
  if (seen.has(r.slug) || !slugs.has(r.slug)) return `bad slug: ${r.slug}`;
  seen.add(r.slug);
 }
 let prev = Infinity;
 for (let i = 0; i < rows.length; i++) {
  const r = rows[i], v = r.implied_value_usd;
  if (r.rank !== i + 1) return `rank ${r.rank} at index ${i}`;
  if (!Number.isSafeInteger(v) || v <= 0 || v > 1e14) return `bad implied: ${r.slug}`;
  if (v > prev) return `implied rises at rank ${r.rank}`;
  prev = v;
  if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) return `steps: ${r.slug}`;
  if (r.farm_steps.some(s => typeof s !== 'string' || s.trim().length < 20 || s.trim().length > 600)) return `step length: ${r.slug}`;
  if (typeof r.name !== 'string' || !r.name.trim()) return `name: ${r.slug}`;
 }
 if (rows.every(r => r.implied_value_usd === rows[0].implied_value_usd)) return 'all implied equal';
 return null;
}

const model = Model.build(snapshot);
const rows = Model.boardRows(model);
const problem = issue(rows, snapshot);
if (problem) fail(1, `token radar: board refused: ${problem}`);

const dashNames = listFiles(join(here, 'dashboard'));
const shotNames = listFiles(join(here, 'screenshots'));
if (shotNames.length < 3 || shotNames.length > 4) fail(1, `token radar: screenshots/ holds ${shotNames.length} images: hand in 3 or 4`);
for (const name of shotNames) {
  if (!IMAGE_NAME.test(name)) fail(1, `token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
}
const dashBytes = dashNames.reduce((sum, n) => sum + statSync(join(here, 'dashboard', n)).size, 0);
if (dashBytes > 64800) process.stderr.write(`token radar: warning: dashboard source is ${dashBytes} bytes, over 64800: the dossier text may be cut\n`);

mkdirSync(out, { recursive: true });
const board = {
  version: model.version, as_of: model.as_of, source: model.source, formula: FORMULA,
  value: {
    kept: model.value.kept, terms: model.value.terms, baseline: model.value.baseline, final: model.value.final,
    q: model.value.q, cover: model.value.cover, coef: model.value.coef,
  },
  odds: {
    kept: model.odds.kept, terms: model.odds.terms, baseline: model.odds.baseline, final: model.odds.final,
    coef: model.odds.coef, base_rate: model.odds.base_rate,
  },
  counts: model.counts, groups: model.groups, checksum: Model.fnv(JSON.stringify(rows)), rows,
};
writeFileSync(join(out, 'board.json'), JSON.stringify(board, null, 1) + '\n');
const total = rows.reduce((t: number, r: any) => t + r.implied_value_usd, 0);
const radarBoard = { checksum: board.checksum, n: rows.length, total, rows: rows.map((r: any) => [r.slug, r.rank, r.implied_value_usd]) };
writeFileSync(join(out, 'data.js'), `window.RADAR_SNAPSHOT=${JSON.stringify(snapshot)};window.RADAR_BOARD=${JSON.stringify(radarBoard)};\n`);

mkdirSync(join(out, 'dashboard'), { recursive: true });
for (const name of dashNames) copyFileSync(join(here, 'dashboard', name), join(out, 'dashboard', name));
mkdirSync(join(out, 'screenshots'), { recursive: true });
for (const name of shotNames) copyFileSync(join(here, 'screenshots', name), join(out, 'screenshots', name));

// Written last: the scorer rebuilds the dossier from this output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, {
  text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 },
}));

const c = model.counts;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ranked ${c.ranked}, watchlist covered ${c.watch_covered}/${snapshot.watchlist.length}, early ${c.early}, traded comps ${model.value.n}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashNames.length} files, ${dashBytes} bytes), ${join(out, 'screenshots')} (${shotNames.length} images), ${join(out, 'dossier.json')}\n`,
);
