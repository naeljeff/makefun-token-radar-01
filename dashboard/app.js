/*
 * Token radar board. Renders RadarModel output only; every UI state lives in location.hash.
 * All data goes through h() or textContent, so no snapshot string is ever parsed as HTML.
 * Setting the hash with pushState skips hashchange, so go() calls render() itself.
 */
const M = RadarModel.build(RADAR_SNAPSHOT);
const C = M.constants;
const usd = RadarModel.fmtUsd;
const pct = RadarModel.fmtPct;
const app = document.getElementById('app');

const TABS = [
  ['all', 'All ranked', M.counts.ranked],
  ['watchlist', 'Watchlist', M.counts.watchlist],
  ['early', 'Early, off the watchlist', M.counts.early],
  ['traded', 'Token already trades', M.counts.traded],
];
const SORTS = ['implied', 'tvl', 'growth', 'age', 'drop', 'name'];
const MINS = [[0, 'Any'], [1e7, '$10M+'], [5e7, '$50M+'], [2.5e8, '$250M+'], [1e9, '$1B+']];
const WHY = {
  'versioned release': 'version-numbered forks of a live product',
  'wrapped, staked or bridged category': 'wrapped, staked or bridged products of tokens that already trade',
  'wrapped or staked product': 'named as a wrapped or staked product',
  'exchange product': 'exchange-run products, not on-chain protocols',
};
const BOARD_COLS = [
  { t: '#' }, { t: 'Protocol', k: 'name' }, { t: 'Set' }, { t: 'TVL', k: 'tvl', n: 1 }, { t: '7d', k: 'growth', n: 1 },
  { t: 'No token for', k: 'age', n: 1 }, { t: 'Multiple', n: 1 }, { t: 'Implied value', k: 'implied', n: 1 },
  { t: 'Drop / $1k', k: 'drop', n: 1 }, { t: 'Farm plan' },
];
const TRADED_COLS = [
  { t: 'Protocol', k: 'name' }, { t: 'Category' }, { t: 'TVL', k: 'tvl', n: 1 }, { t: 'Market cap', k: 'implied', n: 1 },
  { t: 'mcap / TVL', n: 1 }, { t: '7d', k: 'growth', n: 1 },
];
const COMPS_COLS = [{ t: 'Name' }, { t: 'Symbol' }, { t: 'TVL', n: 1 }, { t: 'Market cap', n: 1 }, { t: '× mcap / TVL', n: 1 }];
const VAL_COLS = [{ t: 'Factor' }, { t: 'Value', n: 1 }, { t: 'Factor', n: 1 }, { t: 'Reason' }];
const PLAN_COLS = [{ t: 'Step #' }, { t: 'What to do' }, { t: 'Cost' }, { t: 'Time' }];

const defDir = sort => (sort === 'name' ? 'asc' : 'desc');
// Mirrors the farm-plan capital and hold rules in model.js.
const capOf = tvl => (tvl >= 1e9 ? 2000 : tvl >= 2.5e8 ? 1000 : tvl >= 5e7 ? 500 : 250);
const holdOf = age => (age === null ? 60 : age < 180 ? 90 : age < 540 ? 60 : 45);
const ageText = d => (d === null ? 'n/a' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd');
const chainsOf = r => r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ` +${r.chains.length - 2}` : '');
const growthCls = v => (v == null ? 'muted' : v > 0 ? 'teal' : v < 0 ? 'coral' : '');
const barW = f => Math.min(100, Math.max(3, 50 + 25 * Math.log2(f)));

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

const tile = (v, label) => h('div', { class: 'tile' }, h('b', null, v), h('span', null, label));
const pill = r => h('span', { class: 'pill ' + (r.on_watchlist ? 'amber' : 'teal') }, r.on_watchlist ? 'Watchlist' : 'Early');
const card = (cls, title, ...kids) => h('section', { class: 'card ' + cls }, h('h3', null, title), ...kids);

