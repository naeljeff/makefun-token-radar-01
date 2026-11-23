/*
 * Token launch radar value model, comps-1. Pure: no network, clock, Intl or randomness.
 * implied = tvl * multiple * growth * runway * family
 *   multiple: exp of mean ln(mcap/tvl) per category, shrunk to the global mean (weight 4).
 *   growth:   sqrt(1 + clamp(change_7d, -40, 60) / 100).
 *   runway:   ramp (age to 540d, floor 0.5) * stale (after 1095d, -15%/yr, floor 0.6).
 *   family:   0.4 when a traded token shares the first name word (length >= 4).
 * drop_per_1k = 1000 * implied / tvl * 0.075.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RadarModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = 'comps-1';
  const C = {
    prior_weight: 4, ratio_min: 0.005, ratio_max: 20, growth_floor: -40, growth_cap: 60,
    unknown_age_days: 365, ramp_days: 540, ramp_floor: 0.5, stale_after_days: 1095,
    stale_per_year: 0.15, stale_floor: 0.6, family_factor: 0.4, airdrop_share: 0.075,
    idle_apr: 0.05, borrow_apr: 0.08, default_gas: 0.25,
  };
  const GAS_USD = {
    Ethereum: 3, Bitcoin: 2, Tron: 1, Arbitrum: 0.05, Base: 0.02, Optimism: 0.03, Polygon: 0.02,
    Binance: 0.08, Avalanche: 0.05, Solana: 0.01, Sui: 0.01, Aptos: 0.01, Monad: 0.02,
    'Hyperliquid L1': 0.01, Plasma: 0.01, Sonic: 0.01, Berachain: 0.02, Linea: 0.05, Scroll: 0.05,
    'zkSync Era': 0.05, Starknet: 0.05, Mantle: 0.02, Unichain: 0.02, Ink: 0.02, Katana: 0.02,
    Stellar: 0.01, Ripple: 0.01, Algorand: 0.01, Cardano: 0.2, TON: 0.05, Near: 0.01, Sei: 0.01,
    Flare: 0.02, 'Robinhood Chain': 0.02, Arc: 0.02, Bittensor: 0.01, Provenance: 0.05,
  };
  // Category → farm-plan group; anything unlisted is 'other'.
  const GROUP_OF = {};
  const GROUPS = {
    vault: ['Risk Curators', 'Onchain Capital Allocator', 'Yield', 'Yield Aggregator', 'Liquidity Manager', 'Farm', 'Leveraged Farming', 'Indexes', 'Governance Incentives', 'Options Vault'],
    lend: ['Lending', 'Uncollateralized Lending', 'CDP', 'CDP Manager', 'Collateral Markets'],
    dex: ['Dexs', 'OTC Marketplace'],
    perps: ['Derivatives', 'Interest Rate Derivatives', 'Basis Trading'],
    btc: ['Anchor BTC', 'Decentralized BTC', 'Restaked BTC'],
    stake: ['Staking Pool', 'Restaking', 'Liquid Staking', 'Liquid Restaking'],
    stable: ['Dual-Token Stablecoin', 'Stablecoin Wrapper', 'RWA', 'CeDeFi'],
    predict: ['Prediction Market'],
  };
  for (const g in GROUPS) for (const c of GROUPS[g]) GROUP_OF[c] = g;
  const WRAPPED_CATS = ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'];

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const round2 = x => Math.round(x * 100) / 100;
  const round4 = x => Math.round(x * 1e4) / 1e4;
  const gasOf = c => (Object.prototype.hasOwnProperty.call(GAS_USD, c) ? GAS_USD[c] : C.default_gas);
  const cheapest = list => list.reduce((best, c) => (gasOf(c) < gasOf(best) ? c : best));
  const byMcapThenSlug = (a, b) => (b.mcap_usd - a.mcap_usd) || cmp(a.slug, b.slug);

  const recordsToken = p => p.gecko_id !== null || p.symbol !== null || (p.mcap_usd !== null && p.mcap_usd > 0);

  function setAside(p) {
    if (/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(p.name)) return 'versioned release';
    if (WRAPPED_CATS.includes(p.category)) return 'wrapped, staked or bridged category';
    if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return 'wrapped or staked product';
    if (/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/.test(p.name)) return 'exchange product';
    return null;
  }

  function firstWord(name) {
    const m = String(name).toLowerCase().match(/[a-z0-9]+/);
    return m ? m[0] : '';
  }

  function families(protocols) {
    const best = new Map();
    for (const p of protocols) {
      const w = firstWord(p.name);
      if (!recordsToken(p) || w.length < 4) continue;
      const m = p.mcap_usd ?? 0;
      const cur = best.get(w);
      if (!cur || m > cur.m || (m === cur.m && cmp(p.slug, cur.slug) < 0)) {
        best.set(w, { m, slug: p.slug, name: p.name, symbol: p.symbol });
      }
    }
    const out = new Map();
    for (const [w, v] of best) out.set(w, { slug: v.slug, name: v.name, symbol: v.symbol });
    return out;
  }

  // Traded set: token with positive mcap and TVL, excluding CEX.
  const tradedSet = protocols => protocols.filter(p => recordsToken(p) && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX');
  const ratioOf = p => clamp(p.mcap_usd / p.tvl_usd, C.ratio_min, C.ratio_max);

  function comps(protocols) {
    const L = tradedSet(protocols);
    const lnG = L.length ? L.reduce((s, p) => s + Math.log(ratioOf(p)), 0) / L.length : 0;
    const groups = new Map();
    for (const p of L) {
      if (p.category === null) continue;
      if (!groups.has(p.category)) groups.set(p.category, []);
      groups.get(p.category).push(p);
    }
    const byCategory = {};
    for (const [cat, mem] of groups) {
      const s = mem.reduce((a, p) => a + Math.log(ratioOf(p)), 0);
      const peers = mem.slice().sort(byMcapThenSlug).slice(0, 5).map(p => ({
        slug: p.slug, name: p.name, symbol: p.symbol, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, ratio: ratioOf(p),
      }));
      byCategory[cat] = { n: mem.length, multiple: Math.exp((s + C.prior_weight * lnG) / (mem.length + C.prior_weight)), peers };
    }
    return { n: L.length, global: Math.exp(lnG), byCategory };
  }

  const DAY = 864e5;
  const utc = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
    && new Date(utc(s)).toISOString().slice(0, 10) === s;

  function ageDays(asOf, listedAt) {
    if (!isDay(listedAt) || !isDay(asOf)) return null;
    return Math.max(0, Math.floor((utc(asOf) - utc(listedAt)) / DAY));
  }

  function price(p, ctx) {
    const cat = p.category !== null && Object.prototype.hasOwnProperty.call(ctx.comps.byCategory, p.category)
      ? ctx.comps.byCategory[p.category] : null;
    const growth_pct = clamp(p.change_7d ?? 0, C.growth_floor, C.growth_cap);
    const growth_factor = Math.sqrt(1 + growth_pct / 100);
    const age_days = ageDays(ctx.asOf, p.listed_at);
    const a = age_days ?? C.unknown_age_days;
    const ramp = C.ramp_floor + (1 - C.ramp_floor) * Math.min(a / C.ramp_days, 1);
    const stale = a > C.stale_after_days ? Math.max(C.stale_floor, 1 - C.stale_per_year * (a - C.stale_after_days) / 365) : 1;
    const runway_factor = ramp * stale;
    const fw = firstWord(p.name);
    const f = fw.length >= 4 ? ctx.families.get(fw) : undefined;
    const family = f && f.slug !== p.slug ? f : null;
    const family_factor = family ? C.family_factor : 1;
    const implied_usd = Math.max(1, Math.round(p.tvl_usd * (cat ? cat.multiple : ctx.comps.global) * growth_factor * runway_factor * family_factor));
    return {
      tvl_usd: p.tvl_usd,
      multiple: cat ? cat.multiple : ctx.comps.global,
      multiple_n: cat ? cat.n : 0,
      multiple_source: cat ? p.category : 'all traded tokens',
      growth_pct, growth_factor, age_days, runway_factor, ramp, stale, family, family_factor, implied_usd,
      drop_per_1k: Math.round(1000 * implied_usd / p.tvl_usd * C.airdrop_share),
    };
  }

  // Comma grouping by hand: toLocaleString would vary by locale.
  const group = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  function fmtUsd(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 10) return '$' + group(Math.round(n));
    return '$' + n.toFixed(2);
  }

  const fmtPct = n => (n == null ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(1) + '%');

  function farmPlan(p, pr) {
    const top = p.chains.length ? p.chains.slice(0, 3) : ['Ethereum'];
    const chain = cheapest(top);
    const gas = gasOf(chain);
    const others = p.chains.filter(c => c !== chain);
    const chain2 = others.length ? cheapest(others) : null;
    const name = p.name;
    const $ = fmtUsd;

    const cap = p.tvl_usd >= 1e9 ? 2000 : p.tvl_usd >= 2.5e8 ? 1000 : p.tvl_usd >= 5e7 ? 500 : 250;
    const C$ = $(cap);
    const hold = pr.age_days === null ? 60 : pr.age_days < 180 ? 90 : pr.age_days < 540 ? 60 : 45;
    const weeks = Math.ceil(hold / 7);
    const txCount = 5 + weeks;
    const gasBudget = Math.max(1, round2(gas * txCount * 1.5));

    const g = GROUP_OF[p.category] || 'other';
    const asset = g === 'btc' ? 'BTC' : g === 'stake' ? `${chain}'s staking asset` : 'USDC';

    const core = {
      vault: [`Deposit ${C$} of USDC into the largest vault ${name} runs or curates on ${chain}, and keep the vault shares in the same wallet.`,
        `${$(gas)} gas plus the vault's own fee, often 0 to 10% of the yield`, '15 minutes'],
      lend: [`Supply ${C$} of USDC to ${name} on ${chain}, then borrow ${$(cap * 0.2)} of another stablecoin against it to show a borrower position, keeping the health factor above 2.`,
        `${$(gas * 2)} gas plus about ${$(cap * 0.2 * C.borrow_apr * hold / 365)} of interest over ${hold} days at 8% APR`, '20 minutes'],
      dex: [`Add ${C$} of liquidity to ${name}'s deepest stablecoin or major pair on ${chain}, split 50/50, with a wide range if the pool is concentrated.`,
        `${$(gas * 2)} gas; near-zero impermanent loss on a stable pair, a few per cent on a volatile one`, '15 minutes'],
      perps: [`Deposit ${C$} of USDC as margin on ${name} on ${chain} and open a matched long and short (or use its basis vault) so price moves net to zero.`,
        `${$(gas)} gas plus about ${$(cap * 2 * 0.0005)} of taker fees at 0.05% a side`, '20 minutes'],
      btc: [`Deposit ${C$} worth of BTC through ${name} on ${chain} and hold the receipt token it issues.`,
        `${$(gas)} gas plus any mint fee the app shows`, '20 minutes'],
      stake: [`Stake ${C$} worth of ${chain}'s staking asset through ${name} and keep the receipt.`,
        `${$(gas)} gas; unstaking may queue for days`, '15 minutes'],
      stable: [`Mint or buy ${C$} of ${name}'s yield-bearing asset on ${chain} and hold it in the wallet.`,
        `${$(gas)} gas plus any mint or redemption fee`, '15 minutes'],
      predict: [`Fund ${C$} of USDC on ${name} and spread it over three liquid markets that settle within 30 days.`,
        `${$(gas)} gas; a position can lose its whole stake`, '30 minutes'],
      other: [`Route ${C$} of USDC through ${name} on ${chain} with one real use of its main product: a transfer, a bridge or a payment.`,
        `${$(gas * 2)} gas plus its own fee`, '15 minutes'],
    }[g];

    const age = pr.age_days;
    const reason = age === null ? 'its listing date is unknown, so assume a standard season'
      : age < 180 ? `it has run only ${age} days with no token, early in any points season`
      : age < 540 ? `${age} days with no token puts it mid-season`
      : `it has run ${age} days with no token, so the hold only has to span more than one snapshot`;

    const steps = [
      [`Withdraw ${C$} of ${asset} from an exchange straight to a fresh wallet on ${chain}, the cheapest of ${name}'s top chains (${top.join(', ')}), and keep ${$(gasBudget)} of its gas token for about ${txCount} transactions.`,
        `${C$} of capital plus about ${$(Math.max(1, gas * 2))} withdrawal fee`, '20 minutes'],
      [`Find ${name} on DefiLlama by its slug "${p.slug}", open the app only from that listing, and confirm in its docs the contract you will approve and whether a points or rewards page is live.`,
        'nothing', '10 minutes'],
    ];
    if (pr.family) {
      steps.push([`DefiLlama records a traded token${pr.family.symbol ? ' (' + pr.family.symbol + ')' : ''} for ${pr.family.name}, which shares this name: check ${name}'s docs for whether that token already covers it, and if it does, farm that token's incentives instead of betting on a new drop.`,
        'nothing', '10 minutes']);
    }
    steps.push(core);
    steps.push(chain2
      ? [`Repeat a smaller deposit, ${$(cap * 0.2)}, on ${chain2}: points programs often weigh use across chains.`, `${$(gasOf(chain2))} gas`, '10 minutes']
      : [`Use a second product of ${name} once (another vault, pool or market) with ${$(cap * 0.2)}, so the wallet shows more than one kind of action.`, `${$(gas)} gas`, '10 minutes']);
    steps.push([`Once a week for ${weeks} weeks, make one qualifying action (top up, claim, rebalance or vote) instead of letting the wallet sit idle.`,
      `${$(gas * weeks)} of gas in all, ${$(gas)} a week`, `${weeks * 10} minutes in all, 10 a week`]);
    steps.push([`Hold the position ${hold} days: ${reason}.`, `about ${$(cap * C.idle_apr * hold / 365)} of forgone stablecoin yield at 5% APR`, `${hold} days`]);
    steps.push([`Exit early if TVL falls more than 25% in a week (it moved ${fmtPct(p.change_7d)} in the snapshot's week) or the team says no token is planned.`,
      `${$(gas * 2)} gas to unwind`, '15 minutes']);
    steps.push([`If ${name} issues a token, claim only through the link in its own docs. At this board's implied value of ${$(pr.implied_usd)} and a 7.5% community share, ${C$} pro rata to its TVL would earn about ${$(cap / 1000 * pr.drop_per_1k)}.`,
      `${$(gas)} gas to claim; never pay a fee to claim`, '15 minutes']);
    return steps.map(([action, cost, time]) => ({ action, cost, time }));
  }

  function stepText(s) {
    const t = `${s.action} Cost: ${s.cost}. Time: ${s.time}.`.trim();
    return t.length > 600 ? t.slice(0, 597) + '...' : t;
  }

  function build(snapshot) {
    const protocols = snapshot.protocols;
    const ctx = { asOf: snapshot.as_of, comps: comps(protocols), families: families(protocols) };
    const watch = new Set(snapshot.watchlist);

    const rows = protocols
      .filter(p => !recordsToken(p) && (watch.has(p.slug) || setAside(p) === null))
      .map(p => {
        const pr = price(p, ctx);
        const on = watch.has(p.slug);
        return {
          slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd,
          change_7d: p.change_7d, listed_at: p.listed_at, on_watchlist: on, set: on ? 'watchlist' : 'early',
          price: pr, plan: farmPlan(p, pr), implied_value_usd: pr.implied_usd,
        };
      });
    rows.sort((a, b) => (b.implied_value_usd - a.implied_value_usd) || (b.tvl_usd - a.tvl_usd) || cmp(a.slug, b.slug));
    rows.forEach((r, i) => { r.rank = i + 1; });

    const traded = tradedSet(protocols).slice().sort(byMcapThenSlug).map(p => ({
      slug: p.slug, name: p.name, symbol: p.symbol, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd, ratio: ratioOf(p), change_7d: p.change_7d,
    }));

    const by_reason = {};
    let total = 0;
    for (const p of protocols) {
      if (recordsToken(p) || watch.has(p.slug)) continue;
      const why = setAside(p);
      if (!why) continue;
      by_reason[why] = (by_reason[why] || 0) + 1;
      total++;
    }

    const watch_covered = rows.filter(r => r.on_watchlist).length;
    return {
      version: VERSION, as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd,
      constants: C, comps: ctx.comps, rows, traded,
      set_aside: { total, by_reason },
      counts: {
        protocols: protocols.length,
        pretoken: protocols.filter(p => !recordsToken(p)).length,
        ranked: rows.length,
        watchlist: snapshot.watchlist.length,
        watch_covered,
        early: rows.length - watch_covered,
        traded: traded.length,
        token_no_mcap: protocols.filter(p => recordsToken(p) && !(p.mcap_usd > 0)).length,
      },
    };
  }

  function boardRows(model) {
    return model.rows.map(r => ({
      rank: r.rank, slug: r.slug, name: r.name, implied_value_usd: r.implied_value_usd,
      farm_steps: r.plan.map(stepText), category: r.category, chains: r.chains, tvl_usd: r.tvl_usd,
      change_7d: r.change_7d, listed_at: r.listed_at, age_days: r.price.age_days, token_status: 'pre-token',
      on_watchlist: r.on_watchlist, drop_per_1k_usd: r.price.drop_per_1k,
      model: {
        multiple: round4(r.price.multiple), multiple_source: r.price.multiple_source, multiple_n: r.price.multiple_n,
        growth_factor: round4(r.price.growth_factor), runway_factor: round4(r.price.runway_factor),
        family_factor: r.price.family_factor, family_of: r.price.family ? r.price.family.name : null,
      },
    }));
  }

  function issue(rows, snapshot) {
    if (!Array.isArray(rows) || rows.length < 100 || rows.length > 4000) return `row count ${rows && rows.length} outside 100..4000`;
    const slugs = new Set(snapshot.protocols.map(p => p.slug));
    const rowSlugs = new Set(rows.map(r => r.slug));
    for (const w of snapshot.watchlist) if (!rowSlugs.has(w)) return `watchlist slug missing: ${w}`;
    const seen = new Set();
    for (const r of rows) {
      if (seen.has(r.slug)) return `duplicate slug ${r.slug}`;
      seen.add(r.slug);
      if (!slugs.has(r.slug)) return `slug not in snapshot: ${r.slug}`;
    }
    for (let i = 0; i < rows.length; i++) if (rows[i].rank !== i + 1) return `rank ${rows[i].rank} at index ${i}`;
    let prev = Infinity;
    for (const r of rows) {
      const v = r.implied_value_usd;
      if (!Number.isSafeInteger(v) || v <= 0 || v > 1e14) return `bad implied value for ${r.slug}: ${v}`;
      if (v > prev) return `implied value rises at rank ${r.rank}`;
      prev = v;
    }
    if (rows.every(r => r.implied_value_usd === rows[0].implied_value_usd)) return 'all implied values equal';
    for (const r of rows) {
      if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) return `farm step count for ${r.slug}`;
      for (const s of r.farm_steps) {
        const len = typeof s === 'string' ? s.trim().length : -1;
        if (len < 20 || len > 600) return `farm step length for ${r.slug}`;
      }
      if (typeof r.name !== 'string' || !r.name.trim()) return `empty name for ${r.slug}`;
    }
    return null;
  }

  return {
    VERSION, C, GAS_USD, recordsToken, setAside, firstWord, families, comps, ageDays, price,
    farmPlan, stepText, fmtUsd, fmtPct, build, boardRows, issue,
  };
});
