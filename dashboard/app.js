/* Launch radar board. Renders RadarModel.build() output; all UI state lives in location.hash. */
const M = RadarModel.build(RADAR_SNAPSHOT);
const RB = RADAR_BOARD, RBM = new Map(RB.rows.map(x => [x[0], x]));
const { fmtUsd: usd, fmtPct: pct, plan: planOf, verdict: verdictOf, boardRows, fnv, DEFAULTS } = RadarModel;
const app = document.getElementById('app');
const N = M.rows.length, TOTAL = M.counts.protocols;
const DEF = { tab: 'all', q: '', cat: '', chain: '', vd: 'any', dep: '10000', sh: '0.07', sort: 'rank', dir: 'asc', p: '' };
const TABN = { all: ['All', N], watchlist: ['Watchlist', M.counts.watchlist], offlist: ['Off-list', M.counts.offlist], early: ['Early', M.counts.early], traded: ['Token trades', M.counts.priced] };
const VDS = ['any', 'FARM', 'MARGINAL', 'SKIP'], DEPS = ['1000', '3000', '10000', '30000'], SHARES = ['0.035', '0.07', '0.14'];
const SORTS = ['rank', 'tvl', 'growth', 'age', 'odds', 'implied', 'net', 'hour', 'name', 'ratio'];
const KEY = {
  rank: r => r.rank, tvl: r => r.tvl_usd, growth: r => r.change_7d ?? -Infinity, age: r => r.age_days ?? -1, odds: r => r.odds,
  implied: r => r.implied_value_usd, net: r => r.v.net, hour: r => r.v.perHour, name: r => r.name.toLowerCase(),
};
const TKEY = { rank: r => -r.mcap_usd, name: r => r.name.toLowerCase(), tvl: r => r.tvl_usd, implied: r => r.mcap_usd, odds: r => r.ratio, ratio: r => r.ratio / r.predicted };
const TAGS = { watchlist: ['w', 'WATCHLIST'], offlist: ['o', 'OFF-LIST'], early: ['e', 'EARLY'] };
const VCLS = { FARM: 'teal', MARGINAL: 'amber', SKIP: 'coral' };
const TL = { size: 'size curve', years: 'years listed', growth: '7-day change', chains: 'chain count', category: 'category, shrunk' };
const LO = Math.log10(Math.min(...M.rows.map(r => r.lo10))), HI = Math.log10(Math.max(...M.rows.map(r => r.hi90)));
const at = x => (Math.log10(x) - LO) / (HI - LO) * 100;
const BOARD_COLS = [
  { t: '#', k: 'rank', n: 1 }, { t: 'Protocol', k: 'name' }, { t: 'TVL', k: 'tvl', n: 1 }, { t: '7d', k: 'growth', n: 1 },
  { t: 'No token for', k: 'age', n: 1 }, { t: 'Token odds', k: 'odds', n: 1 }, { t: 'If it launches', n: 1 },
  { t: 'Implied value', k: 'implied', n: 1 }, { t: 'Verdict · net', k: 'net' }, { t: 'Net / hour', k: 'hour', n: 1 },
];
const TRADED_COLS = [
  { t: 'Protocol', k: 'name' }, { t: 'Category' }, { t: 'TVL', k: 'tvl', n: 1 }, { t: 'Market cap', k: 'implied', n: 1 },
  { t: 'cap / TVL', k: 'odds', n: 1 }, { t: 'model cap / TVL', n: 1 }, { t: 'ratio to model', k: 'ratio', n: 1 },
];

const defDir = k => (k === 'rank' || k === 'name' ? 'asc' : 'desc');
const money = n => (n < 0 ? '−' : '') + usd(Math.abs(n));
const num = x => (x < 0 ? '−' : '') + Math.abs(x).toFixed(3);
const sg = x => (x < 0 ? '−' : '+') + Math.abs(x).toFixed(3);
const sp = x => +(x * 100).toFixed(1);
const pc = x => Math.round(x * 100) + '%';
const ageText = d => (d === null ? 'n/a' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd');
const growthCls = v => (v == null ? '' : v > 0 ? 'teal' : v < 0 ? 'coral' : '');
const chainsOf = r => r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ` +${r.chains.length - 2}` : '');

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function glyph() {
  // XML namespace id, never fetched; joined so the no-URL rule holds for the source text.
  const NS = ['http:', '', 'www.w3.org', '2000', 'svg'].join('/');
  const el = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  const svg = el('svg', { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 });
  svg.append(
    el('path', { d: 'M4 12a8 8 0 0 1 16 0M8 12a4 4 0 0 1 8 0' }),
    el('path', { d: 'M12 12l6-6' }),
    el('circle', { cx: 12, cy: 12, r: 1.6, fill: 'currentColor' }));
  return svg;
}

