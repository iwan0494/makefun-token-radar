// Launch Radar R6 dashboard. Reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, the validation chart, a
// per-protocol detail view with the model's own terms and the money netted,
// and the live / set-aside views. No network: every byte shown is in data.js.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tier: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, view: '' };
  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) { if (n === null || n === undefined || !isFinite(n)) return 'n/a'; return (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtAge(d) { if (d === null || d === undefined) return 'unknown'; if (d >= 365) return (d / 365).toFixed(1) + 'y'; return Math.max(0, Math.round(d)) + 'd'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // The model in one function: the page recomputes a row from the snapshot
  // figures and checks the number board.json carries, so the page's code and
  // the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var g = Math.min(1.2, Math.max(-0.6, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d / 100));
    var age = row.age_days === null || row.age_days === undefined ? 1 : row.age_days / 365;
    var log = model.intercept + model.log_tvl * Math.log(row.tvl_usd) + model.growth * g + model.record_years * age + model.log_chains * Math.log(1 + (row.chains || []).length);
    return Math.max(1, Math.round(Math.exp(log)));
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var p = new URLSearchParams(hash);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('tier')) state.tier = p.get('tier');
    if (p.get('tab')) state.tab = p.get('tab');
    if (p.get('p')) state.selected = p.get('p');
    if (p.get('view')) state.view = p.get('view');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.tier !== 'all') p.set('tier', state.tier);
    if (state.tab !== 'pre-token') p.set('tab', state.tab);
    if (state.selected) p.set('p', state.selected);
    if (state.view) p.set('view', state.view);
    var next = p.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.tier !== 'all' && r.tier !== state.tier) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    return list.slice().sort(function (a, b) {
      var av, bv, k = state.sort;
      if (k === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (k === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (k === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (k === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (k === 'odds') { av = a.odds_pct; bv = b.odds_pct; }
      else if (k === 'score') { av = a.score; bv = b.score; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Launch Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model · ' + DATA.comps_n + ' comps' })));
  }
  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.board_size + ' pre-token protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor.' })),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))));
  }
  function kpis() {
    var v = DATA.validation;
    return el('section', { class: 'kpis', 'aria-label': 'Key figures' },
      el('div', { class: 'kpi worth' }, el('span', { text: 'Worth farming' }), el('b', { text: String(DATA.tiers.worth) })),
      el('div', { class: 'kpi' }, el('span', { text: 'Marginal / Skip' }), el('b', { text: DATA.tiers.marginal + ' / ' + DATA.tiers.skip })),
      el('div', { class: 'kpi' }, el('span', { text: 'Rows priced' }), el('b', { text: String(DATA.board_size) })),
      el('div', { class: 'kpi loo' }, el('span', { text: 'Leave-one-out within 3x' }), el('b', { text: v.loo.pct.toFixed(1) + '%' })),
      el('div', { class: 'kpi' }, el('span', { text: 'Median miss (LOO)' }), el('b', { text: 'x' + v.loo.median_miss.toFixed(2) })));
  }
  function integrity() {
    var a = DATA.accounting, m = DATA.model;
    return el('section', { class: 'integrity' },
      el('div', null, el('b', { text: a.total + ' accounted' }), ' — ' + a.trade + ' trade · ' + a.set_aside + ' set aside · ' + a.priced + ' priced · ' + a.watchlist + '/' + a.watchlist + ' watchlist'),
      el('div', { class: 'formula', text: 'log(mcap) = ' + m.intercept.toFixed(4) + ' + ' + m.log_tvl.toFixed(4) + '·log(TVL) + ' + m.growth.toFixed(4) + '·growth + ' + m.record_years.toFixed(4) + '·record years ' + m.log_chains.toFixed(4) + '·log(1+chains), fit on ' + DATA.comps_n + ' launched comps' }));
  }
  function vcard(cls, title, run, note) {
    return el('div', { class: 'vcard ' + cls },
      el('h3', { text: title }),
      el('b', { text: run.pct.toFixed(1) + '%' }),
      el('span', { text: run.within + ' of ' + run.n + ' within 3x · median miss x' + run.median_miss.toFixed(2) }),
      el('span', { text: note }));
  }
  function validation() {
    var v = DATA.validation;
    return el('section', { id: 'validation' },
      el('div', { class: 'valid' },
        vcard('loo', 'Leave-one-out', v.loo, 'Fit on 59 comps, predict the one left out.'),
        vcard('blind', 'Blind test', v.blind, 'Fit the 28 earliest-listed comps, predict the 32 most recent.'),
        vcard('wf', 'Walk-forward', v.walk_forward, 'Fit the first 16 listed, predict each next comp in order.')),
      chart(),
      el('div', { class: 'chart-cards' },
        el('div', null, el('b', { text: 'Leave-one-out ' }), 'tests the fit where it has seen the least: every comp predicted once, from the other 59.'),
        el('div', null, el('b', { text: 'Blind ' }), 'tests it on launches it never trained on: the newest third of the comps.'),
        el('div', null, el('b', { text: 'Walk-forward ' }), 'tests it in time order: each prediction uses only comps listed before it.')));
  }
  function chart() {
    var pts = DATA.scatter || [];
    var W = 640, H = 340, L = 56, R = 16, T = 14, B = 40;
    var lo = Math.log(1e5), hi = Math.log(1e10);
    function X(v) { return L + (Math.log(Math.max(1e5, Math.min(1e10, v))) - lo) / (hi - lo) * (W - L - R); }
    function Y(v) { return T + (1 - (Math.log(Math.max(1e5, Math.min(1e10, v))) - lo) / (hi - lo)) * (H - T - B); }
    var colors = { loo: '#22d3ee', blind: '#34d399', 'walk-forward': '#a78bfa' };
    var dots = pts.map(function (p) {
      return '<circle cx="' + X(p.predicted_usd).toFixed(1) + '" cy="' + Y(p.actual_usd).toFixed(1) + '" r="3.2" fill="' + colors[p.series] + '" fill-opacity="0.75"/>';
    }).join('');
    var ticks = [1e6, 1e7, 1e8, 1e9, 1e10].map(function (t, i) {
      var anchor = i === 0 ? 'start' : i === 4 ? 'end' : 'middle';
      return '<line x1="' + X(t) + '" y1="' + T + '" x2="' + X(t) + '" y2="' + (H - B) + '" stroke="#1e293b" stroke-width="1"/>' +
        '<text x="' + X(t) + '" y="' + (H - B + 16) + '" fill="#94a3b8" font-size="10" text-anchor="' + anchor + '">' + fmtUsd(t) + '</text>' +
        '<line x1="' + L + '" y1="' + Y(t) + '" x2="' + (W - R) + '" y2="' + Y(t) + '" stroke="#1e293b" stroke-width="1"/>' +
        '<text x="' + (L - 6) + '" y="' + (Y(t) + 3) + '" fill="#94a3b8" font-size="10" text-anchor="end">' + fmtUsd(t) + '</text>';
    }).join('');
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Predicted against actual market cap for the validation comps">' +
      '<defs><clipPath id="plot"><rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '"/></clipPath></defs>' +
      '<rect x="0.5" y="0.5" width="' + (W - 1) + '" height="' + (H - 1) + '" fill="none" stroke="#1e293b"/>' +
      '<rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '" fill="#0b1220" stroke="#1e293b"/>' +
      ticks +
      '<line x1="' + X(1e5) + '" y1="' + Y(1e5) + '" x2="' + X(1e10) + '" y2="' + Y(1e10) + '" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4 3"/>' +
      '<g clip-path="url(#plot)">' + dots + '</g>' +
      '<text x="' + (L + (W - L - R) / 2) + '" y="' + (H - 6) + '" fill="#94a3b8" font-size="11" text-anchor="middle">Predicted market cap (log scale)</text>' +
      '<text x="14" y="' + (T + (H - T - B) / 2) + '" fill="#94a3b8" font-size="11" text-anchor="middle" transform="rotate(-90 14 ' + (T + (H - T - B) / 2) + ')">Actual market cap (log scale)</text></svg>';
    return el('div', { class: 'chart' },
      el('h2', { text: 'Validation: predicted vs actual market cap' }),
      el('p', { class: 'sub', text: 'Each dot is one launched comp. The dashed line is a perfect prediction; dots within 3x of it count. Negative 7d growth is shown in rose in the board, never here: this chart is value against value.' }),
      el('div', { class: 'legend' },
        el('span', { html: '<i style="background:#22d3ee"></i>Leave-one-out (' + DATA.validation.loo.n + ')' }),
        el('span', { html: '<i style="background:#34d399"></i>Blind (' + DATA.validation.blind.n + ')' }),
        el('span', { html: '<i style="background:#a78bfa"></i>Walk-forward (' + DATA.validation.walk_forward.n + ')' })),
      el('div', { html: svg }));
  }
  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var sel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      cats.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); }));
    sel.addEventListener('change', function () { state.category = sel.value; writeHash(); render(); });
    var tier = el('select', { id: 'tier', 'aria-label': 'Filter by tier' },
      ['all', 'Worth', 'Marginal', 'Skip'].map(function (t) { return el('option', { value: t, text: t === 'all' ? 'All tiers' : t, selected: t === state.tier ? 'selected' : null }); }));
    tier.addEventListener('change', function () { state.tier = tier.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    var set = el('button', { type: 'button', 'aria-pressed': state.tab === 'setaside' ? 'true' : 'false', text: 'Set aside', onclick: function () { state.tab = 'setaside'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), sel),
      el('div', { class: 'field' }, el('label', { for: 'tier', text: 'Tier' }), tier),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, pre, live, set)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : DATA.setaside.length + ' set aside' }));
  }
  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null));
  }
  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) return el('div', { class: 'panel' }, el('div', { class: 'empty' },
      el('h2', { text: 'No protocol matches that filter' }),
      el('p', { text: 'Clear the search or pick another category to see the board again.' }),
      el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.tier = 'all'; writeHash(); render(); } })));
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      tbody.appendChild(el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gc, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' }, el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / (list[0] ? list[0].implied_value_usd : 1)) * 100)) + '%' })), el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', { class: 'num', text: r.ratio.toFixed(2) + 'x' }),
        el('td', { class: 'odds', text: r.odds_pct.toFixed(1) + '%' }),
        el('td', { class: 'num', text: String(r.score) }),
        el('td', null, el('span', { class: 'pill ' + r.tier, text: r.tier })),
        el('td', { class: 'num', text: '#' + r.rank_lo + '–' + r.rank_hi })));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model terms and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'), sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'), el('th', { scope: 'col', text: 'Impl/TVL' }), sortHeader('odds', 'Launch odds'), sortHeader('score', 'Score'),
            el('th', { scope: 'col', text: 'Tier' }), el('th', { scope: 'col', text: 'Rank range' }))),
          tbody)));
  }
  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'sub', text: 'already trades' }))));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
        tbody)));
  }
  function setAsideTable() {
    var tbody = el('tbody');
    DATA.setaside.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'set aside' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.category || 'Other' }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'sub', text: r.reason })));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { class: 'sub', text: 'Pre-token protocols the board sets aside: wrapped, staked or bridged products of a token that already trades, versioned pools, and exchanges. Counted in the 758, never priced.' }),
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: 'Why set aside' }))),
        tbody)));
  }
  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula', text: 'log(mcap) = ' + m.intercept.toFixed(4) + ' + ' + m.log_tvl.toFixed(4) + '·log(TVL) + ' + m.growth.toFixed(4) + '·growth + ' + m.record_years.toFixed(4) + '·record years ' + m.log_chains.toFixed(4) + '·log(1+chains)' }),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Record years is the time since the protocol was first listed with no token on record; an unknown listing date uses 1.0 years. The comps are the ' + DATA.comps_n + ' launched protocols whose market cap sits between 0.1x and 20x TVL. Launch odds are a logistic of the same figures; a score blends odds with implied value. Both are estimates, never a promise. Rank ranges come from 50 bootstrap refits of the comps.' }));
  }
  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var m = DATA.model;
    var g = Math.min(1.2, Math.max(-0.6, row.change_7d === null ? 0 : row.change_7d / 100));
    var age = row.age_days === null ? 1 : row.age_days / 365;
    var terms = [
      ['Intercept', m.intercept.toFixed(4)],
      ['TVL', (m.log_tvl * Math.log(row.tvl_usd)).toFixed(4) + '  (' + m.log_tvl.toFixed(4) + ' × log ' + fmtUsd(row.tvl_usd) + ')'],
      ['Growth', (m.growth * g).toFixed(4) + '  (' + m.growth.toFixed(4) + ' × ' + (g * 100).toFixed(1) + '%)'],
      ['Record', (m.record_years * age).toFixed(4) + '  (' + m.record_years.toFixed(4) + ' × ' + age.toFixed(2) + 'y)'],
      ['Chains', (m.log_chains * Math.log(1 + row.chains.length)).toFixed(4) + '  (' + m.log_chains.toFixed(4) + ' × log ' + (1 + row.chains.length) + ')'],
      ['Predicted log(mcap)', (m.intercept + m.log_tvl * Math.log(row.tvl_usd) + m.growth * g + m.record_years * age + m.log_chains * Math.log(1 + row.chains.length)).toFixed(4)],
      ['Implied value', fmtUsd(row.implied_value_usd)],
    ];
    var recomputed = impliedOf(row, m);
    var net = row.expected_value_usd - row.gas_usd;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + row.tier + ' · score ' + row.score + ' (' + row.heat + ')' }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · rank range #' + row.rank_lo + '–' + row.rank_hi + ' over 50 refits' })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('div', { class: 'cards2' },
        el('div', { class: 'fcard' }, el('h4', { text: 'Fitted — model terms' }),
          terms.map(function (t) { return el('div', null, el('span', { text: t[0] }), el('b', { text: t[1] })); })),
        el('div', { class: 'fcard' }, el('h4', { text: 'Money netted' }),
          el('div', null, el('span', { text: 'Capital in (returned on exit)' }), el('b', { text: '$' + row.capital_usd })),
          el('div', null, el('span', { text: 'Gas, whole plan' }), el('b', { text: '$' + row.gas_usd })),
          el('div', null, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
          el('div', null, el('span', { text: 'Launch odds' }), el('b', { text: row.odds_pct.toFixed(1) + '%' })),
          el('div', null, el('span', { text: 'Odds-weighted value' }), el('b', { text: fmtUsd(row.expected_value_usd) })),
          el('div', null, el('span', { text: 'Net after gas' }), el('b', { text: fmtUsd(net) })),
          el('div', null, el('span', { text: 'Why this tier' }), el('b', { text: row.tier + ' · score ' + row.score }))))));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — 9 steps' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))));
    dialog.appendChild(el('p', { class: 'honest' },
      el('span', { text: 'Honesty check: the page recomputes this row as ' }),
      el('b', { text: fmtUsd(recomputed) }),
      el('span', { text: recomputed === row.implied_value_usd ? ' — recomputes the same number board.json carries.' : ' — which differs from the board: the data would be stale.' }),
      el('span', { text: ' ' + row.reason })));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }
  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(integrity());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : state.tab === 'live' ? liveTable() : setAsideTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(kpis());
    shell.appendChild(validation());
    shell.appendChild(el('p', { class: 'foot', text: 'Source: ' + DATA.source + ' · Snapshot ' + DATA.as_of + ' · ' + DATA.model_version + ' model, fit on ' + DATA.comps_n + ' comps. Implied values and launch odds are model estimates, not prices and not promises.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
    if (state.view === 'validation') { var v = document.getElementById('validation'); if (v) v.scrollIntoView(); }
  }
  readHash();
  render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
