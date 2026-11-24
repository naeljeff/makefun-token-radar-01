import assert from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RM = require('../dashboard/model.js');
// Usage: node test/model.test.mjs <path to the kit's input/snapshot.json>
const snap = require(process.argv[2] || '/input/snapshot.json');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} +/- ${tol}`);

const t0 = performance.now();
const M = RM.build(snap);
const ms = performance.now() - t0;
// The grader allows 120 s a run; a build past 20 s means a loop went quadratic.
assert.ok(ms < 20000, `build took ${ms} ms`);

assert.equal(M.rows.length, 198, 'ranked rows');
assert.equal(M.counts.watch_covered, 40, 'watchlist covered');
assert.equal(M.groups.reduce((s, g) => s + g.n, 0), 758, 'groups sum');
M.rows.forEach((r, i) => {
  assert.equal(r.rank, i + 1, 'rank');
  if (i) assert.ok(r.implied_value_usd <= M.rows[i - 1].implied_value_usd, 'implied non-increasing');
});
const B = RM.boardRows(M);
assert.equal(RM.issue(B, snap), null, 'issue()');
for (const r of M.rows) for (const s of r.plan.map(RM.stepText)) assert.ok(s.length >= 20 && s.length <= 600, `step length ${s.length}`);
assert.equal(JSON.stringify(B), JSON.stringify(RM.boardRows(RM.build(snap))), 'determinism');

near(M.value.baseline.loo, 4.77, 0.05, 'value baseline LOO');
near(M.value.baseline.wf, 4.50, 0.05, 'value baseline WF');
const sz = M.value.terms.find(t => t.term === 'size');
assert.ok(sz.kept, 'size kept');
near(sz.loo, 3.33, 0.05, 'size LOO');
near(sz.wf, 2.79, 0.05, 'size WF');
near(M.odds.baseline.cv, 0.2520, 0.002, 'odds baseline 10-fold');
near(M.odds.baseline.wf, 0.3523, 0.002, 'odds baseline WF');
assert.deepStrictEqual(M.odds.kept, ['years', 'size', 'growth', 'chains'], 'odds kept');
const yr = M.odds.terms.find(t => t.term === 'years');
near(yr.cv, 0.2096, 0.002, 'odds years 10-fold');
near(yr.wf, 0.2205, 0.002, 'odds years WF');
for (const r of M.rows) {
  assert.ok(Math.abs(r.v.net - (r.v.drop - r.v.fees - r.v.forgone)) <= 1e-9, `net identity ${r.slug}`);
  assert.ok(r.plan.some(p => p.kind === 'HOLD'), `HOLD step ${r.slug}`);
}

console.log(`build ${ms.toFixed(0)} ms, ${M.rows.length} rows, all checks passed\n`);
console.log('value terms (baseline loo %s wf %s):', M.value.baseline.loo.toFixed(3), M.value.baseline.wf.toFixed(3));
console.table(M.value.terms.map(t => ({ ...t, loo: +t.loo.toFixed(3), wf: +t.wf.toFixed(3) })));
console.log('value kept', M.value.kept, 'coef', M.value.coef, 'cats', { ...M.value.cats });
console.log('odds terms (baseline cv %s wf %s):', M.odds.baseline.cv.toFixed(4), M.odds.baseline.wf.toFixed(4));
console.table(M.odds.terms.map(t => ({ ...t, cv: +t.cv.toFixed(4), wf: +t.wf.toFixed(4) })));
console.log('odds kept', M.odds.kept, 'coef', M.odds.coef, 'base_rate', M.odds.base_rate.toFixed(3));
console.table(M.odds.cohorts);
console.log('top 10:');
console.table(M.rows.slice(0, 10).map(r => ({ name: r.name, implied: r.implied_value_usd, odds: +r.odds.toFixed(4), verdict: r.v.verdict })));