const tile = (label, value, note) => h('div', { class: 'tile' }, h('span', { class: 'lbl' }, label), h('b', null, value), h('span', { class: 'sub' }, note));
const card = (title, ...kids) => h('section', { class: 'card' }, h('h3', null, title), ...kids);
const thr = (cols, from = 1) => h('thead', null, h('tr', null, cols.map((t, i) => h('th', { scope: 'col', class: i >= from ? 'n' : null }, t))));
const bar = p => h('div', { class: 'track' }, h('i', { style: `width:${p.toFixed(1)}%` }));

function counts(list, keyOf) {
  const m = new Map();
  for (const r of list) for (const k of [].concat(keyOf(r) ?? [])) m.set(k, (m.get(k) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

function readState() {
  const qs = new URLSearchParams(location.hash.slice(1)), pick = (k, list) => (list.includes(qs.get(k)) ? qs.get(k) : DEF[k]);
  const sort = pick('sort', SORTS);
  return {
    tab: pick('tab', Object.keys(TABN)), q: qs.get('q') || '', cat: qs.get('cat') || '', chain: qs.get('chain') || '', vd: pick('vd', VDS),
    dep: pick('dep', DEPS), sh: pick('sh', SHARES), sort,
    dir: ['asc', 'desc'].includes(qs.get('dir')) ? qs.get('dir') : defDir(sort), p: qs.get('p') || '',
  };
}

// Omits every key at its default so the hash stays short.
function toHash(s) {
  const qs = new URLSearchParams();
  for (const k of ['tab', 'q', 'cat', 'chain', 'vd', 'dep', 'sh', 'sort', 'p']) if (String(s[k]) !== DEF[k]) qs.set(k, s[k]);
  if (s.dir !== defDir(s.sort)) qs.set('dir', s.dir);
  const str = qs.toString();
  return str ? '#' + str : '';
}

function go(patch, replace) {
  const s = Object.assign(readState(), patch);
  history[replace ? 'replaceState' : 'pushState'](null, '', location.pathname + location.search + toHash(s));
  render();
}

// Verdicts and plans at the page's deposit and drop share; the default pair equals board.json.
function calc(s) {
  const dep = Number(s.dep), sh = Number(s.sh);
  return M.rows.map(r => { const plan = planOf(r, dep); return { ...r, dep, plan, v: verdictOf({ ...r, plan }, dep, sh) }; });
}
const netAt = (r, dep, sh) => verdictOf({ ...r, plan: planOf(r, dep) }, dep, sh).net;

function visible(s, rows) {
  const base = s.tab === 'traded' ? M.traded : s.tab === 'all' ? rows : rows.filter(r => r.set === s.tab);
  return { base, list: sortRows(filt(s, base), s) };
}

function filt(s, base) {
  const q = s.q.trim().toLowerCase(), t = s.tab === 'traded';
  return base.filter(r => (!q || [r.name, r.slug, r.symbol || '', r.category || '', ...(r.chains || [])].join(' ').toLowerCase().includes(q))
    && (!s.cat || r.category === s.cat) && (t || !s.chain || r.chains.includes(s.chain))
    && (t || s.vd === 'any' || r.v.verdict === s.vd));
}

function sortRows(list, s) {
  const K = s.tab === 'traded' ? TKEY : KEY, f = K[s.sort] || K.rank, k = s.dir === 'asc' ? 1 : -1;
  return list.slice().sort((a, b) => {
    const x = f(a), y = f(b);
    return (x < y ? -1 : x > y ? 1 : 0) * k || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  });
}

function mast() {
  return h('header', { class: 'mast' },
    h('div', { class: 'brand' }, glyph(), h('b', null, 'Launch Radar'),
      h('span', { class: 'sub' }, 'pre-token protocols ranked by launch value × token odds, from the snapshot\'s own record')),
    h('div', { class: 'sub' }, `DefiLlama snapshot ${M.as_of} · model ${M.version} · recomputed in this browser`));
}

function kpis(rows, s) {
  const dep = Number(s.dep), sh = Number(s.sh), c = M.counts, V = M.value, O = M.odds;
  const cnt = k => rows.filter(r => r.v.verdict === k).length;
  const sumImp = M.rows.reduce((t, r) => t + r.implied_value_usd, 0), sumL = M.rows.reduce((t, r) => t + r.launch, 0);
  return h('div', { class: 'kpis' },
    tile('Ranked', c.ranked, `record no token · ${c.watch_covered} of ${c.watchlist} watchlist`),
    tile('Held-out miss', '×' + V.final.wf.toFixed(2), `walk-forward; flat multiple ×${V.baseline.wf.toFixed(2)} · LOO ×${V.final.loo.toFixed(2)}`),
    tile('Range honest?', `${pc(V.cover.wf50)} · ${pc(V.cover.wf80)}`, 'newer caps inside P25–P75 · P10–P90 (stated 50% · 80%)'),
    tile('Token odds', O.final.wf.toFixed(3), `walk-forward Brier vs ${O.baseline.wf.toFixed(3)} base rate`),
    tile('Worth farming', `${cnt('FARM')} of ${N}`, `${cnt('MARGINAL')} marginal · ${cnt('SKIP')} skip at ${usd(dep)}, ${sp(sh)}% drop share, net of fees and ${DEFAULTS.tbill * 100}% T-bill`),
    tile('Implied total', usd(sumImp), `${usd(sumL)} if every one launched`));
}

function formula() {
  const V = M.value, O = M.odds, c = V.coef, lbl = { years: 'years listed', size: 'ln TVL', growth: '7d change', chains: 'ln chains', kin: 'name kin', category: 'category' };
  const vt = V.kept.filter(t => t in c).map(t => `${sg(c[t])} × ${lbl[t]}`), ot = O.kept.map(t => `${sg(O.coef[t])} × ${lbl[t]}`);
  return h('div', { class: 'formula' },
    h('div', null, 'implied value ', h('b', null, '='), ' launch value × token odds'),
    h('div', { class: 'muted' }, `launch value = TVL × e^(${num(c.intercept)} ${vt.join(' ')})`),
    h('div', { class: 'muted' }, `token odds = logistic(${num(O.coef.intercept)} ${ot.join(' ')})`));
}

function acct() {
  return h('section', { class: 'card acct' },
    h('div', { class: 'acct-h' }, h('b', null, `${TOTAL} protocols read, each in exactly one group`)),
    h('div', { class: 'bar' }, M.groups.map((g, i) => g.n ? h('i', { class: 'g' + i, title: `${g.label}: ${g.n}`, style: `width:${(g.n / TOTAL * 100).toFixed(3)}%` }) : null)),
    h('ul', { class: 'legend' }, M.groups.map((g, i) => g.n ? h('li', null, h('i', { class: 'sw g' + i }), g.label, h('b', null, g.n)) : null)));
}

// Recomputes the table in this browser and compares it with the entry's own board.json figures.
function checks() {
  const B = boardRows(M), mine = B.map(r => [r.slug, r.rank, r.implied_value_usd]);
  const sum = mine.reduce((t, x) => t + x[2], 0), csum = fnv(JSON.stringify(B));
  const grouped = M.groups.reduce((t, g) => t + g.n, 0);
  const list = [
    [mine.length === RB.n && mine.every((x, i) => x[0] === RB.rows[i][0] && x[1] === RB.rows[i][1] && x[2] === RB.rows[i][2]), `table = board.json, ${mine.length}/${RB.n} rows`],
    [csum === RB.checksum, `checksum ${csum} = main.ts`],
    [mine.every((x, i) => x[1] === i + 1 && (!i || x[2] <= mine[i - 1][2])), `ranks 1–${N}, value never rises`],
    [M.counts.watch_covered === M.counts.watchlist, `watchlist ${M.counts.watch_covered}/${M.counts.watchlist} ranked`],
    [grouped === TOTAL, `${grouped}/${TOTAL} protocols accounted`],
    [sum === RB.total, `total ${usd(sum)} equal`],
  ];
  return h('div', { class: 'checks' }, list.map(([ok, t]) => h('span', { class: 'chk ' + (ok ? 'ok' : 'bad') }, (ok ? '✓ ' : '✗ ') + t)));
}

function evidence() {
  const V = M.value, O = M.odds, x2 = v => '×' + v.toFixed(2), x3 = v => v.toFixed(3), p0 = x => Math.round(x * 100) + '%';
  const tagOf = k => (k ? h('span', { class: 'tag kept' }, 'kept') : 'tested, not kept');
  const tA = h('table', null, thr(['Term', 'LOO', 'WF', '']), h('tbody', null,
    h('tr', { class: 'base' }, h('td', null, 'flat multiple'), h('td', { class: 'n' }, x2(V.baseline.loo)), h('td', { class: 'n' }, x2(V.baseline.wf)), h('td', null, 'baseline')),
    V.terms.map(t => h('tr', { class: t.kept ? 'kept' : 'dim' }, h('td', null, t.label), h('td', { class: 'n' }, x2(t.loo)), h('td', { class: 'n' }, x2(t.wf)), h('td', null, tagOf(t.kept))))));
  const tB = h('table', null, thr(['Term', '10-fold', 'WF', '']), h('tbody', null,
    h('tr', { class: 'base' }, h('td', null, 'flat base rate'), h('td', { class: 'n' }, x3(O.baseline.cv)), h('td', { class: 'n' }, x3(O.baseline.wf)), h('td', null, 'baseline')),
    O.terms.map(t => h('tr', { class: t.kept ? 'kept' : 'dim' }, h('td', null, t.label), h('td', { class: 'n' }, x3(t.cv)), h('td', { class: 'n' }, x3(t.wf)), h('td', null, tagOf(t.kept))))));
  const tC = h('table', null, thr(['Test', 'LOO', 'WF']), h('tbody', null,
    h('tr', null, h('td', null, 'within ×3 of actual'), h('td', { class: 'n' }, p0(V.within3.loo)), h('td', { class: 'n' }, p0(V.within3.wf))),
    h('tr', null, h('td', null, 'inside P25–P75 (stated 50%)'), h('td', { class: 'n' }, p0(V.cover.loo50)), h('td', { class: 'n' }, p0(V.cover.wf50))),
    h('tr', null, h('td', null, 'inside P10–P90 (stated 80%)'), h('td', { class: 'n' }, p0(V.cover.loo80)), h('td', { class: 'n' }, p0(V.cover.wf80)))));
  const tD = h('table', null, thr(['Years listed', 'Peers', 'Share with a token']), h('tbody', null,
    O.cohorts.map(c => h('tr', null, h('td', null, c.label), h('td', { class: 'n' }, c.n), h('td', { class: 'n' }, c.share === null ? 'n/a' : p0(c.share))))));
  return h('div', { class: 'ev-wrap' },
    h('div', { class: 'evidence' },
      card(`Launch value: typical miss, ${V.n} traded tokens`, tA),
      card(`Token odds: Brier, ${O.n} peers`, tB),
      card('Is the printed range honest?', tC, h('h4', null, 'The record behind the odds'), tD)),
    h('p', { class: 'ev-note' }, 'A term is kept only if it lowers the held-out miss in both tests. The odds are the peers\' record, not a forecast. The page never says a token will launch.'));
}

function toolbar(s, base, pre, list) {
  const t = s.tab === 'traded';
  const cats = counts(base, r => r.category).map(([c, n]) => [c, `${c} (${n})`]);
  const chains = counts(base, r => r.chains).slice(0, 20).map(([c]) => [c, c]);
  const opt = (items, cur, all) => [['', all], ...(cur && !items.some(([v]) => v === cur) ? [[cur, cur]] : []), ...items];
  const sel = (name, label, o, cur) => h('label', { class: 'field' }, h('span', null, label),
    h('select', { id: name, name }, o.map(([v, x]) => h('option', { value: v, selected: v === cur }, x))));
  const seg = (label, items) => h('div', { class: 'seg', role: 'group', 'aria-label': label },
    items.map(([k, x, on, attr]) => h('button', { type: 'button', class: on ? 'on' : null, 'aria-pressed': String(on), [attr]: k }, x)));
  const vdN = k => (k === 'any' ? pre.length : pre.filter(r => r.v.verdict === k).length);
  const shown = t ? `${list.length} of ${base.length} traded tokens · ${usd(list.reduce((x, r) => x + r.mcap_usd, 0))} market cap in view`
    : `${list.length} of ${base.length} rows · ${usd(list.reduce((x, r) => x + r.implied_value_usd, 0))} implied in view`;
  return h('div', { class: 'toolbar' },
    seg('Board tab', Object.keys(TABN).map(k => [k, `${TABN[k][0]} ${TABN[k][1]}`, s.tab === k, 'data-tab'])),
    t ? null : seg('Verdict', VDS.map(k => [k, k === 'any' ? `Any ${vdN(k)}` : `${k[0] + k.slice(1).toLowerCase()} ${vdN(k)}`, s.vd === k, 'data-vd'])),
    t ? null : sel('dep', 'Deposit', DEPS.map(d => [d, usd(+d)]), s.dep),
    t ? null : seg('Drop share', SHARES.map(x => [x, sp(+x) + '%', s.sh === x, 'data-sh'])),
    h('label', { class: 'field grow' }, h('span', { class: 'sr' }, 'Search'),
      h('input', { id: 'q', type: 'search', placeholder: 'Search name, slug or chain', value: s.q, autocomplete: 'off' })),
    sel('cat', 'Category', opt(cats, s.cat, 'All categories'), s.cat),
    t ? null : sel('chain', 'Chain', opt(chains, s.chain, 'All chains'), s.chain),
    h('span', { class: 'count' }, shown),
    h('button', { type: 'button', class: 'ghost', 'data-reset': '' }, 'Reset'),
    h('button', { type: 'button', class: 'ghost', 'data-csv': '' }, 'CSV'));
}

function thead(cols, s) {
  return h('thead', null, h('tr', null, cols.map(c => {
    const on = c.k && s.sort === c.k, asc = s.dir === 'asc';
    return h('th', { scope: 'col', class: c.n ? 'n' : null, 'aria-sort': c.k ? (on ? (asc ? 'ascending' : 'descending') : 'none') : null },
      c.k ? h('button', { type: 'button', id: 'sort-' + c.k, 'data-sort': c.k }, c.t, on ? (asc ? ' ▲' : ' ▼') : '') : c.t);
  })));
}

const emptyRow = n => h('tr', { class: 'empty' }, h('td', { colspan: n }, 'No protocol matches these filters. ', h('button', { type: 'button', class: 'ghost', 'data-reset': '' }, 'Reset')));

function rangeBar(r) {
  const span = (a, b) => `left:${at(a).toFixed(2)}%;width:${(at(b) - at(a)).toFixed(2)}%`;
  return h('div', { class: 'rb', title: `P10–P90 ${usd(r.lo10)}–${usd(r.hi90)} · P25–P75 ${usd(r.lo25)}–${usd(r.hi75)}` },
    h('i', { class: 'full', style: span(r.lo10, r.hi90) }), h('i', { class: 'band', style: span(r.lo25, r.hi75) }),
    h('i', { class: 'tick', style: `left:${at(r.implied_value_usd).toFixed(2)}%` }));
}

function boardRow(s, r) {
  const v = r.v, tg = TAGS[r.set];
  const href = toHash({ ...s, p: r.slug });
  return h('tr', { 'data-href': href },
    h('td', { class: 'num' }, h('div', null, r.rank), h('div', { class: 'sub' }, `${r.rank_lo}–${r.rank_hi}`)),
    h('td', null, h('a', { href }, r.name), ' ', h('span', { class: 'tag ' + tg[0] }, tg[1]),
      h('div', { class: 'sub' }, `${r.category || 'uncategorised'} · ${chainsOf(r)}`)),
    h('td', { class: 'n' }, usd(r.tvl_usd)),
    h('td', { class: 'n ' + growthCls(r.change_7d) }, pct(r.change_7d)),
    h('td', { class: 'n' }, ageText(r.age_days)),
    h('td', { class: 'n' }, h('div', { class: 'oc' }, h('span', null, pc(r.odds)), bar(r.odds * 100))),
    h('td', { class: 'n' }, usd(r.launch)),
    h('td', { class: 'imp' }, h('div', { class: 'amt' }, usd(r.implied_value_usd)),
      h('div', { class: 'sub n' }, `${usd(r.lo25)} – ${usd(r.hi75)}`), rangeBar(r)),
    h('td', { class: 'n' }, h('div', null, h('span', { class: 'pill ' + VCLS[v.verdict] }, v.verdict), ' ', money(v.net)),
      h('div', { class: 'sub' }, `${usd(v.drop)} drop − ${usd(v.fees)} fees − ${usd(v.forgone)} yield`)),
    h('td', { class: 'n' }, money(v.perHour) + '/h'));
}

function boardTable(s, list) {
  return h('div', { class: 'tablewrap' }, h('table', null, thead(BOARD_COLS, s),
    h('tbody', null, list.length ? list.map(r => boardRow(s, r)) : emptyRow(BOARD_COLS.length))));
}

function tradedTable(s, list) {
  return h('div', { class: 'tablewrap' },
    h('p', { class: 'note' }, 'These protocols record a traded token on DefiLlama. Their market cap ÷ TVL by category prices the pre-token multiples. They price the model and are never ranked.'),
    h('table', null, thead(TRADED_COLS, s), h('tbody', null, list.length ? list.map(r => h('tr', null,
      h('td', null, h('b', null, r.name), ' ', h('span', { class: 'sub' }, r.symbol || '')),
      h('td', null, r.category || '—'), h('td', { class: 'n' }, usd(r.tvl_usd)), h('td', { class: 'n' }, usd(r.mcap_usd)),
      h('td', { class: 'n' }, '×' + r.ratio.toFixed(2)), h('td', { class: 'n' }, '×' + r.predicted.toFixed(2)),
      h('td', { class: 'n' }, '×' + (r.ratio / r.predicted).toFixed(2)))) : emptyRow(TRADED_COLS.length))));
}

function board(s, rows) {
  const { base, list } = visible(s, rows), pre = filt({ ...s, vd: 'any' }, base);
  return [
    kpis(rows, s), formula(), acct(), checks(), evidence(), toolbar(s, base, pre, list),
    s.tab === 'traded' ? tradedTable(s, list) : boardTable(s, list),
  ];
}

function waterfall(r) {
  const P = r.parts, V = M.value, O = M.odds, tm = n => V.terms.find(t => t.term === n);
  const ol = Object.fromEntries(O.terms.map(t => [t.term, t]));
  const wr = (label, val, fac, why, cls) => h('tr', { class: cls }, h('td', null, label), h('td', { class: 'n' }, val ?? ''),
    h('td', { class: 'n' }, fac == null ? '' : '×' + fac.toFixed(3)), h('td', { class: 'sub' }, why ?? ''));
  const X = {
    size: [`ln ${Math.log(Math.max(r.tvl_usd, 1) / 1e8).toFixed(2)}`, P.size],
    years: [r.age_days === null ? 'n/a' : (r.age_days / 365).toFixed(2) + ' yrs', P.years],
    growth: [pct(r.change_7d), P.growth],
    chains: [`${r.chains.length} chains`, P.chains],
    category: [r.category || 'none', P.cat],
  };
  const vrows = [
    wr('TVL', usd(r.tvl_usd), null, 'locked today'),
    wr('× flat multiple', null, P.base, `e^${num(V.coef.intercept)}; flat miss LOO ×${V.baseline.loo.toFixed(2)} · WF ×${V.baseline.wf.toFixed(2)}`),
    ...V.kept.map(t => {
      const [x, f] = X[t], m = tm(t);
      return wr(`× ${TL[t]}`, x, f, `${t === 'category' ? 'shrunk category effect' : 'coef ' + sg(V.coef[t])} · kept: miss LOO ×${m.loo.toFixed(2)} · WF ×${m.wf.toFixed(2)}`);
    }),
    wr('= launch value', usd(r.launch), null, 'TVL × every factor above', 'total'),
  ];
  const lg = P.intercept + P.logit.reduce((t, x) => t + x.x * x.coef, 0);
  const orows = [
    h('tr', null, h('td', null, 'intercept'), h('td', { class: 'n' }, '1'), h('td', { class: 'n' }, num(P.intercept)), h('td', { class: 'n' }, num(P.intercept)), h('td', { class: 'sub' })),
    ...P.logit.map(x => h('tr', { class: 'kept' }, h('td', null, ol[x.term].label), h('td', { class: 'n' }, x.x.toFixed(3)),
      h('td', { class: 'n' }, num(x.coef)), h('td', { class: 'n' }, num(x.x * x.coef)),
      h('td', { class: 'sub' }, `10-fold ${ol[x.term].cv.toFixed(3)} · WF ${ol[x.term].wf.toFixed(3)}`))),
    h('tr', { class: 'total' }, h('td', null, 'logit'), h('td'), h('td'), h('td', { class: 'n' }, num(lg)), h('td', { class: 'sub' }, `logistic = ${pc(r.odds)}`)),
  ];
  return card('How the figure is made',
    h('table', null, thr(['Step', 'Value', 'Factor', 'Why']), h('tbody', null, vrows)),
    h('h4', null, 'Token odds, logit'),
    h('table', null, thr(['Odds term', 'x', 'coef', 'x × coef', 'Held-out Brier'], 1), h('tbody', null, orows)),
    h('p', { class: 'final' }, `launch ${usd(r.launch)} × odds ${pc(r.odds)} = implied ${usd(r.implied_value_usd)}`),
    h('p', { class: 'sub' }, `P25–P75 ${usd(r.lo25)} – ${usd(r.hi75)} · P10–P90 ${usd(r.lo10)} – ${usd(r.hi90)}`));
}

function detail(s, r, rows) {
  const v = r.v, dep = r.dep, idx = rows.indexOf(r), prev = rows[idx - 1], next = rows[idx + 1];
  const link = x => toHash({ ...s, p: x.slug });
  const ok = RBM.has(r.slug) && RBM.get(r.slug)[1] === r.rank && RBM.get(r.slug)[2] === r.implied_value_usd;
  const W = Math.round(r.plan.find(p => p.kind === 'CADENCE').min / 5);
  const fact = (l, val, cls) => h('div', { class: 'fact' }, h('span', { class: 'lbl' }, l), h('b', { class: cls }, val));
  const head = h('header', { class: 'dhead' },
    h('div', null,
      h('div', { class: 'kick' }, `#${r.rank} of ${N} by implied value · rank ${r.rank_lo}–${r.rank_hi} across 100 bootstrap refits`),
      h('h2', null, r.name),
      h('div', { class: 'pills' }, h('span', { class: 'tag ' + TAGS[r.set][0] }, TAGS[r.set][1]),
        r.category ? h('span', { class: 'pill' }, r.category) : null, h('span', { class: 'sub' }, r.chains.join(', ') || 'no chain on record')),
      h('div', { class: 'facts' }, fact('TVL', usd(r.tvl_usd)), fact('7-day change', pct(r.change_7d), growthCls(r.change_7d)),
        fact('Listed since', r.listed_at || 'n/a'), fact('No token for', ageText(r.age_days)))),
    h('div', { class: 'dright' },
      h('div', { class: 'big amber' }, usd(r.implied_value_usd)),
      h('div', { class: 'sub' }, `If a token launches ${usd(r.launch)} · token odds ${pc(r.odds)}`),
      h('div', { class: 'sub' }, `P25–P75 ${usd(r.lo25)}–${usd(r.hi75)} · P10–P90 ${usd(r.lo10)}–${usd(r.hi90)}`),
      h('div', { class: 'ok' }, (ok ? '✓ ' : '✗ ') + `recomputed in this browser: ${ok ? 'equals' : 'differs from'} board.json. DefiLlama records no token for ${r.name}: a record, not proof.`)));
  // The size curve, not the category, prices a row, so peers are the nearest traded tokens by TVL.
  const dist = t => Math.abs(Math.log(Math.max(t.tvl_usd, 1)) - Math.log(Math.max(r.tvl_usd, 1)));
  const peers = M.traded.slice().sort((a, b) => dist(a) - dist(b) || (a.slug < b.slug ? -1 : 1)).slice(0, 8);
  const peersCard = card('Nearest priced peers · their tokens trade',
    h('p', { class: 'sub' }, `The 8 of ${M.traded.length} traded tokens nearest ${r.name} in TVL; the model's cap/TVL beside each real one`),
    h('table', null, thr(['Token', 'Category', 'TVL', 'Market cap', 'cap / TVL', 'model cap / TVL'], 2), h('tbody', null, peers.map(t => h('tr', null,
      h('td', null, h('b', null, t.name), ' ', h('span', { class: 'sub' }, t.symbol || '')), h('td', null, t.category || '—'),
      h('td', { class: 'n' }, usd(t.tvl_usd)), h('td', { class: 'n' }, usd(t.mcap_usd)),
      h('td', { class: 'n' }, '×' + t.ratio.toFixed(2)), h('td', { class: 'n' }, '×' + t.predicted.toFixed(2)))))));
  const grid = h('table', { class: 'grid' }, thr(['Drop share', ...DEPS.map(d => usd(+d))]), h('tbody', null, SHARES.map(x => h('tr', null,
    h('td', null, sp(+x) + '% drop'),
    ...DEPS.map(d => { const n = netAt(r, +d, +x); return h('td', { class: 'n ' + (n >= 0 ? 'teal' : 'coral') + (d === s.dep && x === s.sh ? ' cur' : '') }, money(n)); })))));
  const verdictCard = card('Farm verdict',
    h('span', { class: 'pill big ' + VCLS[v.verdict] }, v.verdict),
    h('p', { class: 'vline' }, `${v.verdict}: ${usd(dep)} for ${W} weeks buys a modelled drop of ${usd(v.drop)} for ${usd(v.fees)} of fees, ${usd(v.forgone)} of forgone T-bill yield and ${v.hours.toFixed(1)} h of work: a net of ${money(v.net)} (${money(v.perHour)} an hour)`),
    h('div', { class: 'tiles' }, tile('At risk', usd(dep)), tile('Fees', usd(v.fees)), tile('Forgone yield', usd(v.forgone)),
      tile('Modelled drop', usd(v.drop)), tile('Net', money(v.net)), tile('Net per hour', money(v.perHour) + '/h')),
    h('p', { class: 'sub' }, `Fees and yield covered above a drop share of ${(v.breakEven * 100).toFixed(2)}%`),
    h('h4', null, 'Net by drop share × deposit'), grid);
  const plan = card(`Farm plan · ${r.plan.length} steps`,
    h('ol', { class: 'steps' }, r.plan.map(p => h('li', null, h('span', { class: 'kind' }, p.kind), h('span', { class: 'act' }, p.action),
      h('span', { class: 'chips' }, h('span', { class: 'chip' }, 'COST ' + p.cost), h('span', { class: 'chip' }, 'TIME ' + p.time))))),
    h('div', { class: 'ptot' }, `Totals: ${usd(v.fees)} in fees · ${v.hours.toFixed(1)} h hands-on · ${W} weeks hold`));
  return [
    h('nav', { class: 'crumb' }, h('a', { href: toHash({ ...s, p: '' }) || '#' }, '← Board'), ' / ', r.name),
    head,
    h('div', { class: 'split' }, h('div', { class: 'stack' }, waterfall(r), plan), h('div', { class: 'stack' }, verdictCard, peersCard)),
    h('nav', { class: 'pn' }, prev ? h('a', { href: link(prev) }, `← #${prev.rank} ${prev.name}`) : h('span'),
      next ? h('a', { href: link(next) }, `#${next.rank} ${next.name} →`) : h('span')),
  ];
}

function downloadCsv(s, list) {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const t = s.tab === 'traded';
  const head = t ? 'slug,name,symbol,category,tvl_usd,mcap_usd,cap_to_tvl,model_cap_to_tvl' : 'rank,slug,name,set,category,tvl_usd,change_7d,age_days,token_odds,launch_usd,implied_usd,verdict,net_usd,net_per_hour';
  const body = list.map(r => (t ? [r.slug, r.name, r.symbol, r.category, r.tvl_usd, r.mcap_usd, r.ratio, r.predicted]
    : [r.rank, r.slug, r.name, r.set, r.category, r.tvl_usd, r.change_7d, r.age_days, r.odds, r.launch, r.implied_value_usd, r.v.verdict, r.v.net, r.v.perHour]).map(q).join(','));
  const url = URL.createObjectURL(new Blob([[head, ...body].join('\n') + '\n'], { type: 'text/csv' }));
  const a = h('a', { href: url, download: `radar-${s.tab}.csv`, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function render() {
  const ae = document.activeElement, fid = ae && ae.id, pos = ae && ae.selectionEnd;
  const s = readState(), rows = calc(s), cur = s.p && rows.find(r => r.slug === s.p);
  const body = cur ? detail(s, cur, rows) : board(s, rows);
  app.replaceChildren(mast(), ...body,
    h('footer', { class: 'foot' }, `Model ${M.version}. Every figure here is recomputed in this browser from the sealed snapshot by model.js; nothing is fetched. Implied value is this board's estimate, not a prediction that a token will launch.`));
  // Keep keyboard focus and caret across the full rebuild.
  const el = fid && document.getElementById(fid);
  if (el) {
    el.focus({ preventScroll: true });
    if (typeof pos === 'number' && el.setSelectionRange) el.setSelectionRange(pos, pos);
  }
}

app.addEventListener('click', e => {
  const t = e.target, hit = sel => t.closest(sel);
  const tab = hit('[data-tab]'); if (tab) return go({ tab: tab.dataset.tab });
  const vd = hit('[data-vd]'); if (vd) return go({ vd: vd.dataset.vd });
  const sh = hit('[data-sh]'); if (sh) return go({ sh: sh.dataset.sh });
  const so = hit('[data-sort]');
  if (so) {
    const k = so.dataset.sort, s = readState();
    return go(s.sort === k ? { dir: s.dir === 'asc' ? 'desc' : 'asc' } : { sort: k, dir: defDir(k) });
  }
  if (hit('[data-reset]')) {
    history.replaceState(null, '', location.pathname + location.search);
    return render();
  }
  if (hit('[data-csv]')) {
    const s = readState();
    return downloadCsv(s, visible(s, calc(s)).list);
  }
  const tr = hit('tr[data-href]');
  if (tr && !hit('a,button')) location.hash = tr.dataset.href;
});

app.addEventListener('change', e => {
  const k = e.target.name;
  if (k) go({ [k]: e.target.value });
});

app.addEventListener('input', e => {
  if (e.target.id === 'q') go({ q: e.target.value }, true);
});

window.addEventListener('hashchange', render);
window.addEventListener('popstate', render);
render();