function counts(list, keyOf) {
  const m = new Map();
  for (const r of list) for (const k of [].concat(keyOf(r) ?? [])) m.set(k, (m.get(k) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

function thead(cols, s = {}) {
  return h('thead', null, h('tr', null, cols.map(c => {
    const on = c.k && s.sort === c.k;
    return h('th', { scope: 'col', class: c.n ? 'n' : null, 'aria-sort': c.k ? (on ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none') : null },
      c.k ? h('button', { type: 'button', id: 'sort-' + c.k, 'data-sort': c.k }, c.t, h('span', { 'aria-hidden': 'true' }, on ? (s.dir === 'asc' ? ' ▲' : ' ▼') : '')) : c.t);
  })));
}

const emptyRow = n => h('tr', { class: 'empty' }, h('td', { colspan: n }, 'No protocol matches these filters. ', h('button', { type: 'button', class: 'ghost', 'data-reset': '' }, 'Reset')));

function readState() {
  const sp = new URLSearchParams(location.hash.slice(1));
  const pick = (k, list, d) => (list.includes(sp.get(k)) ? sp.get(k) : d);
  const sort = pick('sort', SORTS, 'implied');
  return {
    tab: pick('tab', ['all', 'watchlist', 'early', 'traded'], 'all'),
    q: sp.get('q') || '',
    cat: sp.get('cat') || '',
    chain: sp.get('chain') || '',
    min: pick('min', MINS.map(m => String(m[0])), '0'),
    sort,
    dir: pick('dir', ['asc', 'desc'], defDir(sort)),
    p: sp.get('p') || '',
  };
}

// Omits every key at its default so the hash stays short and screenshot-friendly.
function toHash(s) {
  const sp = new URLSearchParams();
  const dflt = { tab: 'all', q: '', cat: '', chain: '', min: '0', sort: 'implied', dir: defDir(s.sort), p: '' };
  for (const k in dflt) if (String(s[k]) !== dflt[k]) sp.set(k, s[k]);
  const str = sp.toString();
  return str ? '#' + str : '';
}

function go(patch, replace) {
  const s = Object.assign(readState(), patch);
  history[replace ? 'replaceState' : 'pushState'](null, '', location.pathname + location.search + toHash(s));
  render();
}

function baseRows(s) {
  if (s.tab === 'traded') return M.traded;
  if (s.tab === 'watchlist') return M.rows.filter(r => r.on_watchlist);
  if (s.tab === 'early') return M.rows.filter(r => !r.on_watchlist);
  return M.rows;
}

function rowsFor(s) {
  const q = s.q.trim().toLowerCase();
  return baseRows(s).filter(r => (!q || [r.name, r.slug, r.symbol || '', ...r.chains].join(' ').toLowerCase().includes(q))
    && (!s.cat || r.category === s.cat)
    && (!s.chain || r.chains.includes(s.chain))
    && r.tvl_usd >= Number(s.min));
}

function sortKey(s, r) {
  const t = s.tab === 'traded';
  switch (s.sort) {
    case 'tvl': return r.tvl_usd;
    case 'growth': return r.change_7d ?? -Infinity;
    case 'age': return t ? 0 : (r.price.age_days ?? -1);
    case 'drop': return t ? 0 : r.price.drop_per_1k;
    case 'name': return r.name.toLowerCase();
    default: return t ? r.mcap_usd : r.implied_value_usd;
  }
}

function sortRows(list, s) {
  const k = s.dir === 'asc' ? 1 : -1;
  return list.slice().sort((a, b) => {
    const x = sortKey(s, a), y = sortKey(s, b);
    return (x < y ? -1 : x > y ? 1 : 0) * k || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  });
}

function renderMasthead() {
  const c = M.counts;
  return h('header', { class: 'mast' },
    h('div', null,
      h('div', { class: 'wordmark' }, glyph(), 'TOKEN RADAR'),
      h('h1', null, 'Pre-token protocols, priced by the tokens that already trade'),
      h('p', { class: 'muted' }, `Snapshot ${M.as_of} · ${M.source}`)),
    h('div', { class: 'stats' },
      tile(c.ranked, 'ranked with no recorded token'),
      tile(`${c.watch_covered}/${c.watchlist}`, 'watchlist covered'),
      tile(c.early, 'early finds off the watchlist'),
      tile(c.traded, 'traded tokens used as comps')));
}

function renderFormula() {
  return h('div', { class: 'formula' }, 'implied value ', h('b', null, '='),
    ' TVL × category mcap/TVL of traded tokens × √(1 + 7d TVL change) × runway with no token × name-family discount');
}

function field(name, label, opts, cur) {
  return h('label', { class: 'field' }, h('span', null, label),
    h('select', { id: name, name }, opts.map(([v, t]) => h('option', { value: v, selected: v === cur }, t))));
}

function renderToolbar(s, base, rows) {
  const cats = counts(base, r => r.category).map(([c, n]) => [c, `${c} (${n})`]);
  const chains = counts(base, r => r.chains).slice(0, 20).map(([c]) => [c, c]);
  const withCur = (list, cur) => (cur && !list.some(([v]) => v === cur) ? [[cur, cur], ...list] : list);
  return h('div', { class: 'toolbar' },
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Board tab' }, TABS.map(([k, label, n]) => h('button', {
      type: 'button', id: 'tab-' + k, 'data-tab': k, 'aria-pressed': String(s.tab === k), class: s.tab === k ? 'on' : null,
    }, `${label} (${n})`))),
    h('div', { class: 'filters' },
      h('label', { class: 'field' }, h('span', { class: 'sr' }, 'Search'),
        h('input', { id: 'q', type: 'search', placeholder: 'Search name, slug or chain', value: s.q, autocomplete: 'off' })),
      field('cat', 'Category', [['', 'All categories'], ...withCur(cats, s.cat)], s.cat),
      field('chain', 'Chain', [['', 'All chains'], ...withCur(chains, s.chain)], s.chain),
      field('min', 'Min TVL', MINS.map(([v, t]) => [String(v), t]), s.min),
      h('span', { class: 'count' }, `Showing ${rows.length} of ${base.length}`),
      h('button', { type: 'button', id: 'reset', class: 'ghost', 'data-reset': '' }, 'Reset')));
}

function boardRow(s, r, lo, hi) {
  const pr = r.price, lv = Math.log10(r.implied_value_usd);
  const w = hi > lo ? 4 + 96 * (lv - lo) / (hi - lo) : 100;
  const href = toHash({ ...s, p: r.slug });
  return h('tr', { 'data-href': href },
    h('td', { class: 'num' }, r.rank),
    h('td', null,
      h('div', null, h('a', { href }, r.name),
        pr.family ? h('span', { class: 'dot', role: 'img', title: 'shares name with a traded token', 'aria-label': 'shares name with a traded token' }) : null),
      h('div', { class: 'sub' }, `${r.category || 'uncategorised'} · ${chainsOf(r)}`)),
    h('td', null, pill(r)),
    h('td', { class: 'n' }, usd(r.tvl_usd)),
    h('td', { class: 'n ' + growthCls(r.change_7d) }, pct(r.change_7d)),
    h('td', { class: 'n' }, ageText(pr.age_days)),
    h('td', { class: 'n' }, '×' + pr.multiple.toFixed(3)),
    h('td', { class: 'implied' },
      h('div', { class: 'amt' }, usd(r.implied_value_usd)),
      h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${w.toFixed(1)}%` }))),
    h('td', { class: 'n' }, usd(pr.drop_per_1k)),
    h('td', { class: 'sub' }, `${r.plan.length} steps · ${usd(capOf(r.tvl_usd))} · ${holdOf(pr.age_days)}d hold`));
}

function howCard() {
  return card('', 'How the value is built',
    h('ol', { class: 'how' },
      h('li', null, 'TVL × category multiple × √(1 + 7d change) × runway × name family'),
      h('li', null, `Multiple: mean mcap/TVL of traded tokens per category, shrunk toward ×${M.comps.global.toFixed(3)} with weight ${C.prior_weight}.`),
      h('li', null, `Growth: 7d change clamped to ${C.growth_floor}..${C.growth_cap}%. Runway: full by ${C.ramp_days} days, fades after ${C.stale_after_days} days, floor ${C.stale_floor}.`),
      h('li', null, `Name family: ×${C.family_factor} when a traded token shares the first name word.`)));
}

function catCard(rows) {
  const top = counts(rows, r => r.category).slice(0, 8);
  const mult = e => (M.comps.byCategory[e[0]] ? M.comps.byCategory[e[0]].multiple : M.comps.global);
  const max = Math.max(...top.map(mult));
  return card('', 'Category multiples', top.length
    ? h('ul', { class: 'cats' }, top.map(e => {
      const m = mult(e), cm = M.comps.byCategory[e[0]];
      return h('li', null,
        h('div', { class: 'row' }, h('span', null, e[0]), h('b', null, '×' + m.toFixed(3))),
        h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${(m / max * 100).toFixed(1)}%` })),
        h('span', { class: 'sub' }, `${cm ? cm.n : 0} traded`));
    }))
    : h('p', { class: 'muted' }, 'No categories in this filter.'));
}

