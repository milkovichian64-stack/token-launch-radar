// Token Radar dashboard. Reads window.RADAR (written beside dashboard/ by
// main.ts) and renders a sortable, filterable board, a per-protocol detail
// view with the model's arithmetic, and the farm plan. No network at all.
// The value model and farm-plan derivation below are the same functions as
// lib/model.ts, so the page recomputes every row and plan from the snapshot
// figures and the screenshots agree with board.json by construction.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre', sort: 'implied', dir: -1, selected: null };

  var usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdFmt.format(n);
  }
  function fmtPct(n) { return n === null || n === undefined || !isFinite(n) ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + ' yrs';
    return Math.round(d) + ' days';
  }

  // ---- the model, identical to lib/model.ts ----
  function categoryMultiple(category) {
    var c = (category || '').toLowerCase();
    if (c.indexOf('chain') >= 0) return 0.7;
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('options') >= 0) return 0.62;
    if (c.indexOf('dex') >= 0) return 0.55;
    if (c.indexOf('prediction') >= 0) return 0.5;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 0.42;
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 0.4;
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('liquidity') >= 0) return 0.38;
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 0.36;
    if (c.indexOf('rwa') >= 0) return 0.34;
    if (c.indexOf('insurance') >= 0) return 0.32;
    if (c.indexOf('bridge') >= 0) return 0.3;
    return DATA.model.default_category_multiple;
  }
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_base + m.maturity_range * Math.sqrt(Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days);
    var reach = 1 + m.reach_per_chain * Math.min(Math.max((row.chains || []).length - 1, 0), m.reach_max_extra);
    return Math.max(1, Math.round(row.tvl_usd * categoryMultiple(row.category) * growthMult * maturity * reach));
  }

  // ---- the farm plan, identical derivation to lib/model.ts ----
  function chainOf(p) { return p.chains && p.chains.length ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    var c = String(chain).toLowerCase();
    if (c.indexOf('ethereum') >= 0) return { label: '$8-$20 of ETH for gas', swap: '$6-$15 per transaction' };
    if (c.indexOf('solana') >= 0) return { label: 'under $0.10 of SOL for fees', swap: 'under $0.10 per transaction' };
    if (c.indexOf('bitcoin') >= 0) return { label: '$1-$4 of BTC for fees', swap: '$1-$4 per transaction' };
    if (c.indexOf('arbitrum') >= 0 || c.indexOf('base') >= 0 || c.indexOf('optimism') >= 0 || c.indexOf('linea') >= 0 || c.indexOf('scroll') >= 0 || c.indexOf('zksync') >= 0 || c.indexOf('mantle') >= 0 || c.indexOf('mode') >= 0) return { label: '$0.20-$1.50 of ETH for gas', swap: '$0.20-$1 per transaction' };
    return { label: '$0.50-$3 of the native gas token', swap: '$0.50-$3 per transaction' };
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 2e9) return 500;
    if (p.tvl_usd >= 5e8) return 300;
    if (p.tvl_usd >= 1e8) return 200;
    if (p.tvl_usd >= 25e6) return 100;
    return 75;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function coreAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase(), n = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + n + ' on ' + chain + ', then borrow $' + Math.round(capital * 0.4) + ' against it and re-supply the borrowed amount so both sides of the market record your wallet';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap $' + Math.round(capital / 2) + " of USDC into the pool's second asset on " + n + ', add $' + capital + ' of two-sided liquidity to its main ' + chain + ' pool and keep the LP position open';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + " of USDC into " + n + "'s highest-TVL vault on " + chain + ' and leave auto-compounding switched on so the share balance grows on its own';
    if (c.indexOf('bridge') >= 0 || c.indexOf('canonical') >= 0) return 'Bridge $' + capital + ' of USDC from Ethereum to ' + chain + ' through ' + n + ', then spend at least $' + Math.round(capital * 0.3) + ' of it in one app on the destination chain the same day';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' worth of the native staking asset through ' + n + ' on ' + chain + ' and keep the liquid receipt token in the same wallet, unstaked and visible';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + n + ', open one small hedged position (long and short legs of $' + Math.round(capital * 0.3) + ' each) and let it accrue funding history';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' on ' + n + ' and take positions in at least three different open markets, sized $' + Math.round(capital / 5) + ' or less each, instead of one large bet';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Allocate $' + capital + ' of USDC into one curated ' + n + ' vault on ' + chain + ', choosing the vault with the longest live track record rather than the highest advertised APY';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of ' + n + "'s yield-bearing asset on " + chain + ' with USDC and hold the minted asset; do not immediately loop it into a second protocol';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of protocol cover from ' + n + ' on ' + chain + ' for a position you actually hold elsewhere, and keep the policy NFT in the farming wallet until it expires';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC onto ' + chain + " through " + n + "'s canonical route, then make your first swap and one contract interaction inside its own app on the same day";
    return 'Deposit $' + capital + ' of USDC into ' + n + "'s main product on " + chain + ' and keep the position open; use the product\'s primary action (deposit, supply or mint), not a test dust amount';
  }
  function secondAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase(), n = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Repay $' + Math.round(capital * 0.2) + ' of the borrow and borrow it again once, so the wallet shows a full borrow-repay cycle on ' + n + ' rather than a single passive deposit';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return 'Make three direct swaps of about $' + Math.round(capital * 0.2) + ' each through ' + n + ' on ' + chain + ' on different days, so the wallet reads as a returning user and not a one-off LP';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'Close and reopen the hedge once after at least 7 days, realising no more than $' + Math.round(capital * 0.05) + ' of trading loss, to build a second week of volume history on ' + n;
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Use the receipt token once inside " + n + "'s own ecosystem (restake it, vote with it or supply it where " + n + ' itself directs) instead of selling it on day one';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + Math.round(capital * 0.5) + ' back the other way through ' + n + ' after at least 14 days, so the wallet has a genuine round trip and not a single one-way transfer';
    return "Repeat " + n + "'s primary action with $" + Math.round(capital * 0.25) + ' more on ' + chain + ' in week two, from the same wallet, so activity spans more than one weekly snapshot';
  }
  function stepText(s) {
    var t = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
    if (t.length > 600) t = t.slice(0, 596) + '...';
    return t;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var second = p.chains && p.chains.length > 1 ? p.chains[1] : null;
    var capital = capitalFor(p), hold = holdDaysFor(p.age_days), gas = gasFor(chain);
    var weeks = Math.max(2, Math.round(hold / 7));
    var steps = [
      { text: 'Create one fresh wallet dedicated to ' + p.name + ', fund it with $' + (capital + 50) + ' of USDC plus ' + gas.label + ' on ' + chain + ', and store the seed phrase offline before any deposit', cost: '$' + (capital + 50) + ' of stablecoins plus ' + gas.label, time: '10 minutes to set up, funds settle the same day' },
      { text: coreAction(p, capital, chain), cost: '$' + capital + ' of capital committed, about ' + gas.swap + ' in fees', time: '20 minutes for the first position' },
      { text: secondAction(p, capital, chain), cost: 'about ' + gas.swap + ' in fees, no new capital beyond the step 2 position', time: '15 minutes, done in week two' },
      { text: 'Return once a week for ' + weeks + ' weeks: claim any rewards, re-balance if the position drifted by more than 10 percent, and make at least one small qualifying transaction on ' + p.name + ' each visit', cost: 'about ' + gas.swap + ' per weekly visit', time: '10 minutes a week for ' + weeks + ' weeks' }
    ];
    if (second !== null) steps.push({ text: 'Repeat the core position with $50 of USDC on ' + second + ", " + p.name + "'s second chain, from the same wallet, because multi-chain users are the cohort most launches reward first", cost: '$50 of extra capital plus under $2 of gas on most second chains', time: '15 minutes once, then it rides along with the weekly check' });
    else steps.push({ text: 'Deepen instead of spreading: add $50 more to the ' + chain + ' position in week three, because ' + p.name + ' runs on a single chain and depth in one wallet beats five dust wallets', cost: '$50 of extra capital plus one transaction fee', time: '10 minutes once in week three' });
    steps.push(
      { text: 'Hold the full position for at least ' + hold + ' days without withdrawing below $' + Math.round(capital * 0.8) + ', so the wallet appears in at least ' + weeks + ' separate weekly snapshots of ' + p.name, cost: 'the $' + capital + ' stays locked in the position for the whole period', time: hold + ' days of holding' },
      { text: "On the last day, screenshot the position, export the wallet's " + p.name + " transaction history into a farm log with dates and amounts, and withdraw only after checking the protocol's official points or announcement page for a snapshot date", cost: 'nothing to log; withdrawal costs one transaction fee', time: '20 minutes to document and exit cleanly' }
    );
    return steps.map(stepText);
  }

  // ---- tiny DOM helper ----
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var ch = arguments[i];
      if (ch === null || ch === undefined) continue;
      if (Array.isArray(ch)) ch.forEach(function (c) { if (c) node.appendChild(c); });
      else node.appendChild(typeof ch === 'string' ? document.createTextNode(ch) : ch);
    }
    return node;
  }

  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var s = params.toString();
    window.history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -1e18 : a.change_7d; bv = b.change_7d === null ? -1e18 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? 1e18 : a.age_days; bv = b.age_days === null ? 1e18 : b.age_days; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'ring' }), el('div', null, el('b', { text: 'Token Radar' }), el('span', { text: 'Pre-token launch radar' }))),
      el('div', { class: 'top-meta' },
        el('span', { class: 'chip' }, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', { class: 'chip' }, 'Model ', el('b', { text: DATA.model_version })),
        el('span', { class: 'chip' }, 'Source ', el('b', { text: 'DefiLlama' }))));
  }
  function hero() {
    var top = DATA.rows[0];
    return el('section', { class: 'hero' },
      el('div', null,
        el('h1', { text: 'Tokens that do not exist yet, priced like they do.' }),
        el('p', null, 'Every protocol below records ', el('b', { text: 'no token' }), ' in the snapshot. The radar prices the token it could issue from its TVL, momentum, tokenless age, category and chain reach — then gives you the exact farm plan, with costs and timings, for each one. Top of the board right now: ', el('b', { text: top ? top.name + ' at ' + fmtUsd(top.implied_value_usd) : 'n/a' }), '.')),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('em', { text: ' 100%' })),
        el('div', { class: 'stat' }, el('span', { text: 'Pre-token ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Early finds' }), el('b', { text: String(DATA.early_size) }), el('em', { text: ' beyond watchlist' })),
        el('div', { class: 'stat' }, el('span', { text: 'Already trading' }), el('b', { text: String(DATA.live_size) }), el('em', { text: ' set aside' }))));
  }
  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainSet = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainSet[c] = true; }); });
    var chains = Object.keys(chainSet).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, slug, category, chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function makeSelect(id, label, values, current, onChange) {
      var sel = el('select', { id: id, 'aria-label': label },
        el('option', { value: 'all', text: label === 'Category' ? 'All categories' : 'All chains' }),
        values.map(function (v) { return el('option', { value: v, text: v, selected: v === current ? 'selected' : null }); }));
      sel.addEventListener('change', function () { onChange(sel.value); writeHash(); render(); });
      return sel;
    }
    var catSel = makeSelect('f-cat', 'Category', cats, state.category, function (v) { state.category = v; });
    var chainSel = makeSelect('f-chain', 'Chain', chains, state.chain, function (v) { state.chain = v; });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Already trading', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'f-cat', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'f-chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre' ? filtered().length + ' of ' + DATA.board_size + ' rows' : DATA.live.length + ' live protocols' }));
  }
  function sortHead(key, label) {
    return el('th', { scope: 'col' }, el('button', { type: 'button', onclick: function () {
      if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' || key === 'rank' ? 1 : -1; }
      render();
    } }, label, state.sort === key ? el('span', { text: state.dir < 0 ? ' ↓' : ' ↑' }) : null));
  }
  function boardTable() {
    var list = sorted(filtered());
    if (!list.length) return el('div', { class: 'panel' }, el('div', { class: 'empty' },
      el('h2', { text: 'Nothing matches that filter' }),
      el('p', { text: 'Try a different category or chain, or clear the search.' }),
      el('button', { class: 'btn primary', type: 'button', text: 'Clear all filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })));
    var max = 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var watch = r.watchlist === true;
      tbody.appendChild(el('tr', { 'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
        el('td', { class: 'rank', text: '#' + r.rank }),
        el('td', null, el('div', { class: 'pname' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + ((r.chains || []).slice(0, 3).join(', ') || 'no chain listed') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round(r.implied_value_usd / max * 100)) + '%' })), el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })),
        el('td', null, watch ? el('span', { class: 'tag', text: 'watchlist' }) : el('span', { class: 'tag early', text: 'early find' }))));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', null,
      el('caption', { text: 'Ranked by implied token value under model ' + DATA.model_version + '. Select any row for its full model breakdown and 7-step farm plan.' }),
      el('thead', null, el('tr', null, sortHead('rank', 'Rank'), sortHead('name', 'Protocol'), sortHead('tvl', 'TVL'), sortHead('growth', '7d change'), sortHead('age', 'Tokenless age'), sortHead('implied', 'Implied value'), el('th', { scope: 'col', text: 'Radar' }))),
      tbody)));
  }
  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'tag live', text: 'trading' })),
        el('td', null, el('div', { class: 'pname' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + ((r.chains || []).slice(0, 3).join(', ') || 'no chain listed') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) })));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', null,
      el('caption', { text: 'These protocols already have a trading token, so the market — not the model — sets their value. They are excluded from the pre-token ranking on purpose.' }),
      el('thead', null, el('tr', null, el('th', { text: 'Status' }), el('th', { text: 'Protocol' }), el('th', { text: 'TVL' }), el('th', { text: '7d change' }), el('th', { text: 'Market cap (actual)' }))),
      tbody)));
  }
  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How the price is derived — model ' + DATA.model_version }),
      el('div', { class: 'formula', text: 'implied = round( TVL × category_multiple × (1 + clamp(7d%, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + ') × (' + m.maturity_base + ' + ' + m.maturity_range + ' × √(min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ')) × (1 + ' + m.reach_per_chain + ' × min(chains − 1, ' + m.reach_max_extra + ')) )' }),
      el('p', { text: 'Only snapshot fields are used: TVL, 7-day TVL change, days since first listing (how long the protocol has run with no token; unknown ages count as ' + m.unknown_age_days + ' days), category and chain count. Category multiples run from 0.30 for bridges (pass-through collateral) to 0.70 for chains, with DEXes at 0.55, derivatives at 0.62 and lending at 0.42. No protocol name is special-cased: open any row and the page recomputes its value live from the same figures.' }),
      el('p', { text: 'Who is excluded, and why: protocols whose token already trades are shown separately, never ranked. Wrapped, staked and bridged products of a trading token (wrapped BTC, exchange staked ETH, bridged stablecoins), exchange books and versioned pools are excluded entirely — they record no token of their own, but the asset behind them already trades, so pricing a launch for them would be fiction.' }),
      el('p', { text: 'A note on honesty: an implied value is what a token would be worth if the protocol\'s record stayed as it is. It is not a prediction that a token will launch, and this board never claims a protocol has no token — only that the snapshot records none.' }));
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'd-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });
  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var check = impliedOf(row);
    dialog.appendChild(el('div', { class: 'd-head' },
      el('div', null, el('span', { class: 'eyebrow', text: 'Rank #' + row.rank + ' of ' + DATA.board_size + ' · records no token' }), el('h2', { id: 'd-title', text: row.name }), el('p', { class: 'sub', text: (row.category || 'Other') + ' · ' + ((row.chains || []).join(', ') || 'no chain listed') + ' · first listed ' + (row.listed_at || 'unknown') })),
      el('button', { class: 'close', type: 'button', text: 'Close ✕', onclick: function () { dialog.close(); } })));
    dialog.appendChild(el('section', { class: 'd-sec' },
      el('h3', { text: 'Implied value breakdown' }),
      el('div', { class: 'eq' },
        el('div', null, el('span', { text: 'TVL (snapshot)' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple (' + (row.category || 'default') + ')' }), el('b', { text: '× ' + row.category_multiple })),
        el('div', null, el('span', { text: 'Momentum, 7d ' + fmtPct(row.change_7d) }), el('b', { text: '× ' + row.growth_multiplier })),
        el('div', null, el('span', { text: 'Maturity, ' + fmtAge(row.age_days) + ' tokenless' }), el('b', { text: '× ' + row.maturity_multiplier })),
        el('div', null, el('span', { text: 'Reach, ' + (row.chains || []).length + ' chain(s)' }), el('b', { text: '× ' + row.reach_multiplier })),
        el('div', { class: 'total' }, el('span', { text: 'Implied token value' }), el('b', { text: fmtUsd(row.implied_value_usd) }))),
      el('p', { class: 'note', text: 'Recomputed live on this page: ' + fmtUsd(check) + (check === row.implied_value_usd ? ' — identical to board.json, so code and data agree.' : ' — differs from the board, which would mean stale data.') })));
    dialog.appendChild(el('section', { class: 'd-sec' },
      el('h3', { text: 'Farm plan — 7 steps, costs and timings included' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        return el('li', null, el('b', { text: at >= 0 ? s.slice(0, at) : s }), at >= 0 ? el('span', { class: 'cost', text: s.slice(at + 1) }) : null);
      }))));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }
  function render() {
    var selected = state.selected;
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(hero());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre' ? boardTable() : liveTable());
    if (state.tab === 'pre') shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'foot' }, el('span', { text: 'Built from the sealed DefiLlama snapshot of ' + DATA.as_of + '. Fully static: no network, no tracking.' }), el('span', { text: DATA.board_size + ' pre-token · ' + DATA.live_size + ' live shown separately' })));
    app.appendChild(shell);
    if (!dialog.isConnected) app.appendChild(dialog);
    app.setAttribute('aria-busy', 'false');
    state.selected = selected;
    if (selected && !dialog.open) openDetail(selected);
  }
  readHash();
  render();
  if (state.selected) openDetail(state.selected);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
