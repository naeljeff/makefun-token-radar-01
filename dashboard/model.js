// radar-3: implied = launch value × token odds; a term is kept only if it cuts the held-out miss in both tests.
(function (root, factory) {
 if (typeof module === 'object' && module.exports) module.exports = factory();
 else root.RadarModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
 'use strict';
 const VERSION = 'radar-3';
 const DEFAULTS = { deposit: 10000, share: 0.07, hourly: 25, tbill: 0.04 };
 const GAS_USD = {
  Ethereum: 3, Bitcoin: 2, Tron: 1, Arbitrum: 0.05, Base: 0.02, Optimism: 0.03, Polygon: 0.02, Binance: 0.08, Avalanche: 0.05,
  Solana: 0.01, Sui: 0.01, Aptos: 0.01, Monad: 0.02, 'Hyperliquid L1': 0.01, Plasma: 0.01, Sonic: 0.01, Berachain: 0.02,
  Linea: 0.05, Scroll: 0.05, 'zkSync Era': 0.05, Starknet: 0.05, Mantle: 0.02, Unichain: 0.02, Ink: 0.02, Katana: 0.02,
  Stellar: 0.01, Ripple: 0.01, Algorand: 0.01, Cardano: 0.2, TON: 0.05, Near: 0.01, Sei: 0.01, Flare: 0.02,
  'Robinhood Chain': 0.02, Arc: 0.02, Bittensor: 0.01, Provenance: 0.05,
 };
 const GROUPS = {
  vault: ['Risk Curators', 'Onchain Capital Allocator', 'Yield', 'Yield Aggregator', 'Liquidity Manager', 'Farm', 'Leveraged Farming', 'Indexes', 'Governance Incentives', 'Options Vault'],
  lend: ['Lending', 'Uncollateralized Lending', 'CDP', 'CDP Manager', 'Collateral Markets'],
  dex: ['Dexs', 'OTC Marketplace'], perps: ['Derivatives', 'Interest Rate Derivatives', 'Basis Trading'],
  btc: ['Anchor BTC', 'Decentralized BTC', 'Restaked BTC'], stake: ['Staking Pool', 'Restaking', 'Liquid Staking', 'Liquid Restaking'],
  stable: ['Dual-Token Stablecoin', 'Stablecoin Wrapper', 'RWA', 'CeDeFi'], predict: ['Prediction Market'],
 };
 const GROUP_OF = {};
 for (const g in GROUPS) for (const c of GROUPS[g]) GROUP_OF[c] = g;
 const WRAPPED_CATS = ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'];
 const VL = { size: 'size curve, ln TVL', pace: "size read at last week's TVL", category: 'category effect, shrunk', growth: '7-day TVL change', years: 'years listed', chains: 'chain count, ln' };
 const OL = { years: 'years listed', size: 'size, ln TVL', growth: '7-day TVL change', chains: 'chain count, ln' };
 const OUT = {
  'versioned release': ['out-release', 'Out · versioned release'],
  'wrapped, staked or bridged category': ['out-bridge', 'Out · bridge or staking category'],
  'wrapped or staked product': ['out-wrapped', 'Out · wrapped or staked name'],
  'exchange product': ['out-exchange', 'Out · exchange product'],
 };
 const DAY = 864e5;
 const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
 const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
 const r2 = x => Math.round(x * 100) / 100;
 const r4 = x => Math.round(x * 1e4) / 1e4;
 const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
 const median = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
 const quant = (s, q) => { const h = (s.length - 1) * q, i = Math.floor(h), j = Math.min(i + 1, s.length - 1); return s[i] + (h - i) * (s[j] - s[i]); };
 const gasOf = c => (Object.prototype.hasOwnProperty.call(GAS_USD, c) ? GAS_USD[c] : 0.25);
 const cheapest = l => l.reduce((b, c) => (gasOf(c) < gasOf(b) ? c : b));
 const recordsToken = p => p.gecko_id !== null || p.symbol !== null || (p.mcap_usd !== null && p.mcap_usd > 0);
 const mc = p => p.mcap_usd || 0;
 const WRAP_RE = /\b(wrapped|staked|staking)\b/i, EXCH_RE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
 function setAside(p) {
  if (/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(p.name)) return 'versioned release';
  if (WRAPPED_CATS.includes(p.category)) return 'wrapped, staked or bridged category';
  if (WRAP_RE.test(p.name)) return 'wrapped or staked product';
  if (EXCH_RE.test(p.name)) return 'exchange product';
  return null;
 }
 function firstWord(name) { const m = String(name).toLowerCase().match(/[a-z0-9]+/); return m ? m[0] : ''; }
 const utc = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
 const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(utc(s)).toISOString().slice(0, 10) === s;
 function ageDays(asOf, listedAt) {
  if (!isDay(listedAt) || !isDay(asOf)) return null;
  return Math.max(0, Math.floor((utc(asOf) - utc(listedAt)) / DAY));
 }
 // Hand-rolled grouping: toLocaleString varies by locale.
 const group = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
 function fmtUsd(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 10) return '$' + group(Math.round(n));
  return '$' + n.toFixed(2);
 }
 const fmtPct = n => (n == null ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(1) + '%');
 function solve(A, b) {
  const k = b.length, M = A.map((r, i) => r.concat([b[i]]));
  for (let c = 0; c < k; c++) {
   let p = c;
   for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
   [M[c], M[p]] = [M[p], M[c]];
   for (let r = 0; r < k; r++) {
    if (r === c) continue;
    const f = M[r][c] / M[c][c];
    for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j];
   }
  }
  return M.map((r, i) => r[k] / r[i]);
 }
 const zeros = n => Array.from({ length: n }, () => new Array(n).fill(0));
 const vec = (f, terms) => [1, ...terms.map(t => f[t])];
 // Category effect = sum(residuals) / (n + 4): small groups shrink toward 0.
 function fitV(rs, S) {
  const lin = S.filter(t => t !== 'category' && t !== 'pace'), k = lin.length + 1, pace = S.includes('pace');
  const fe = r => (pace ? { ...r.f, size: r.f.size + r.f.pace } : r.f);
  const A = zeros(k), b = new Array(k).fill(0);
  for (const r of rs) {
   const x = vec(fe(r), lin);
   for (let i = 0; i < k; i++) {
    b[i] += x[i] * r.y;
    for (let j = 0; j < k; j++) A[i][j] += x[i] * x[j];
   }
  }
  for (let i = 1; i < k; i++) A[i][i] += 1e-9;
  const m = { lin, b: solve(A, b), c: Object.create(null), pace };
  if (S.includes('category')) {
   const acc = Object.create(null);
   for (const r of rs) {
    if (r.cat === null) continue;
    const e = acc[r.cat] || (acc[r.cat] = [0, 0]);
    e[0] += r.y - dot(m.b, vec(fe(r), lin));
    e[1]++;
   }
   for (const c in acc) m.c[c] = acc[c][0] / (acc[c][1] + 4);
  }
  return m;
 }
 const predV = (m, f, cat) => dot(m.b, vec(m.pace ? { ...f, size: f.size + f.pace } : f, m.lin)) + (m.c[cat] || 0);
 // Ridge 1 on slopes, Newton from zero, at most 50 iterations.
 function fitL(rs, S) {
  const k = S.length + 1;
  let b = new Array(k).fill(0);
  for (let it = 0; it < 50; it++) {
   const g = new Array(k).fill(0), H = zeros(k);
   for (const r of rs) {
    const x = vec(r.f, S), p = 1 / (1 + Math.exp(-dot(b, x))), w = p * (1 - p);
    for (let i = 0; i < k; i++) {
     g[i] += (p - r.o) * x[i];
     for (let j = 0; j < k; j++) H[i][j] += w * x[i] * x[j];
    }
   }
   for (let i = 1; i < k; i++) { g[i] += b[i]; H[i][i] += 1; }
   const d = solve(H, g);
   b = b.map((v, i) => v - d[i]);
   if (Math.max(...d.map(Math.abs)) < 1e-10) break;
  }
  return { S, b };
 }
 const pOf = (m, f) => 1 / (1 + Math.exp(-dot(m.b, vec(f, m.S))));
 // Keep a term only if it lowers both its metric and the walk-forward one.
 function select(cands, lab, ev, key) {
  const base = ev([]);
  let S = [], cur = base;
  const rows = cands.map(c => {
   const S2 = S.concat([c]), m = ev(S2), kept = m[key] < cur[key] && m.wf < cur.wf;
   if (kept) { S = S2; cur = m; }
   return { term: c, label: lab[c], ...m, kept };
  });
  return { rows, base, S };
 }
 const named = (terms, b) => terms.reduce((o, t, i) => (o[t] = b[i + 1], o), { intercept: b[0] });