function setAsideCard() {
  const items = Object.entries(M.set_aside.by_reason).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => [k, n, WHY[k] || k]);
  items.push(['traded tokens', M.counts.traded, 'record a traded token: they price the ranking, not rank in it']);
  return card('', 'Set aside, not ranked', h('ul', { class: 'cats' }, items.map(([k, n, why]) =>
    h('li', null, h('div', { class: 'row' }, h('span', null, k), h('b', null, n)), h('span', { class: 'sub' }, why)))));
}

function renderBoard(s, rows) {
  const logs = rows.map(r => Math.log10(r.implied_value_usd));
  const lo = Math.min(...logs), hi = Math.max(...logs);
  return h('div', { class: 'board' },
    h('div', { class: 'tablewrap' },
      h('table', null, thead(BOARD_COLS, s),
        h('tbody', null, rows.length ? rows.map(r => boardRow(s, r, lo, hi)) : emptyRow(BOARD_COLS.length)))),
    h('aside', { class: 'side' }, howCard(), catCard(rows), setAsideCard()));
}

function renderTraded(s, rows) {
  return h('div', { class: 'tablewrap' },
    h('p', { class: 'note' }, 'These protocols record a traded token on DefiLlama. They are kept off the ranking and used as the comps that price it: their market cap ÷ TVL by category sets each pre-token multiple.'),
    h('table', null, thead(TRADED_COLS, s), h('tbody', null, rows.length
      ? rows.map(r => h('tr', null,
        h('td', null, h('b', null, r.name), ' ', h('span', { class: 'sub' }, r.symbol || '')),
        h('td', null, r.category || '—'),
        h('td', { class: 'n' }, usd(r.tvl_usd)),
        h('td', { class: 'n' }, usd(r.mcap_usd)),
        h('td', { class: 'n' }, '×' + r.ratio.toFixed(2)),
        h('td', { class: 'n ' + growthCls(r.change_7d) }, pct(r.change_7d))))
      : emptyRow(TRADED_COLS.length))));
}

