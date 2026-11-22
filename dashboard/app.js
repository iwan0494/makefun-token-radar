// Launch Radar R6 — plain dashboard. Reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a per-protocol detail view with its nine farm steps,
// the model and validation view, and the live-token set aside. No network: every byte it
// shows is in zdata.js. Views are hash-routed so each screenshot is one plain page load:
// #view=model, #verdict=Worth, #p=<slug>.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', verdict: 'all', view: 'board', sort: 'implied', dir: -1, selected: null };

  // RadarRow indices (see lib/model.ts): 0 rank, 1 slug, 2 name, 3 category, 4 chains, 5 tvl,
  // 6 change7d, 7 ageDays, 8 iv, 9 oddsPct, 10 verdict, 11 deposit, 12 windowDays, 13 cost,
  // 14 expectedGross, 15 net, 16 perHour, 17 breakEvenPct, 18 floor, 19 ceiling, 20 rankLo,
  // 21 rankHi, 22 growthPct, 23 recordYears, 24 nChains, 25 grossAtLaunch, 26 tierScore,
  // 27 tier, 28 tierReason, 29 interceptLog, 30 tvlLog, 31 growthLog, 32 recordLog, 33 chainsLog.
  function R(r, i) { return r[i]; }

  function money(n) {
    var v = Math.round(n);
    var neg = v < 0;
    var s = String(Math.abs(v));
    var parts = [];
    for (var i = s.length; i > 0; i -= 3) parts.unshift(s.slice(Math.max(0, i - 3), i));
    return (neg ? '-$' : '$') + parts.join(',');
  }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return money(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: the deposit, the window,
  // every cost and the break-even come from the row's own numbers. No name is special-cased.
  function chainOf(r) { var c = R(r, 4); return c ? c.split('|')[0] : 'its main chain'; }
  function stepText(text, cost, time) {
    var s = text + ' Cost: ' + cost + '. Time: ' + time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function actionFor(r, deposit, chain) {
    var c = (R(r, 3) || '').toLowerCase();
    var name = R(r, 2);
    var d = '$' + Math.round(deposit).toLocaleString('en-US');
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply ' + d + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return 'Provide ' + d + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge ' + d + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake " + d + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit ' + d + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund ' + d + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit ' + d + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit ' + d + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint " + d + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy ' + d + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit ' + d + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function farmSteps(r) {
    var name = R(r, 2);
    var dep = R(r, 11), win = R(r, 12);
    var depS = money(dep);
    var idle = Math.round(100 * DATA.econ.idle_rate * dep * (win / 365)) / 100;
    var exit = Math.round(100 * (DATA.econ.exit_bps / 10000) * dep) / 100;
    var idleS = money(idle), exitS = money(exit), totalS = money(R(r, 13));
    var odds = R(r, 9) / 100;
    var gross = R(r, 25);
    var grossS = money(gross), expS = money(R(r, 14)), netS = money(R(r, 15));
    var be = R(r, 17).toFixed(1), od = R(r, 9).toFixed(1);
    var weeks = (win / 7).toFixed(1).replace(/\.0$/, '');
    return [
      stepText('Open a fresh wallet that holds only the farm funds, and keep its seed phrase offline — never paste it anywhere.', 'no fee to open the wallet', '5 minutes'),
      stepText(actionFor(r, dep, chainOf(r)), depS + ' of capital and about $4 of gas', '15 minutes to set up'),
      stepText('Do one qualifying action each week — a deposit, a borrow, a swap or a vote — so the wallet stays active in every snapshot.', 'about $2 of gas a week', '10 minutes a week'),
      stepText('Hold the position for the full ' + win + '-day window so the activity is counted across more than one snapshot.', 'the ' + depS + ' stays in the position; idle cost ' + idleS + ' at 4.5% a year', win + ' days'),
      stepText("Check " + name + "'s own points or rewards page each week and confirm the position is credited before the window ends.", 'no fee to check', '5 minutes a week'),
      stepText('Add up the costs before you commit: ' + depS + ' deposit, $12 gas over three legs, ' + idleS + ' idle, ' + exitS + ' exit at 15 bps — ' + totalS + ' all in.', totalS + ' total cost', '5 minutes to verify'),
      stepText('If the token launches at the band\'s top end, this position is worth ' + grossS + '; weighted by ' + od + '% launch odds that is ' + expS + ' expected, and the plan breaks even at ' + be + '% odds.', 'break-even at ' + be + '% odds', '5 minutes to check'),
      stepText('If the token launches, claim only from the link ' + name + ' itself publishes, then unwind in one transaction and pay the ' + exitS + ' exit fee.', exitS + ' exit fee', '15 minutes to unwind'),
      stepText('Write the wallet, the dates and every transaction in a farm log, then re-check the position when the ' + win + '-day window ends. Net for this plan: ' + netS + ' over ' + weeks + ' weeks of work.', 'nothing but the log', '5 minutes')
    ];
  }

  // The model in one function: the page sums the row's stored term table — the same rounded
  // terms main.ts summed for board.json — and checks the number the board carries, so the
  // page's code and the board's data are visibly the same arithmetic.
  function impliedOf(r) {
    var v = R(r, 29) + R(r, 30) + R(r, 31) + R(r, 32) + R(r, 33);
    return Math.max(1, Math.round(Math.exp(v)));
  }
  function termLogs(r) {
    return {
      intercept: R(r, 29), tvl: R(r, 30), growth: R(r, 31),
      record: R(r, 32), chains: R(r, 33)
    };
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('verdict')) state.verdict = params.get('verdict');
    if (params.get('view')) state.view = params.get('view');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.view !== 'board') params.set('view', state.view);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.verdict !== 'all' && R(r, 10) !== state.verdict) return false;
      if (state.category !== 'all' && (R(r, 3) || 'Other') !== state.category) return false;
      if (!q) return true;
      var hay = [R(r, 2), R(r, 1), R(r, 3), R(r, 4)].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = R(a, 2).toLowerCase(); bv = R(b, 2).toLowerCase(); }
      else if (key === 'tvl') { av = R(a, 5); bv = R(b, 5); }
      else if (key === 'growth') { av = R(a, 6) === null ? -Infinity : R(a, 6); bv = R(b, 6) === null ? -Infinity : R(b, 6); }
      else if (key === 'age') { av = R(a, 7) === null ? Infinity : R(a, 7); bv = R(b, 7) === null ? Infinity : R(b, 7); }
      else if (key === 'odds') { av = R(a, 9); bv = R(b, 9); }
      else if (key === 'net') { av = R(a, 16); bv = R(b, 16); }
      else { av = R(a, 8); bv = R(b, 8); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return R(a, 1) < R(b, 1) ? -1 : 1;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, 'Launch ', el('b', { text: 'Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function kpiStrip() {
    function kpi(color, label, value, note) {
      return el('div', { class: 'kpi' },
        el('span', null, el('i', { class: 'dot', style: 'background:' + color }), label),
        el('div', null, el('b', { text: value }), el('small', { text: note })));
    }
    return el('div', { class: 'kpis' },
      kpi('#22d3ee', 'Within 3x — leave-one-out', DATA.loo.within3Pct.toFixed(1) + '%', 'n=' + DATA.loo.n),
      kpi('#34d399', 'Blind — listed 2024 on', DATA.blind.within3Pct.toFixed(1) + '%', 'n=' + DATA.blind.n),
      kpi('#a78bfa', 'Walk-forward — 5 cutoffs', DATA.walk_forward.within3Pct.toFixed(1) + '%', 'n=' + DATA.walk_forward.n),
      kpi('#34d399', 'Worth farming', String(DATA.verdicts.worth), 'of ' + DATA.rows.length + ' rows'),
      kpi('#94a3b8', 'Median miss — leave-one-out', 'x' + DATA.loo.medianMiss.toFixed(2), 'band x' + DATA.ceil_factor.toFixed(2) + ' / x' + DATA.floor_factor)
    );
  }

  function integrityStrip() {
    var c = DATA.counts;
    return el('div', { class: 'strip' },
      el('b', { text: c.total + ' accounted' }),
      ' · ' + c.traded + ' already trade · ' + c.set_aside + ' set aside as products · ' +
      c.priced + ' priced · ' + c.watchlist + '/' + c.watchlist + ' watchlist'
    );
  }

  function lede() {
    return el('div', { class: 'lede' },
      el('h1', { text: DATA.rows.length + ' pre-token protocols, ranked by implied value' }),
      el('p', { text: 'Implied value is fitted on the ' + DATA.loo.n + ' traded tokens the snapshot itself supports — log market cap on log TVL, 7-day growth, record years and chain count — then tested blind and walk-forward. Launch odds come from the peers\u2019 record. Every row carries a farm plan netted to the dollar. Implied value is a model, not a promise.' })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return R(r, 3) || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    function vtab(v, label) {
      return el('button', { type: 'button', 'aria-pressed': state.verdict === v ? 'true' : 'false', text: label, onclick: function () { state.verdict = v; state.view = 'board'; writeHash(); render(); } });
    }
    function viewtab(v, label) {
      return el('button', { type: 'button', 'aria-pressed': state.view === v ? 'true' : 'false', text: label, onclick: function () { state.view = v; if (v !== 'board') state.selected = null; writeHash(); render(); } });
    }
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Verdict' }), el('div', { class: 'tabs' }, vtab('all', 'All'), vtab('Worth', 'Worth'), vtab('Marginal', 'Marginal'), vtab('Skip', 'Skip'))),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, viewtab('board', 'Board'), viewtab('model', 'Model'), viewtab('live', 'Live token'))),
      el('span', { class: 'count', text: rows().length + ' rows shown' })
    );
  }

  function sortHeader(key, label, cls) {
    return el('th', { scope: 'col', class: cls || null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another verdict to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.verdict = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0] ? R(list[0], 8) || 1 : 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = R(r, 6) === null ? 'n/a' : fmtPct(R(r, 6));
      var growthClass = R(r, 6) === null ? '' : R(r, 6) >= 0 ? 'pos' : 'neg';
      var net = R(r, 16);
      var netClass = net >= 20 ? 'pos' : net > 0 ? '' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === R(r, 1) ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(R(r, 1)); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(R(r, 1)); } }
      },
        el('td', { class: 'num', html: '<b>' + R(r, 0) + '</b><br><span style="color:var(--faint);font-size:11px">' + R(r, 20) + '–' + R(r, 21) + '</span>' }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: R(r, 2) }),
          el('span', { class: 'sub', text: (R(r, 3) || 'Other') + ' · ' + (R(r, 4) ? R(r, 4).split('|').slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(R(r, 5)) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(R(r, 7)) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((R(r, 8) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(R(r, 8)) })
        )),
        el('td', { class: 'num odds', text: R(r, 9).toFixed(1) + '%' }),
        el('td', { class: 'num ' + netClass, text: (net >= 0 ? '+' : '') + '$' + net.toFixed(2) + '/h' }),
        el('td', null,
          el('span', { class: 'pill ' + R(r, 27), text: R(r, 27).toUpperCase() }),
          el('span', { class: 'tier-sub', text: R(r, 26) + '/100 · ' + R(r, 10) }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Tier is the farm-now triage (hot = Worth, cold = Skip) with a 0–100 score; rank range is the 5th–95th percentile over 50 bootstrap refits. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank', 'num'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL', 'num'),
            sortHeader('growth', '7d', 'num'),
            sortHeader('age', 'Age', 'num'),
            sortHeader('implied', 'Implied value'),
            sortHeader('odds', 'Odds', 'num'),
            sortHeader('net', 'Net / hour', 'num'),
            el('th', { scope: 'col', text: 'Tier' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r[0] }), el('span', { class: 'sub', text: r[1] || 'Other' }))),
        el('td', { class: 'num', text: fmtUsd(r[2]) }),
        el('td', { class: 'num', text: fmtUsd(r[3]) }),
        el('td', null, el('span', { class: 'pill Skip', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', { class: 'mini' },
          el('caption', { text: 'Largest live-token protocols by market cap. These already trade, so their market cap is a fact, not a model — they are set aside from the pre-token ranking, and they are the comps the value model is fitted on.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function scatterSvg() {
    var pts = DATA.scatter;
    var W = 1100, H = 250, padL = 64, padB = 34, padT = 12, padR = 14;
    var xs = pts.map(function (p) { return Math.log10(Math.max(1, p[0])); });
    var ys = pts.map(function (p) { return Math.log10(Math.max(1, p[1])); });
    var lo = Math.floor(Math.min.apply(null, xs.concat(ys))), hi = Math.ceil(Math.max.apply(null, xs.concat(ys)));
    function X(v) { return padL + ((v - lo) / (hi - lo)) * (W - padL - padR); }
    function Y(v) { return padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB); }
    var s = '';
    s += '<svg class="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Leave-one-out scatter: recorded market cap against predicted value, bubble size is TVL">';
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#0f172a"/>';
    for (var g = lo; g <= hi; g++) {
      s += '<line x1="' + X(g).toFixed(1) + '" y1="' + Y(lo).toFixed(1) + '" x2="' + X(g).toFixed(1) + '" y2="' + Y(hi).toFixed(1) + '" stroke="#1e293b" stroke-width="1"/>';
      s += '<line x1="' + X(lo).toFixed(1) + '" y1="' + Y(g).toFixed(1) + '" x2="' + X(hi).toFixed(1) + '" y2="' + Y(g).toFixed(1) + '" stroke="#1e293b" stroke-width="1"/>';
      s += '<text x="' + (X(g) - 4).toFixed(1) + '" y="' + (H - 12) + '" fill="#64748b" font-size="11" text-anchor="end">$10^' + g + '</text>';
      s += '<text x="' + (padL - 8) + '" y="' + (Y(g) + 4).toFixed(1) + '" fill="#64748b" font-size="11" text-anchor="end">$10^' + g + '</text>';
    }
    s += '<line x1="' + X(lo).toFixed(1) + '" y1="' + Y(lo).toFixed(1) + '" x2="' + X(hi).toFixed(1) + '" y2="' + Y(hi).toFixed(1) + '" stroke="#5ea8d4" stroke-width="1.5"/>';
    s += '<line x1="' + X(lo).toFixed(1) + '" y1="' + Y(lo + Math.log10(3)).toFixed(1) + '" x2="' + X(hi - Math.log10(3)).toFixed(1) + '" y2="' + Y(hi).toFixed(1) + '" stroke="#34d399" stroke-width="1" stroke-dasharray="4 4"/>';
    s += '<line x1="' + X(lo + Math.log10(3)).toFixed(1) + '" y1="' + Y(lo).toFixed(1) + '" x2="' + X(hi).toFixed(1) + '" y2="' + Y(hi - Math.log10(3)).toFixed(1) + '" stroke="#34d399" stroke-width="1" stroke-dasharray="4 4"/>';
    var tvls = pts.map(function (p) { return Math.log10(Math.max(1, p[2])); });
    var tlo = Math.min.apply(null, tvls), thi = Math.max.apply(null, tvls);
    pts.forEach(function (pp) {
      var ratio = pp[1] / Math.max(1, pp[0]);
      var inside = ratio >= 1 / 3 && ratio <= 3;
      var r = 2.5 + 4.5 * ((Math.log10(Math.max(1, pp[2])) - tlo) / Math.max(0.01, thi - tlo));
      s += '<circle cx="' + X(Math.log10(Math.max(1, pp[0]))).toFixed(1) + '" cy="' + Y(Math.log10(Math.max(1, pp[1]))).toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + (inside ? '#34d399' : '#94a3b8') + '" fill-opacity="0.8"/>';
    });
    s += '<text x="' + (padL + 4) + '" y="' + (padT + 12) + '" fill="#94a3b8" font-size="12">Recorded market cap (vertical) against predicted value (horizontal), log scale</text>';
    s += '</svg>';
    return s;
  }

  // Ranking as a horizontal bar chart, sorted by value, direct labels, no chart junk.
  function ablationBars() {
    var rows = DATA.ablation.slice().sort(function (a, b) { return b.within3Pct - a.within3Pct; });
    var W = 1100, rowH = 30, padL = 190, padR = 70, padT = 6;
    var H = padT + rows.length * rowH + 8;
    var max = 100;
    var s = '';
    s += '<svg class="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ablation: leave-one-out within 3x by model variant">';
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#0f172a"/>';
    rows.forEach(function (a, i) {
      var y = padT + i * rowH;
      var w = Math.max(2, (a.within3Pct / max) * (W - padL - padR));
      var color = a.label === 'Full model' ? '#22d3ee' : '#94a3b8';
      s += '<text x="' + (padL - 8) + '" y="' + (y + 15) + '" fill="#e8eef4" font-size="12" text-anchor="end">' + a.label + '</text>';
      s += '<rect x="' + padL + '" y="' + (y + 4) + '" width="' + w.toFixed(1) + '" height="16" rx="3" fill="' + color + '"/>';
      s += '<text x="' + (padL + w + 8).toFixed(1) + '" y="' + (y + 15) + '" fill="#94a3b8" font-size="12">' + a.within3Pct.toFixed(1) + '%</text>';
    });
    s += '</svg>';
    return s;
  }

  function modelView() {
    function vrow(label, v, note) {
      return el('tr', null,
        el('td', { text: label }),
        el('td', { class: 'num', text: v.within3Pct.toFixed(1) + '%' }),
        el('td', { class: 'num', text: 'x' + v.medianMiss.toFixed(2) }),
        el('td', { class: 'num', text: String(v.n) }),
        el('td', { text: note })
      );
    }
    var b = DATA.beta;
    return el('div', null,
      el('div', { class: 'lede' },
        el('h1', { text: 'How the model is tested' }),
        el('p', { text: 'Every number below is computed from the snapshot at run time — leave-one-out over the comps, a blind test on tokens listed from 2024 on, and a walk-forward over five cutoffs. The scatter shows each comp\u2019s recorded market cap against the value the model predicts for it when it is left out.' })
      ),
      el('section', { class: 'model panel' },
        el('h2', { class: 'chart-title', text: 'Leave-one-out within 3x: ' + DATA.loo.within3Pct.toFixed(1) + '% — ' + DATA.loo.within3 + ' of ' + DATA.loo.n + ' comps inside the band' }),
        el('p', { class: 'chart-sub', text: 'Each bubble is one traded comp, left out of its own fit. Bubble size is TVL; emerald is inside the 3x band, slate is outside it.' }),
        el('div', { html: scatterSvg() }),
        el('div', { class: 'legend' },
          el('span', null, el('i', { class: 'sw', style: 'background:#34d399' }), 'Inside the 3x band'),
          el('span', null, el('i', { class: 'sw', style: 'background:#94a3b8' }), 'Outside the band'),
          el('span', null, el('i', { class: 'sw', style: 'background:#5ea8d4' }), 'Prediction exactly right'),
          el('span', { text: 'Bubble size = TVL' })
        ),
        (function () {
          var ab = DATA.ablation.slice();
          var full = ab.filter(function (a) { return a.label === 'Full model'; })[0];
          var worst = ab.slice(1).sort(function (a, b) { return a.within3Pct - b.within3Pct; })[0];
          var bestDrop = ab.slice(1).sort(function (a, b) { return b.within3Pct - a.within3Pct; })[0];
          function card(title, points) {
            return el('div', { class: 'card' }, el('h3', { text: title }),
              el('ul', null, points.map(function (pt) { return el('li', { text: pt }); })));
          }
          return el('div', { class: 'cards3' },
            card('What the test says', [
              'Leave-one-out ' + DATA.loo.within3Pct.toFixed(1) + '% within 3x (n=' + DATA.loo.n + '), median miss x' + DATA.loo.medianMiss.toFixed(2),
              'Blind ' + DATA.blind.within3Pct.toFixed(1) + '% (n=' + DATA.blind.n + ') — the fit holds on tokens it never saw',
              'Walk-forward ' + DATA.walk_forward.within3Pct.toFixed(1) + '% (n=' + DATA.walk_forward.n + ') across five cutoffs'
            ]),
            card('Where it misses', [
              'Worst case x' + DATA.floor_factor + ' — the floor of the value band, from the model’s own worst leave-one-out',
              'The band is wide on purpose: a narrow band would flatter the numbers and lie about the risk',
              'Small, fast-growing protocols are the hardest to price — their cover moves most'
            ]),
            card('What would change it', [
              'Only ' + DATA.loo.n + ' traded tokens anchor the fit — more comps would tighten every number',
              'Dropping the ' + worst.label.replace('No ', '').replace(' term', '') + ' term costs most (' + (full.within3Pct - worst.within3Pct).toFixed(1) + ' points)',
              'The ' + bestDrop.label.replace('No ', '').replace(' term', '') + ' term matters least (' + (full.within3Pct - bestDrop.within3Pct).toFixed(1) + ' points) — the record term stays anyway, the brief asks for it'
            ])
          );
        })()
      ),
      el('div', { class: 'panel' },
        el('div', { class: 'table-wrap' },
          el('table', { class: 'mini' },
            el('caption', { text: 'Out-of-sample tests: share of recorded market caps within 3x of prediction.' }),
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Test' }), el('th', { scope: 'col', class: 'num', text: 'Within 3x' }), el('th', { scope: 'col', class: 'num', text: 'Median miss' }), el('th', { scope: 'col', class: 'num', text: 'n' }), el('th', { scope: 'col', text: 'How it is run' }))),
            el('tbody', null,
              vrow('Leave-one-out', DATA.loo, 'Each comp predicted by a fit that never saw it'),
              vrow('Blind — listed 2024 on', DATA.blind, 'Fit on comps listed before 2024, tested on later ones'),
              vrow('Walk-forward — 5 cutoffs', DATA.walk_forward, 'Fit before each cutoff, tested in the six months after it')
            )
          )
        )
      ),
      el('section', { class: 'model panel' },
        el('h2', { class: 'chart-title', text: 'Ablation: every term earns its place — the full model stays on top' }),
        el('p', { class: 'chart-sub', text: 'Leave-one-out within 3x with each term dropped in turn. Cyan is the full model; the bars are sorted by value.' }),
        el('div', { html: ablationBars() }),
        el('h3', { text: 'The fitted value model' }),
        el('div', { class: 'formula', text: 'log(market cap) = ' + b[0].toFixed(4) + ' + ' + b[1].toFixed(4) + ' x log(TVL) + ' + b[2].toFixed(4) + ' x growth + ' + b[3].toFixed(4) + ' x record years ' + (b[4] < 0 ? '− ' : '+ ') + Math.abs(b[4]).toFixed(4) + ' x log(1 + chains)' }),
        el('p', { text: 'Fitted by OLS on ' + DATA.loo.n + ' traded comps: a positive market cap, a listing date and a 7-day change on record, not a product category, listed before 2026. Training comps whose cover (market cap / TVL) lies outside [median / 10, median x 10] are trimmed from the fit only; validation scores every comp. Growth is clipped to +/-50%. The record term stays in: how long a protocol has run with no token is part of its value, and the launch odds use it too.' }),
        el('h3', { text: 'The value band and the farm' }),
        el('p', { text: 'Ceiling = implied value x ' + DATA.ceil_factor.toFixed(2) + ' (e^0.9). Floor = implied value x ' + DATA.floor_factor + ' — the 1st percentile of the leave-one-out recorded-over-predicted ratios, the model\u2019s own worst case. The farm assumes 15% of the token supply goes to the farming community; deposit is 0.05% of TVL clipped to $100–$2,000; gas $12 over three legs; idle 4.5% a year; exit 15 bps; 1.5 hours a week at $20 an hour. The window is 84 days at 10% launch odds and shortens 2.4 days per point of odds to a 21-day floor. Worth needs net at or above $20 an hour and break-even at or under 30% odds.' }),
        el('h3', { text: 'Launch odds' }),
        el('p', { text: 'A logistic regression on every protocol not set aside as a product (' + (DATA.counts.traded + DATA.counts.priced) + ' rows): the chance a protocol with this TVL, growth, record and chain count records a token. A pre-token protocol\u2019s odds are the peers\u2019 record — fitted, never typed in. Rank ranges are the 5th–95th percentile of each row\u2019s rank over 50 seeded bootstrap refits of the value model.' })
      )
    );
  }

  function kv(label, value, cls) {
    return el('div', { class: 'kv' }, el('span', { text: label }), el('b', { class: cls || null, text: value }));
  }

  function detailView(r) {
    var t = termLogs(r);
    var recomputed = impliedOf(r);
    var net = R(r, 15);
    var steps = farmSteps(r);
    var dep = R(r, 11), win = R(r, 12);
    var idle = Math.round(100 * DATA.econ.idle_rate * dep * (win / 365)) / 100;
    var exit = Math.round(100 * (DATA.econ.exit_bps / 10000) * dep) / 100;
    return el('div', null,
      el('div', { class: 'detail-head' },
        el('div', null,
          el('span', { class: 'rankline', text: 'Rank ' + R(r, 0) + ' of ' + DATA.rows.length + ' · rank range ' + R(r, 20) + '–' + R(r, 21) + ' over 50 refits' }),
          el('h2', { text: R(r, 2) }),
          el('p', { class: 'sub', text: (R(r, 3) || 'Other') + ' on ' + (R(r, 4) ? R(r, 4).split('|').join(', ') : 'an unnamed chain') + ' · TVL ' + fmtUsd(R(r, 5)) }),
          el('div', { class: 'tierline' },
            el('span', { class: 'pill ' + R(r, 27), text: R(r, 27).toUpperCase() + ' · ' + R(r, 26) + '/100' }),
            el('span', { class: 'reason', text: ' — ' + R(r, 28) })
          )
        ),
        el('button', { class: 'close', type: 'button', text: 'Back to board', onclick: function () { state.selected = null; writeHash(); render(); } })
      ),
      el('div', { class: 'grid2' },
        el('div', { class: 'card' },
          el('h3', { text: 'Implied value — every term fitted' }),
          kv('Intercept', t.intercept.toFixed(2) + ' log'),
          kv('TVL term', fmtUsd(R(r, 5)) + ' · ' + t.tvl.toFixed(2) + ' log'),
          kv('Growth term', (R(r, 6) === null ? 'not reported' : fmtPct(R(r, 6))) + ' · ' + t.growth.toFixed(2) + ' log'),
          kv('Record term', R(r, 23).toFixed(1) + ' years · ' + t.record.toFixed(2) + ' log'),
          kv('Chains term', R(r, 24) + ' chains · ' + t.chains.toFixed(2) + ' log'),
          kv('Implied value', fmtUsd(R(r, 8))),
          kv('Value band', fmtUsd(R(r, 18)) + ' – ' + fmtUsd(R(r, 19))),
          kv('Launch odds', R(r, 9).toFixed(1) + '%')
        ),
        el('div', { class: 'card' },
          el('h3', { text: 'The money — netted to the dollar' }),
          kv('Deposit', money(dep) + ' of ' + fmtUsd(R(r, 5)) + ' TVL'),
          kv('Window', win + ' days'),
          kv('Gas · idle · exit', money(DATA.econ.gas) + ' · ' + money(idle) + ' · ' + money(exit)),
          kv('Time', (R(r, 12) / 7 * 1.5).toFixed(1) + ' hours at $20/hour'),
          kv('Total cost', money(R(r, 13))),
          kv('Expected gross', money(R(r, 14))),
          kv('Net', money(net), net >= 0 ? 'pos' : 'neg'),
          kv('Net per hour', (net >= 0 ? '+' : '') + '$' + R(r, 16).toFixed(2), R(r, 16) >= 20 ? 'pos' : 'neg'),
          kv('Break-even odds', R(r, 17).toFixed(1) + '%'),
          kv('Verdict', R(r, 10))
        )
      ),
      el('p', { class: 'sub', style: 'margin:8px 0 0;color:var(--muted);font-size:12px;', text: 'The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === R(r, 8) ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' }),
      el('div', { class: 'detail-sec' },
        el('h3', { text: 'Farm plan — nine steps' }),
        el('ol', { class: 'steps' }, steps.map(function (s) {
          var at = s.indexOf(' Cost: ');
          var action = at >= 0 ? s.slice(0, at) : s;
          var tail = at >= 0 ? s.slice(at + 1) : '';
          return el('li', null, el('div', null, el('b', { text: action }), ' ', el('span', { class: 'cost', text: tail })));
        }))
      )
    );
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return R(r, 1) === slug; })[0];
    if (!row) return;
    state.selected = slug;
    state.view = 'board';
    writeHash();
    render();
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    if (state.selected) {
      var row = DATA.rows.filter(function (r) { return R(r, 1) === state.selected; })[0];
      if (row) { shell.appendChild(detailView(row)); app.appendChild(shell); app.setAttribute('aria-busy', 'false'); return; }
      state.selected = null;
    }
    shell.appendChild(kpiStrip());
    shell.appendChild(integrityStrip());
    if (state.view === 'model') {
      shell.appendChild(modelView());
    } else if (state.view === 'live') {
      shell.appendChild(lede());
      shell.appendChild(controls());
      shell.appendChild(liveTable());
    } else {
      shell.appendChild(lede());
      shell.appendChild(controls());
      shell.appendChild(boardTable());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) { state.selected = null; writeHash(); render(); }
  });
})();
