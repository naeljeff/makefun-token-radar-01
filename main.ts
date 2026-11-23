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
const FORMULA = 'implied_value_usd = tvl_usd x category mcap/TVL multiple of traded tokens (shrunk toward the all-token multiple) x sqrt(1 + clamped 7d TVL change) x runway (ramps in over 540 days with no token, fades after 3 years) x 0.4 when a traded token shares the name';
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

const round4 = (x: number): number => Math.round(x * 10000) / 10000;

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

const model = Model.build(snapshot);
const rows = Model.boardRows(model);
const problem = Model.issue(rows, snapshot);
if (problem) fail(1, `token radar: board refused: ${problem}`);

const dashNames = listFiles(join(here, 'dashboard'));
const shotNames = listFiles(join(here, 'screenshots'));
if (shotNames.length < 3 || shotNames.length > 4) fail(1, `token radar: screenshots/ holds ${shotNames.length} images: hand in 3 or 4`);
for (const name of shotNames) {
  if (!IMAGE_NAME.test(name)) fail(1, `token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
}
const dashBytes = dashNames.reduce((sum, n) => sum + statSync(join(here, 'dashboard', n)).size, 0);
if (dashBytes > 60000) process.stderr.write(`token radar: warning: dashboard source is ${dashBytes} bytes, over 60000: the dossier text may be cut\n`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), JSON.stringify({
  version: model.version, as_of: model.as_of, source: model.source, formula: FORMULA, constants: model.constants,
  comps: {
    traded_tokens: model.comps.n, all_token_multiple: round4(model.comps.global),
    by_category: Object.fromEntries(Object.entries(model.comps.byCategory).map(([k, v]: [string, any]) => [k, { traded: v.n, multiple: round4(v.multiple) }])),
  },
  counts: model.counts, rows,
}) + '\n');
writeFileSync(join(out, 'data.js'), `window.RADAR_SNAPSHOT=${JSON.stringify(snapshot)};\n`);

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
  `token radar: ${snapshot.protocols.length} protocols, ranked ${c.ranked}, watchlist covered ${c.watch_covered}/${snapshot.watchlist.length}, early ${c.early}, traded comps ${model.comps.n}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashNames.length} files, ${dashBytes} bytes), ${join(out, 'screenshots')} (${shotNames.length} images), ${join(out, 'dossier.json')}\n`,
);