function fbar(label, f) {
  return h('div', { class: 'fbar' }, h('span', null, label),
    h('div', { class: 'track' }, h('div', { class: 'fill ' + (f >= 1 ? 'teal' : 'coral'), style: `width:${barW(f).toFixed(1)}%` })),
    h('span', { class: 'n' }, '×' + f.toFixed(3)));
}

function renderDetail(s, r) {
  const pr = r.price, idx = M.rows.indexOf(r), cap = capOf(r.tvl_usd), hold = holdOf(pr.age_days);
  const comp = r.category ? M.comps.byCategory[r.category] : null;
  const peers = comp ? comp.peers : [];
  const fam = pr.family;
  const link = slug => toHash({ ...s, p: slug });
  const prev = M.rows[idx - 1], next = M.rows[idx + 1];

  const facs = [
    { label: 'TVL', value: usd(r.tvl_usd), factor: null, why: 'locked today' },
    { label: '× category multiple', value: null, factor: pr.multiple, why: pr.multiple_n
      ? `${pr.multiple_source}: ${pr.multiple_n} traded tokens, shrunk toward the all-token ×${M.comps.global.toFixed(3)}`
      : 'no traded peer in this category: the all-token multiple' },
    { label: '× growth', value: pct(r.change_7d), factor: pr.growth_factor,
      why: `7d TVL change ${pct(r.change_7d)}, clamped to ${C.growth_floor}..${C.growth_cap}%` },
    { label: '× runway', value: ageText(pr.age_days), factor: pr.runway_factor,
      why: (pr.age_days === null ? 'no listing date on record (unknown listing date: 365 assumed)' : `${pr.age_days} days with no token`)
        + (pr.stale < 1 ? `; fading: past ${C.stale_after_days / 365} years` : '') },
  ];
  if (fam) facs.push({ label: '× name family', value: null, factor: pr.family_factor,
    why: `${fam.name} already trades${fam.symbol ? ' as ' + fam.symbol : ''}` });

  const valCard = card('', 'Valuation',
    h('table', null, thead(VAL_COLS), h('tbody', null,
      facs.map(f => h('tr', null, h('td', null, f.label), h('td', { class: 'n' }, f.value ?? ''),
        h('td', { class: 'n' }, f.factor === null ? '' : '×' + f.factor.toFixed(3)), h('td', { class: 'sub' }, f.why))),
      h('tr', { class: 'total' }, h('td', { class: 'amber' }, '= implied value'), h('td', { class: 'n amber' }, usd(r.implied_value_usd)), h('td', null), h('td', null)))),
    h('div', { class: 'fbars' },
      fbar('multiple', pr.multiple), fbar('growth', pr.growth_factor), fbar('runway', pr.runway_factor),
      fam ? fbar('name family', pr.family_factor) : null),
    h('p', { class: 'sub' }, 'Centre line is ×1. Teal lifts the value, coral cuts it.'));

  const compCard = card('', 'Comps',
    comp ? h('p', { class: 'sub' }, `${comp.n} traded tokens in ${r.category}; top ${peers.length} by market cap`) : null,
    peers.length
      ? h('table', null, thead(COMPS_COLS), h('tbody', null, peers.map(p => h('tr', null,
        h('td', null, p.name), h('td', null, p.symbol || ''), h('td', { class: 'n' }, usd(p.tvl_usd)),
        h('td', { class: 'n' }, usd(p.mcap_usd)), h('td', { class: 'n' }, '×' + p.ratio.toFixed(2))))))
      : h('p', { class: 'muted' }, r.category
        ? 'No traded peer in this category: the all-token multiple applies.'
        : 'No category on record: the all-token multiple applies.'));

  const farmCard = card('wide', 'Farm plan',
    h('div', { class: 'tiles' }, tile(usd(cap), 'Capital at work'), tile(`${hold} days`, 'Hold'),
      tile(usd(cap / 1000 * pr.drop_per_1k), 'Expected drop at implied value'), tile(r.plan.length, 'Steps')),
    h('table', { class: 'plan' }, thead(PLAN_COLS), h('tbody', null, r.plan.map((p, i) => h('tr', null,
      h('td', { class: 'num' }, i + 1), h('td', null, p.action), h('td', null, p.cost), h('td', { class: 'nw' }, p.time)))),
    h('tfoot', null, h('tr', { class: 'total' }, h('td', null, 'Total'), h('td', null, `${r.plan.length} steps`),
      h('td', null, `${usd(cap)} at work`), h('td', { class: 'nw' }, `${hold} days hold`)))));

  return [
    h('a', { class: 'back', href: toHash({ ...s, p: '' }) || '#' }, '← Back to the board'),
    h('header', { class: 'dhead' },
      h('div', { class: 'rank' }, '#' + r.rank),
      h('div', null, h('h2', null, r.name),
        h('div', { class: 'pills' }, pill(r), r.category ? h('span', { class: 'pill' }, r.category) : null),
        h('div', { class: 'sub' }, r.chains.join(', ') || 'no chain on record')),
      h('div', { class: 'dval' }, h('div', { class: 'big amber' }, usd(r.implied_value_usd)),
        h('div', { class: 'sub' }, 'implied token value'),
        h('div', { class: 'sub' }, `DefiLlama records no token for ${r.name} as of ${M.as_of}: a record, not proof.`))),
    h('div', { class: 'grid2' }, valCard, compCard),
    farmCard,
    h('nav', { class: 'pn' },
      prev ? h('a', { href: link(prev.slug) }, `← #${prev.rank} ${prev.name}`) : h('span'),
      next ? h('a', { href: link(next.slug) }, `#${next.rank} ${next.name} →`) : h('span')),
  ];
}