const sdVec = V => V[0].map((_, k) => {
 const m = V.reduce((s, v) => s + v[k], 0) / V.length;
 return Math.sqrt(V.reduce((s, v) => s + (v[k] - m) ** 2, 0) / (V.length - 1));
});
 const stepText = s => {
  const t = `${s.kind}: ${s.action} Cost: ${s.cost}. Time: ${s.time}.`.trim();
  return t.length > 600 ? t.slice(0, 597) + '...' : t;
 };
 const autoWeeks = r => (r.age_days === null ? 9 : r.age_days < 180 ? 13 : r.age_days < 540 ? 9 : 7);
function plan(r, dep, weeks) {
  const top = r.chains.length ? r.chains.slice(0, 3) : ['Ethereum'];
  const chain = cheapest(top), gas = gasOf(chain);
  const rest = r.chains.filter(c => c !== chain), chain2 = rest.length ? cheapest(rest) : null;
  const $ = fmtUsd, n = r.name, D = $(dep), kin = r.kin;
  const given = Number.isInteger(weeks) && weeks > 0, W = given ? weeks : autoWeeks(r), hold = W * 7;
  const g = GROUP_OF[r.category] || 'other';
  const asset = g === 'btc' ? 'BTC' : g === 'stake' ? `${chain}'s staking asset` : 'USDC';
  const extra = { lend: 0.2 * dep * 0.08 * W / 52, perps: dep * 0.001, predict: dep * 0.01, stable: dep * 0.001 }[g] || 0;
  const core = {
   vault: `Deposit ${D} of USDC in the largest ${n} vault on ${chain} and keep the shares.`,
   lend: `Supply ${D} of USDC to ${n} on ${chain}, borrow ${$(0.2 * dep)} against it, keep health factor above 2.`,
   dex: `Add ${D} of liquidity to ${n}'s deepest pair on ${chain}, split 50/50.`,
   perps: `Deposit ${D} of USDC margin on ${n} on ${chain}; open a matched long and short.`,
   btc: `Deposit ${D} of BTC through ${n} on ${chain} and hold the receipt token.`,
   stake: `Stake ${D} of ${chain}'s staking asset through ${n} and keep the receipt.`,
   stable: `Mint or buy ${D} of ${n}'s yield-bearing asset on ${chain} and hold it.`,
   predict: `Fund ${D} of USDC on ${n}, spread over three liquid markets settling within 30 days.`,
   other: `Route ${D} of USDC through ${n} on ${chain} with one real use of its product.`,
  }[g];
  const st = [];
  const push = (kind, action, usd, min, cost, time = `${min} min hands-on`) => st.push({ kind, action, usd, min, cost, time });
  push('SETUP', `Fresh wallet on ${chain}; withdraw ${$(Math.max(1, r2(gas * (5 + W) * 1.5)))} of its gas token from an exchange.`, 1, 10, `${$(1)} withdrawal fee`);
  push('VERIFY', `Open ${n} only from its DefiLlama listing (slug "${r.slug}"), check the contract against its docs, and look for a points page.`, 0, 10, 'nothing');
  push('FUND', `Withdraw ${D} of ${asset} to that ${chain} wallet.`, 1, 10, `${$(1)} transfer fee`);
  if (kin) push('KIN', `DefiLlama records a token for ${kin.name}${kin.symbol ? ` (${kin.symbol})` : ''}: if its docs cover ${n}, farm that token instead.`, 0, 10, 'nothing');
  const peg = `Peg risk: check how ${n}'s receipt token redeems, its unbonding time and DEX depth before depositing.`;
  const risk = {
   vault: `Read ${n}'s strategy page: name its underlying protocols and withdrawal delay; skip it if yield is mostly unlisted points.`,
   lend: `Liquidation risk: the ${$(0.2 * dep)} borrow is liquidated if collateral falls 60%; check the oracle and utilisation first.`,
   dex: `Price risk: impermanent loss on a volatile pair can beat the drop; prefer a stable or correlated pair.`,
   perps: `Funding risk: a matched long and short still pays funding; close if above 0.03% a day.`,
   btc: peg, stake: peg,
   stable: `Peg risk: check the redemption route and reserves; exit if under $0.99 for a day.`,
  }[g] || `Contract risk: check ${n}'s audit and TVL history; never approve unlimited spend.`;
  push('RISK', risk, 0, 10, 'nothing', '10 min reading');
  const gf = $(2 * gas), fee = $(dep * 0.001);
  const costOf = {
   lend: `${gf} gas + ${$(extra)} interest on the ${$(0.2 * dep)} borrow at 8% APR`,
   perps: `${gf} gas + ${fee} taker fees at 0.05% a side`,
   predict: `${gf} gas + ${$(dep * 0.01)} spread`,
   stable: `${gf} gas + ${fee} mint fee`,
   dex: `${gf} gas; impermanent loss near 0 on a stable pair, a few % on a volatile one`,
  }[g] || `${gf} gas`;
  push('CORE', core, 2 * gas + extra, 15, costOf);
  if (chain2) push('DEEPEN', `Repeat ${$(0.2 * dep)} on ${chain2} with ${n}; points often weigh cross-chain use.`, 2 * gasOf(chain2), 10, `${$(2 * gasOf(chain2))} in gas on ${chain2}`);
  else push('DEEPEN', `Use a second ${n} product once with ${$(0.2 * dep)}, so the wallet shows more than one action.`, 2 * gas, 10, `${$(2 * gas)} in gas on ${chain}`);
  push('CADENCE', `Weekly for ${W} weeks: one qualifying action (top up, claim, rebalance or vote).`, W * gas, 5 * W, `${$(W * gas)} in gas over ${W} weeks`, `5 min a week for ${W} weeks`);
  const age = r.age_days, why = given ? 'chosen horizon' : age === null ?'no listing date, so a standard season' : age < 180 ? `only ${age} days with no token, early in any points season` : age < 540 ? `${age} days with no token: mid-season` : `${age} days with no token: the hold only has to outlast one snapshot`;
  push('HOLD', `Hold ${n} for ${W} weeks (${hold} days): ${why}.`, 0, 0, `${$(dep * DEFAULTS.tbill * W / 52)} of forgone 4% T-bill yield`, `${hold} days`);
  const xp = fmtPct(100 * (r.exit_tvl / r.tvl_usd - 1));
  push('WATCH', `Exit if ${n} TVL prints below ${$(r.exit_tvl)} (${xp} in a week, a 1-in-20 week on this snapshot), withdrawals pause or no token is planned.`, 0, 2 * W, 'nothing', `${2 * W} min in all`);
  push('EXIT', `Unwind ${n}; claim any token only via its own docs, never pay to claim.`, 3 * gas, 15, `${$(3 * gas)} in gas to unwind and claim`);
  push('RECORD', 'Log every transaction (date, hash, asset, amount, USD value); a drop is taxable in many places.', 0, 10, 'nothing');
  return st;
 }
 function verdict(r, dep, share) {
  const drop = r.implied_value_usd * share * dep / (r.tvl_usd + dep);
  const fees = r.plan.reduce((t, x) => t + x.usd, 0), hours = r.plan.reduce((t, x) => t + x.min, 0) / 60;
  const W = Math.round(r.plan.find(p => p.kind === 'CADENCE').min / 5);
  const forgone = dep * DEFAULTS.tbill * W / 52;
  const net = drop - fees - forgone, perHour = net / hours;
  const breakEven = (fees + forgone) * (r.tvl_usd + dep) / (r.implied_value_usd * dep);
  return { drop, fees, forgone, hours, net, perHour, breakEven, verdict: net <= 0 ? 'SKIP' : perHour >= DEFAULTS.hourly ? 'FARM' : 'MARGINAL' };
 }
 function mulberry32(a) {
  return () => {
   let t = a += 0x6D2B79F5;
   t = Math.imul(t ^ t >>> 15, t | 1);
   t ^= t + Math.imul(t ^ t >>> 7, t | 61);
   return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
 }
 const fnv = str => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193); return (h >>> 0).toString(16).padStart(8, '0'); };
 function build(snap) {
  const asOf = snap.as_of, P = snap.protocols, floor = snap.floor_usd, watch = new Set(snap.watchlist);
  const dated = p => ageDays(asOf, p.listed_at) !== null;
  const yrsOf = p => ageDays(asOf, p.listed_at) / 365;
  const pick = (a, b) => (mc(b) > mc(a) || (mc(b) === mc(a) && cmp(b.slug, a.slug) < 0) ? b : a);
  const byWord = new Map();
  for (const q of P) {
   const w = firstWord(q.name);
   if (recordsToken(q) && w.length >= 4) byWord.set(w, (byWord.get(w) || []).concat([q]));
  }
  const kinQ = new Map(P.map(p => {
   const others = (byWord.get(firstWord(p.name)) || []).filter(q => q.slug !== p.slug);
   return [p.slug, others.length ? others.reduce(pick) : null];
  }));
  const feat = (p, med) => ({
   size: Math.log(Math.max(p.tvl_usd, 1) / 1e8),
   growth: Math.log(1 + clamp(p.change_7d == null ? 0 : p.change_7d, -50, 100) / 100),
   pace: -Math.log(1 + clamp(p.change_7d == null ? 0 : p.change_7d, -50, 100) / 100),
   years: dated(p) ? yrsOf(p) : med,
   chains: Math.log(1 + p.chains.length),
  });
  const T0 = P.filter(p => recordsToken(p) && mc(p) > 0 && p.tvl_usd > 0 && p.category !== 'CEX' && setAside(p) !== 'versioned release');
  const medT = median(T0.filter(dated).map(yrsOf));
  const Tr = T0.map(p => ({ p, f: feat(p, medT), cat: p.category, y: Math.log(p.mcap_usd / p.tvl_usd) }));
  const Dw = Tr.filter(r => dated(r.p)).sort((a, b) => cmp(a.p.listed_at, b.p.listed_at) || cmp(a.p.slug, b.p.slug));
  const looRes = (S, T = Tr) => T.map((r, i) => r.y - predV(fitV(T.filter((_, j) => j !== i), S), r.f, r.cat));
  const wfRes = (S, D = Dw) => { const h = Math.floor(D.length / 2), m = fitV(D.slice(0, h), S); return D.slice(h).map(r => r.y - predV(m, r.f, r.cat)); };
  const missOf = e => Math.exp(median(e.map(Math.abs)));
  const vSel = select(['size', 'pace', 'category', 'growth', 'years', 'chains'], VL, S => ({ loo: missOf(looRes(S)), wf: missOf(wfRes(S)) }), 'loo');
  const U0 = P.filter(p => setAside(p) === null && dated(p));
  const medU = median(U0.map(yrsOf));
  const Ur = U0.map(p => ({ p, f: feat(p, medU), o: recordsToken(p) ? 1 : 0 }));
  const Us = Ur.slice().sort((a, b) => cmp(a.p.slug, b.p.slug));
  const Uw = Ur.slice().sort((a, b) => cmp(a.p.listed_at, b.p.listed_at) || cmp(a.p.slug, b.p.slug));
  const uh = Math.floor(Uw.length / 2);
  const cvB = S => {
   let e = 0;
   for (let f = 0; f < 10; f++) {
    const m = fitL(Us.filter((_, i) => i % 10 !== f), S);
    Us.forEach((r, i) => { if (i % 10 === f) e += (pOf(m, r.f) - r.o) ** 2; });
   }
   return e / Us.length;
  };
  const wfB = S => {
   const m = fitL(Uw.slice(0, uh), S), te = Uw.slice(uh);
   return te.reduce((s, r) => s + (pOf(m, r.f) - r.o) ** 2, 0) / te.length;
  };
  // Kin is left out: a sibling's token says nothing about whether this protocol launches its own.
  const oSel = select(['years', 'size', 'growth', 'chains'], OL, S => ({ cv: cvB(S), wf: wfB(S) }), 'cv');
  const VS = vSel.S, OS = oSel.S;
  const mv = fitV(Tr, VS), mo = fitL(Ur, OS);
  const lr = looRes(VS), wr = wfRes(VS);
  const sl = lr.slice().sort((a, b) => a - b);
  const q = { q10: quant(sl, 0.1), q25: quant(sl, 0.25), q75: quant(sl, 0.75), q90: quant(sl, 0.9) };
  const frac = (a, f) => a.filter(f).length / a.length;
  const in50 = x => x >= q.q25 && x <= q.q75, in80 = x => x >= q.q10 && x <= q.q90, ln3 = Math.log(3);
  // Placebo: shuffle pace across tokens; count shuffles as good on both tests.
  let placebo = null;
  if (VS.includes('pace')) {
   const pr = mulberry32(7), real = { loo: missOf(lr), wf: missOf(wr) };
   let as_good = 0;
   for (let k = 0; k < 200; k++) {
    const pv = Tr.map(r => r.f.pace);
    for (let i = pv.length - 1; i > 0; i--) { const j = Math.floor(pr() * (i + 1)); [pv[i], pv[j]] = [pv[j], pv[i]]; }
    const T = Tr.map((r, i) => ({ ...r, f: { ...r.f, pace: pv[i] } })), D = T.filter(r => dated(r.p)).sort((a, b) => cmp(a.p.listed_at, b.p.listed_at) || cmp(a.p.slug, b.p.slug));
    if (missOf(looRes(VS, T)) <= real.loo && missOf(wfRes(VS, D)) <= real.wf) as_good++;
   }
   placebo = { rounds: 200, as_good, loo: real.loo, wf: real.wf };
  }
  const R = P.filter(p => !recordsToken(p) && (watch.has(p.slug) || setAside(p) === null)).map(p => ({
   p, cat: p.category, fv: feat(p, medT), fo: feat(p, medU), tvl: p.tvl_usd,
  }));
  const score = (v, o, r) => {
   const launch = r.tvl * Math.exp(predV(v, r.fv, r.cat)), odds = pOf(o, r.fo);
   return { launch, odds, imp: Math.max(1, Math.round(launch * odds)) };
  };
  const sortIdx = imps => R.map((_, i) => i).sort((i, j) => (imps[j] - imps[i]) || (R[j].tvl - R[i].tvl) || cmp(R[i].p.slug, R[j].p.slug));
  // Bootstrap rank ranges: resample T and U each round, same kept terms, no reselection.
  const rng = mulberry32(20261114);
  const resample = a => Array.from({ length: a.length }, () => a[Math.floor(rng() * a.length)]);
  const ranks = R.map(() => []), vb = [], ob = [];
  for (let b = 0; b < 100; b++) {
   const v = fitV(resample(Tr), VS), o = fitL(resample(Ur), OS);
   vb.push(v.b); ob.push(o.b);
   sortIdx(R.map(r => score(v, o, r).imp)).forEach((i, pos) => ranks[i].push(pos + 1));
  }
  const exitPct = quant(P.map(p => p.change_7d).filter(x => x !== null).sort((a, b) => a - b), 0.05);
  const rows = R.map((r, i) => {
   const s = score(mv, mo, r), sr = ranks[i].slice().sort((a, b) => a - b);
   const rg = x => Math.max(1, Math.round(s.launch * Math.exp(x) * s.odds));
   const kq = kinQ.get(r.p.slug), on = watch.has(r.p.slug);
   const parts = { base: Math.exp(mv.b[0]), cat: mv.c[r.cat] !== undefined ? Math.exp(mv.c[r.cat]) : 1, intercept: mo.b[0] };
   mv.lin.forEach((t, j) => { parts[t] = Math.exp(mv.b[j + 1] * r.fv[t]); });
   if (mv.pace) parts.pace = Math.exp(mv.b[1 + mv.lin.indexOf('size')] * r.fv.pace);
   parts.logit = mo.S.map((t, j) => ({ term: t, x: r.fo[t], coef: mo.b[j + 1] }));
   const row = {
    slug: r.p.slug, name: r.p.name, category: r.p.category, chains: r.p.chains, tvl_usd: r.p.tvl_usd,
    change_7d: r.p.change_7d, listed_at: r.p.listed_at, set: on ? 'watchlist' : r.p.tvl_usd >= floor ? 'offlist' : 'early',
    age_days: ageDays(asOf, r.p.listed_at), kin: kq ? { name: kq.name, symbol: kq.symbol } : null,
    launch: s.launch, odds: s.odds, implied_value_usd: s.imp,
    lo25: rg(q.q25), hi75: rg(q.q75), lo10: rg(q.q10), hi90: rg(q.q90), parts,
    rank_lo: sr[4], rank_hi: sr[94], exit_tvl: r.p.tvl_usd * (1 + exitPct / 100),
   };
   row.plan = plan(row, DEFAULTS.deposit);
   row.v = verdict(row, DEFAULTS.deposit, DEFAULTS.share);
   return row;
  });
  rows.sort((a, b) => (b.implied_value_usd - a.implied_value_usd) || (b.tvl_usd - a.tvl_usd) || cmp(a.slug, b.slug));
  rows.forEach((r, i) => { r.rank = i + 1; });
  const traded = Tr.slice().sort((a, b) => (mc(b.p) - mc(a.p)) || cmp(a.p.slug, b.p.slug)).map(r => ({
   slug: r.p.slug, name: r.p.name, symbol: r.p.symbol, category: r.p.category, tvl_usd: r.p.tvl_usd,
   mcap_usd: r.p.mcap_usd, ratio: r.p.mcap_usd / r.p.tvl_usd, predicted: Math.exp(predV(mv, r.f, r.cat)),
  }));
  const rowBy = new Map(rows.map(r => [r.slug, r]));
  const tSet = new Set(Tr.map(r => r.p.slug));
  const GL = [['ranked-watchlist', 'Ranked · watchlist'], ['ranked-offlist', 'Ranked · off-list, above the floor'],
   ['ranked-early', 'Ranked · early, below the floor'], ['priced', 'Token trades · priced comp'],
   ['recorded', 'Token recorded · no usable cap'], ...Object.values(OUT)];
  const cnt = {};
  for (const p of P) {
   const k = rowBy.has(p.slug) ? 'ranked-' + rowBy.get(p.slug).set : tSet.has(p.slug) ? 'priced'
    : recordsToken(p) ? 'recorded' : OUT[setAside(p)][0];
   cnt[k] = (cnt[k] || 0) + 1;
  }
  const groups = GL.map(([key, label]) => ({ key, label, n: cnt[key] || 0 }));
  if (groups.reduce((s, g) => s + g.n, 0) !== P.length) throw new Error('group accounting mismatch');
  const cohorts = [['0 to 1 yr', 0, 1], ['1 to 2 yrs', 1, 2], ['2 to 3 yrs', 2, 3], ['3+ yrs', 3, Infinity]].map(([label, lo, hi]) => {
   const g = Ur.filter(r => r.f.years >= lo && r.f.years < hi);
   return { label, n: g.length, share: g.length ? g.reduce((s, r) => s + r.o, 0) / g.length : null };
  });
  return {
   version: VERSION, as_of: asOf, source: snap.source, floor_usd: floor, defaults: DEFAULTS, exit_pct: exitPct,
   value: {
    terms: vSel.rows, baseline: vSel.base, kept: VS, coef: named(mv.lin, mv.b), se: named(mv.lin, sdVec(vb)), cats: mv.c, placebo,
    n: Tr.length, q,
    cover: { loo50: frac(lr, in50), loo80: frac(lr, in80), wf50: frac(wr, in50), wf80: frac(wr, in80) },
    within3: { loo: frac(lr, x => Math.abs(x) <= ln3), wf: frac(wr, x => Math.abs(x) <= ln3) },
    final: { loo: missOf(lr), wf: missOf(wr) },
   },
   odds: {
    terms: oSel.rows, baseline: oSel.base, kept: OS, coef: named(mo.S, mo.b), se: named(mo.S, sdVec(ob)), n: Ur.length,
    base_rate: Ur.reduce((s, r) => s + r.o, 0) / Ur.length, cohorts, final: { cv: cvB(OS), wf: wfB(OS) },
   },
   groups, rows, traded,
   counts: {
    protocols: P.length, ranked: rows.length, watchlist: snap.watchlist.length,
    watch_covered: rows.filter(r => r.set === 'watchlist').length,
    offlist: rows.filter(r => r.set === 'offlist').length, early: rows.filter(r => r.set === 'early').length,
    priced: Tr.length, recorded: cnt.recorded || 0,
   },
  };
 }
 function boardRows(M) {
  return M.rows.map(r => ({
   rank: r.rank, slug: r.slug, name: r.name, implied_value_usd: r.implied_value_usd,
   farm_steps: r.plan.map(stepText), set: r.set, category: r.category, chains: r.chains, tvl_usd: r.tvl_usd,
   change_7d: r.change_7d, age_days: r.age_days, launch_value_usd: Math.round(r.launch), token_odds: r4(r.odds),
   range_p25_p75: [r.lo25, r.hi75], range_p10_p90: [r.lo10, r.hi90], rank_range: [r.rank_lo, r.rank_hi],
   verdict: r.v.verdict, net_usd: r2(r.v.net), fees_usd: r2(r.v.fees), hours: r2(r.v.hours),
  }));
 }
 return {
  DEFAULTS, fmtUsd, fmtPct, plan, verdict, stepText, build, boardRows, fnv,
 };
});