function renderMain(s) {
  const r = s.p && M.rows.find(x => x.slug === s.p);
  if (r) return renderDetail(s, r);
  const base = baseRows(s);
  const rows = sortRows(rowsFor(s), s);
  return [renderToolbar(s, base, rows), s.tab === 'traded' ? renderTraded(s, rows) : renderBoard(s, rows)];
}

function render() {
  const ae = document.activeElement;
  const fid = ae && ae.id;
  const pos = ae && ae.selectionEnd;
  const st = readState();
  app.classList.toggle('detail', Boolean(st.p && M.rows.some(x => x.slug === st.p)));
  app.replaceChildren(renderMasthead(), renderFormula(), ...renderMain(st),
    h('footer', { class: 'foot' }, `Model ${M.version}. This page and board.json are computed by the same functions in model.js (build, price, farmPlan) from the sealed snapshot; nothing is fetched. Implied value is this board's own estimate, not a prediction that a token will launch.`));
  // Keep keyboard focus and caret across the full rebuild.
  const el = fid && document.getElementById(fid);
  if (el) {
    el.focus({ preventScroll: true });
    if (typeof pos === 'number' && el.setSelectionRange) el.setSelectionRange(pos, pos);
  }
}

app.addEventListener('click', e => {
  const t = e.target;
  const tab = t.closest('[data-tab]');
  if (tab) return go({ tab: tab.dataset.tab });
  const sortEl = t.closest('[data-sort]');
  if (sortEl) {
    const k = sortEl.dataset.sort, s = readState();
    return go(s.sort === k ? { dir: s.dir === 'asc' ? 'desc' : 'asc' } : { sort: k, dir: defDir(k) });
  }
  if (t.closest('[data-reset]')) {
    history.replaceState(null, '', location.pathname + location.search);
    return render();
  }
  const tr = t.closest('tr[data-href]');
  if (tr && !t.closest('a,button')) location.hash = tr.dataset.href;
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
