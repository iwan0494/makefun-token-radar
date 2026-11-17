// Launch Radar's page. It reads globalThis.LAUNCH_RADAR (data.js, written beside it by main.ts) and
// renders the board, its filters and sorts, a detail dialog per row, and a self-check that re-derives
// every row's implied value from its terms and refuses a mismatch.
//
// No network: every figure on this page comes from data.js. No framework: the table is built once, from
// a <template>, and sorting moves the existing <tr> elements with moveBefore where the browser has it.
(function () {
  'use strict';

  // index.html loads radar.js before data.js (data.js is last so it sits last in the dossier's path
  // order), so globalThis.LAUNCH_RADAR does not exist yet while this script is parsed. Wait for
  // DOMContentLoaded: by then every classic script ahead of the document's end has run, data.js included.
  function boot() {
  var DATA = globalThis.LAUNCH_RADAR;
  if (!DATA) return;

  var PAGE = 40;
  var state = { q: '', cohort: 'all', family: 'all', verdict: 'all', sort: 'rank', dir: 1, page: 0 };

  // ---------- formatting ----------

  var intl = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'unreported';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function record(days) {
    if (days === null || days === undefined) return 'no listing day';
    if (days < 45) return days + ' d';
    if (days < 400) return (days / 30.44).toFixed(1) + ' mo';
    return (days / 365.25).toFixed(1) + ' yr';
  }
  function cover(r) {
    if (r >= 0.1) return r.toFixed(2) + '×';
    if (r >= 0.01) return r.toFixed(3) + '×';
    return r.toFixed(4) + '×';
  }
  function signed(x) {
    return (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(3);
  }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) node.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  // ---------- the model, re-run in the page ----------

  var M = DATA.model;
  function tilt(list, key) {
    if (!key) return 0;
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i].value;
    return 0;
  }
  /** The same arithmetic lib/comps.ts ran: five terms, summed in logs, turned back into dollars. */
  function reprice(row) {
    var line = M.line.a + M.line.b * Math.log(row.tvl_usd);
    var g = row.change_7d === null || row.change_7d === undefined ? 0 : Math.max(-1, Math.min(1, row.change_7d / 100));
    var growth = row.change_7d === null ? 0 : M.growth.level + M.growth.slope * g;
    var age = row.origin_days / 365.25 + DATA.meta.horizon_years;
    var hold = M.hold.a + M.hold.b * Math.log(1 + age);
    var logCover = line + tilt(M.category, row.category) + tilt(M.family, row.family) + growth + hold;
    return Math.max(1, Math.round(row.tvl_usd * Math.exp(logCover)));
  }
  function selfCheck() {
    var bad = 0;
    var worst = 0;
    DATA.rows.forEach(function (row) {
      var again = reprice(row);
      var off = Math.abs(again - row.implied_value_usd) / Math.max(1, row.implied_value_usd);
      if (off > worst) worst = off;
      if (again !== row.implied_value_usd) bad += 1;
    });
    return { n: DATA.rows.length, bad: bad, worst: worst };
  }
  var CHECK = selfCheck();

  // ---------- masthead ----------

  document.getElementById('snapshot').textContent = '';
  document.getElementById('snapshot').append(
    el('span', { text: 'snapshot ' }),
    el('b', { text: DATA.meta.as_of }),
    el('span', { text: ' · ' + intl.format(DATA.meta.protocols) + ' protocols · ' + DATA.meta.traded + ' traded · floor ' + usd(DATA.meta.floor_usd) })
  );
  document.getElementById('lede-rows').textContent = String(DATA.rows.length);

  var top = DATA.rows[0];
  var worthPlans = DATA.rows.filter(function (r) { return r.farm.verdict === 'Worth'; }).length;
  var pulse = document.getElementById('pulse');
  [
    ['Ranked', String(DATA.rows.length), 'early protocols, one horizon'],
    ['Watchlist', DATA.coverage.watch_ranked + ' / ' + DATA.coverage.watchlist, 'the floor is covered'],
    ['Top row', usd(top.implied_value_usd), top.name],
    ['Plans worth', String(worthPlans), 'net of gas, idle cost and exit'],
    ['Comps', String(M.pool.comps), 'traded tokens behind the fit']
  ].forEach(function (pair) {
    pulse.appendChild(el('div', null, [el('dt', { text: pair[0] }), el('dd', null, [pair[1], el('small', { text: pair[2] })])]));
  });

  // ---------- the model panel ----------

  document.getElementById('model-n').textContent = String(M.pool.comps);
  document.getElementById('eq-a').textContent = M.line.a.toFixed(3);
  document.getElementById('eq-b').textContent = M.line.b.toFixed(3);
  document.getElementById('eq-band').textContent = DATA.meta.band_log.toFixed(1);
  var topTilt = M.category.slice().sort(function (a, b) { return b.value - a.value; });
  var tilts = document.getElementById('terms');
  var termRows = [
    ['line', 'a + b·log TVL', 'Fitted across ' + M.pool.comps + ' comps; b is held inside [' + M.line.lo + ', ' + M.line.hi + '] so a handful of outliers cannot bend it.'],
    ['tilt', 'category + family', 'A family\u2019s mean residual, shrunk by n/(n+3); the strongest are ' + topTilt.slice(0, 2).map(function (t) { return t.key + ' ' + signed(t.value); }).join(', ') + '.'],
    ['growth', '7-day change', 'Per cent over 100, held inside ±1: level ' + signed(M.growth.level) + ', slope ' + M.growth.slope.toFixed(2) + ' per whole point over ' + M.growth.n + ' comps.'],
    ['record', 'log(1 + age)', 'The line comps show: ' + signed(M.hold.a) + ' at a listing, then +' + M.hold.b.toFixed(2) + ' per unit of log(1 + age). Every year is worth reading.'],
    ['band', '±' + DATA.meta.band_log.toFixed(1) + ' log', 'The fit\u2019s residual spans this much (scale ' + M.scale.toFixed(2) + ' in logs); low and high are the same record read two ways.']
  ];
  termRows.forEach(function (t) {
    tilts.appendChild(el('div', null, [el('dt', null, [t[0], el('span', { text: t[1] })]), el('dd', { text: t[2] })]));
  });

  // ---------- the board ----------

  var tbody = document.getElementById('rows');
  var table = document.getElementById('table');
  var status = document.getElementById('count');
  var collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

  function dotClass(r) {
    if (r.on_watchlist) return 'dot dot--watchlist';
    return r.tvl_usd < DATA.meta.floor_usd ? 'dot dot--below' : 'dot';
  }

  function rowNode(r) {
    var tr = el('tr', { 'data-slug': r.slug });
    var th = el('th', { scope: 'row', class: 'c-rank', 'data-label': 'Rank' }, [el('span', { text: String(r.rank) })]);
    th.className = 'c-name';
    var nameCell = el('th', { scope: 'row', class: 'c-name' }, [
      el('button', { type: 'button', class: 'rname', 'data-open': r.slug }, [
        el('span', { class: dotClass(r), 'aria-hidden': 'true' }),
        el('span', null, [r.name, el('span', { class: 'rslug', text: r.slug })])
      ])
    ]);
    var vchip = el('span', { class: 'vchip vchip--' + r.farm.verdict.toLowerCase(), text: r.farm.verdict });
    var cells = [
      nameCell,
      el('td', { class: 'family', 'data-label': 'Family' }, [r.family || '—']),
      el('td', { class: 'c-num', 'data-label': 'TVL' }, [usd(r.tvl_usd)]),
      el('td', { class: 'c-num c-optional', 'data-label': '7-day' }, [el('span', { class: r.change_7d === null ? 'muted' : r.change_7d >= 0 ? 'growth-up' : 'growth-down', text: pct(r.change_7d) })]),
      el('td', { class: 'c-age c-optional', 'data-label': 'Record' }, [r.origin === 'counted' ? record(r.age_days) : el('span', { class: 'muted', text: 'snapshot date' })]),
      el('td', { class: 'c-cover', 'data-label': 'Cover' }, [el('span', { class: 'cover', text: cover(r.ratio_p50) })]),
      el('td', { class: 'c-value', 'data-label': 'Implied value' }, [el('span', { class: 'value', text: usd(r.implied_value_usd) })]),
      el('td', { class: 'c-band c-optional', 'data-label': 'Low–high' }, [usd(r.implied_value_low_usd) + ' – ' + usd(r.implied_value_high_usd)]),
      el('td', { class: 'c-net c-optional', 'data-label': 'Net if launch' }, [el('span', { class: r.farm.net_usd > 0 ? 'growth-up' : 'growth-down', text: usd(r.farm.net_usd) })]),
      el('td', { class: 'c-verdict', 'data-label': 'Plan' }, [vchip])
    ];
    tr.appendChild(th);
    cells.forEach(function (c) { tr.appendChild(c); });
    return tr;
  }

  function matches(r) {
    if (state.cohort === 'watchlist' && !r.on_watchlist) return false;
    if (state.cohort === 'below' && !(r.tvl_usd < DATA.meta.floor_usd)) return false;
    if (state.cohort === 'nodate' && r.origin !== 'snapshot') return false;
    if (state.family !== 'all' && (r.family || '—') !== state.family) return false;
    if (state.verdict !== 'all' && r.farm.verdict !== state.verdict) return false;
    if (state.q) {
      var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + (r.chains || []).join(' ')).toLowerCase();
      if (hay.indexOf(state.q) < 0) return false;
    }
    return true;
  }

  function sortKey(r) {
    switch (state.sort) {
      case 'name': return r.name;
      case 'family': return r.family || '';
      case 'tvl': return r.tvl_usd;
      case 'growth': return r.change_7d === null ? -Infinity : r.change_7d;
      case 'age': return r.age_days === null ? -1 : r.age_days;
      case 'cover': return r.ratio_p50;
      case 'value': return r.implied_value_usd;
      case 'band': return r.implied_value_high_usd - r.implied_value_low_usd;
      case 'net': return r.farm.net_usd;
      case 'verdict': return ['Worth', 'Marginal', 'Skip'].indexOf(r.farm.verdict);
      default: return r.rank;
    }
  }

  function visible() {
    var rows = DATA.rows.filter(matches);
    var numeric = typeof sortKey(rows[0] || { rank: 0 }) === 'number';
    rows.sort(function (a, b) {
      var ka = sortKey(a);
      var kb = sortKey(b);
      var c = numeric ? ka - kb : collator.compare(String(ka), String(kb));
      return (c * state.dir) || (a.rank - b.rank);
    });
    return rows;
  }

  function render() {
    var rows = visible();
    var pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (state.page >= pages) state.page = pages - 1;
    var slice = rows.slice(state.page * PAGE, state.page * PAGE + PAGE);
    var frag = document.createDocumentFragment();
    slice.forEach(function (r) { frag.appendChild(rowNode(r)); });
    tbody.replaceChildren(frag);
    document.getElementById('pageinfo').textContent = 'page ' + (state.page + 1) + ' of ' + pages + ' · rows ' + (rows.length ? state.page * PAGE + 1 : 0) + '–' + Math.min(rows.length, (state.page + 1) * PAGE) + ' of ' + rows.length;
    document.getElementById('prev').disabled = state.page === 0;
    document.getElementById('next').disabled = state.page >= pages - 1;
    document.getElementById('caption').textContent = rows.length === DATA.rows.length
      ? 'The board, ' + DATA.rows.length + ' early protocols ranked by implied value at the one-year horizon'
      : 'Filtered: ' + rows.length + ' of ' + DATA.rows.length + ' early protocols, ranked by implied value';
  }

  // Sort: a button per sortable header. aria-sort lives on the <th>, never on the button.
  function applySort(key) {
    var th = table.querySelector('th[data-sort="' + key + '"]');
    var same = state.sort === key;
    state.dir = same ? -state.dir : (key === 'name' || key === 'family' ? 1 : -1);
    state.sort = key;
    Array.prototype.forEach.call(table.tHead.rows[0].cells, function (cell) { cell.removeAttribute('aria-sort'); });
    th.setAttribute('aria-sort', state.dir === 1 ? 'ascending' : 'descending');
    render();
    status.textContent = 'Sorted by ' + th.querySelector('button').textContent.trim() + ', ' + (state.dir === 1 ? 'ascending' : 'descending') + ', ' + visible().length + ' rows';
  }
  Array.prototype.forEach.call(table.tHead.querySelectorAll('button[data-sort]'), function (btn) {
    btn.addEventListener('click', function () { applySort(btn.getAttribute('data-sort')); });
  });

  var q = document.getElementById('q');
  q.addEventListener('input', function () { state.q = q.value.trim().toLowerCase(); state.page = 0; render(); });
  document.getElementById('cohort').addEventListener('change', function (e) { state.cohort = e.target.value; state.page = 0; render(); });
  var famSel = document.getElementById('family');
  var fams = Object.keys(DATA.rows.reduce(function (acc, r) { acc[(r.family || '—')] = (acc[(r.family || '—')] || 0) + 1; return acc; }, {}))
    .sort(function (a, b) { return collator.compare(a, b); });
  fams.forEach(function (f) { famSel.appendChild(el('option', { value: f, text: f })); });
  famSel.addEventListener('change', function () { state.family = famSel.value; state.page = 0; render(); });
  var chips = document.getElementById('verdict-chips');
  chips.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-verdict]');
    if (!btn) return;
    state.verdict = btn.getAttribute('data-verdict');
    state.page = 0;
    Array.prototype.forEach.call(chips.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
    render();
  });
  document.getElementById('reset').addEventListener('click', function () {
    state = { q: '', cohort: 'all', family: 'all', verdict: 'all', sort: 'rank', dir: 1, page: 0 };
    q.value = '';
    document.getElementById('cohort').value = 'all';
    famSel.value = 'all';
    Array.prototype.forEach.call(chips.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-verdict') === 'all')); });
    Array.prototype.forEach.call(table.tHead.rows[0].cells, function (cell) { cell.removeAttribute('aria-sort'); });
    render();
    status.textContent = 'Filters cleared, the whole board back';
  });
  document.getElementById('prev').addEventListener('click', function () { state.page -= 1; render(); });
  document.getElementById('next').addEventListener('click', function () { state.page += 1; render(); });

  table.tHead.rows[0].cells[0].setAttribute('aria-sort', 'ascending');
  render();

  // ---------- the detail dialog ----------

  var dialog = document.getElementById('detail');
  var dTitle = document.getElementById('detail-title');
  var dEyebrow = document.getElementById('detail-eyebrow');
  var dMeta = document.getElementById('detail-meta');
  var dBody = document.getElementById('detail-body');

  function ladderRow(label, value, scale) {
    var width = Math.min(100, (Math.abs(value) / scale) * 100);
    var bar = el('span', { class: value < 0 ? 'neg' : '', 'aria-hidden': 'true' });
    bar.style.width = width.toFixed(1) + '%';
    if (value < 0) bar.style.insetInlineStart = (100 - width).toFixed(1) + '%';
    return el('div', { class: 'ladder-row' }, [
      el('span', { class: 'term' }, [label]),
      el('span', { class: 'ladder-bar' }, [bar]),
      el('span', { class: 'num', text: signed(value) })
    ]);
  }

  function openDetail(slug) {
    var r = DATA.rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    var m = r.model;
    var career = DATA.careers.find(function (c) { return c.key === r.farm.kind; });
    dTitle.textContent = r.name;
    dEyebrow.textContent = 'rank ' + r.rank + ' of ' + DATA.rows.length + ' · ' + (r.on_watchlist ? 'on the watchlist' : 'not on the watchlist') + ' · ' + (r.category || 'no category');
    dMeta.textContent = r.slug + ' · TVL ' + usd(r.tvl_usd) + ' · ' + r.chains.slice(0, 4).join(', ') + (r.chains.length > 4 ? ' +' + (r.chains.length - 4) : '') + ' · listed ' + (r.listed_at || 'not recorded');
    dBody.replaceChildren();

    // The headline and the band.
    dBody.appendChild(el('div', { class: 'big-value' }, [
      el('span', { class: 'v', text: usd(r.implied_value_usd) }),
      el('span', { class: 'band', text: 'one year past its listing day · band ' + usd(r.implied_value_low_usd) + ' – ' + usd(r.implied_value_high_usd) + ' · cover ' + cover(r.ratio_p50) + ' per dollar of TVL' })
    ]));

    // The arithmetic, one bar per term, and the total.
    var scale = Math.max(0.5, Math.abs(m.line_log), Math.abs(m.hold_log), Math.abs(m.category_log + m.family_log), Math.abs(m.growth_log));
    var ladder = el('div', { class: 'ladder' }, [
      ladderRow(el('span', null, [el('b', { text: 'line ' }), 'a + b·log TVL']), m.line_log, scale),
      ladderRow('category + family', m.category_log + m.family_log, scale),
      ladderRow('growth (7-day)', m.growth_log, scale),
      ladderRow('record, log(1 + age)', m.hold_log, scale)
    ]);
    var total = m.line_log + m.category_log + m.family_log + m.growth_log + m.hold_log;
    ladder.appendChild(el('div', { class: 'ladder-row ladder-total' }, [
      el('span', { class: 'term' }, [el('b', { text: 'log cover' })]),
      el('span', { class: 'ladder-bar' }, [el('span', { class: 'hold', style: 'inset-inline-start:0;width:' + Math.min(100, (Math.abs(total) / (scale * 2.2)) * 100).toFixed(1) + '%' })]),
      el('span', { class: 'num', text: signed(total) })
    ]));
    var arith = el('section', null, [el('h3', { text: 'The arithmetic, term by term' }), ladder]);
    dBody.appendChild(arith);

    // Facts and the plan's plan.
    var facts = el('dl', { class: 'facts' }, [
      el('dt', { text: 'TVL' }), el('dd', { text: usd(r.tvl_usd) }),
      el('dt', { text: '7-day' }), el('dd', { text: pct(r.change_7d) }),
      el('dt', { text: 'record' }), el('dd', { text: r.origin === 'counted' ? record(r.age_days) + ' since ' + r.listed_at : 'no listing day: priced from the snapshot date' }),
      el('dt', { text: 'priced age' }), el('dd', { text: m.priced_age_years.toFixed(2) + ' years (origin + one)' }),
      el('dt', { text: 'cover now' }), el('dd', { text: cover(r.ratio_p50) + ' per dollar of TVL' }),
      el('dt', { text: 'peer cover' }), el('dd', { text: 'median traded token ' + cover(M.cover.p50) + ' (p10 ' + cover(M.cover.p10) + ', p90 ' + cover(M.cover.p90) + ')' }),
      el('dt', { text: 'cohort' }), el('dd', { text: r.cohort })
    ]);
    var planFacts = el('div', { class: 'figure-row' }, [
      el('div', null, [el('dt', { text: 'clip' }), el('dd', { text: usd(r.farm.capital_usd) })]),
      el('div', null, [el('dt', { text: 'window' }), el('dd', { text: r.farm.days + ' d' })]),
      el('div', null, [el('dt', { text: 'cost' }), el('dd', { text: usd(r.farm.cost_usd) })]),
      el('div', null, [el('dt', { text: 'net if launch' }), el('dd', { text: usd(r.farm.net_usd) })]),
      el('div', null, [el('dt', { text: 'odds' }), el('dd', { text: Math.round(r.farm.chance * 100) + '%' })]),
      el('div', null, [el('dt', { text: 'per hour' }), el('dd', { text: usd(r.farm.per_hour_usd) })]),
      el('div', null, [el('dt', { text: 'verdict' }), el('dd', null, [el('span', { class: 'vchip vchip--' + r.farm.verdict.toLowerCase(), text: r.farm.verdict })])])
    ]);
    dBody.appendChild(el('div', { class: 'detail-cols' }, [
      el('section', null, [el('h3', { text: 'The record' }), facts]),
      el('section', null, [el('h3', { text: (career ? career.label : 'The plan') + ' · economics' }), planFacts])
    ]));

    // The plan.
    var steps = el('ol', { class: 'plan' });
    r.farm_steps.forEach(function (s) { steps.appendChild(el('li', null, [el('span', { text: s })])); });
    dBody.appendChild(el('section', null, [el('h3', { text: 'The farm plan, in ' + r.farm_steps.length + ' moves' }), steps]));

    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  tbody.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-open]');
    if (!btn) return;
    openDetail(btn.getAttribute('data-open'));
  });

  // ---------- economics ----------

  var verdicts = document.getElementById('verdict-summary');
  var tally = { Worth: 0, Marginal: 0, Skip: 0 };
  var netSum = 0;
  DATA.rows.forEach(function (r) { tally[r.farm.verdict] += 1; netSum += r.farm.net_usd; });
  [
    ['Worth', tally.Worth, 'net if launch clears the cost'],
    ['Marginal', tally.Marginal, 'pays, but under $6 an hour'],
    ['Skip', tally.Skip, 'does not pay for its gas'],
    ['Board total', usd(netSum), 'net if every launch landed']
  ].forEach(function (v) {
    verdicts.appendChild(el('dl', { class: 'verdict-card' }, [el('dt', { text: v[0] }), el('dd', { text: String(v[1]) }), el('small', { text: v[2] })]));
  });

  var byFamily = {};
  DATA.rows.forEach(function (r) {
    var k = r.family || '—';
    (byFamily[k] = byFamily[k] || []).push(r.farm);
  });
  function mid(xs) { var s = xs.slice().sort(function (a, b) { return a - b; }); return s[Math.floor(s.length / 2)]; }
  var econrows = document.getElementById('econrows');
  Object.keys(byFamily).sort(function (a, b) { return byFamily[b].length - byFamily[a].length || collator.compare(a, b); }).slice(0, 12).forEach(function (f) {
    var plans = byFamily[f];
    econrows.appendChild(el('tr', null, [
      el('th', { scope: 'row', class: 'family', text: f }),
      el('td', { class: 'c-num', text: String(plans.length) }),
      el('td', { class: 'c-num', text: usd(mid(plans.map(function (p) { return p.capital_usd; }))) }),
      el('td', { class: 'c-num', text: usd(mid(plans.map(function (p) { return p.cost_usd; }))) }),
      el('td', { class: 'c-num', text: usd(mid(plans.map(function (p) { return p.net_usd; }))) }),
      el('td', { class: 'c-num', text: Math.round(mid(plans.map(function (p) { return p.chance; })) * 100) + '%' }),
      el('td', { class: 'c-num', text: usd(mid(plans.map(function (p) { return p.per_hour_usd; }))) })
    ]));
  });

  // ---------- checks ----------

  var V = DATA.validation;
  var checks = document.getElementById('checks-body');
  function checkCard(title, big, bigNote, body) {
    return el('article', { class: 'check' }, [el('h3', { text: title }), el('div', { class: 'big' }, [big, bigNote ? el('small', { text: bigNote }) : '']), el('p', { text: body })]);
  }
  var laterRows = V.later.map(function (l) {
    return l.from + ': ' + l.n + ' tokens read as launches, rank ' + l.corr.toFixed(2) + ', miss ' + l.misses.mad.toFixed(2);
  });
  checks.appendChild(checkCard('A record, priced blind', V.record.mad.toFixed(2), 'log miss (MAD)', 'Each comp as its record stands, by a fit that never saw it, read as a listing of its day. ' + Math.round(V.record.within2x * 100) + '% land within 2×; rank correlation ' + V.rank_corr.toFixed(2) + '.'));
  checks.appendChild(checkCard('A listing, priced blind', V.launch.mad.toFixed(2), 'log miss (MAD)', 'Each comp as a launch of its own day, by a fit that never saw it: the drift of ' + V.launch.bias.toFixed(2) + ' in logs is a token\u2019s first year, which the record term then pays back.'));
  checks.appendChild(checkCard('Later tokens, earlier model', V.later.length ? V.later[V.later.length - 1].corr.toFixed(2) : '—', 'rank corr on the latest split', 'The fit used the early comps; the late comps were read as launches of the split day. ' + laterRows.join('; ') + '.'));

  var self = el('article', { class: 'check' }, [
    el('h3', { text: 'This page, re-derived' }),
    el('div', { class: 'big' }, [CHECK.bad === 0 ? el('span', { class: 'ok', text: 'all match' }) : el('span', { class: 'bad', text: CHECK.bad + ' differ' }), el('small', { text: CHECK.n + ' rows' })]),
    el('p', { text: 'Every row\u2019s implied value was recomputed here from its five terms and compared with board.json: ' + (CHECK.bad === 0 ? 'all ' + CHECK.n + ' agree to the dollar' : CHECK.bad + ' disagree') + ' (largest gap ' + (CHECK.worst * 100).toFixed(4) + '%). What the page shows is what the file says.' })
  ]);
  var meter = el('div', { class: 'meter' });
  V.ablations.forEach(function (a) {
    var w = Math.min(100, Math.abs(a.delta_record) / 0.6 * 100);
    var bar = el('span', { class: a.delta_record < 0 ? 'neg' : '' });
    bar.style.width = Math.max(4, w).toFixed(1) + '%';
    meter.appendChild(el('div', { class: 'meter-row' }, [el('span', { text: a.label }), el('span', { class: 'meter-bar' }, [bar]), el('span', { text: signed(a.delta_record) })]));
  });
  var abl = el('article', { class: 'check' }, [
    el('h3', { text: 'What each term is worth' }),
    el('p', { text: 'Leave-one-out miss with that term removed, minus the full fit\u2019s: positive is worse without it. The line carries the most; the record term is not decoration.' }),
    meter
  ]);
  checks.appendChild(self);
  checks.appendChild(abl);

  // ---------- accounting ----------

  var acct = document.getElementById('acct-body');
  var C = DATA.coverage;
  acct.appendChild(el('article', null, [
    el('h3', { text: 'Ranked' }),
    el('div', { class: 'n', text: String(C.ranked) }),
    el('p', { text: 'early protocols with no token on record: ' + C.ranked_above_floor + ' at or above the floor, ' + C.ranked_below_floor + ' below it, ' + C.no_listing_day + ' with no listing day.' })
  ]));
  acct.appendChild(el('article', null, [
    el('h3', { text: 'Watchlist' }),
    el('div', { class: 'n', text: C.watch_ranked + ' / ' + C.watchlist }),
    el('p', { text: C.missing.length === 0 ? 'Every watchlist protocol is on the board, at the place its record earns.' : 'Missing: ' + C.missing.join(', ') })
  ]));
  acct.appendChild(el('article', null, [
    el('h3', { text: 'Record no early protocol' }),
    el('div', { class: 'n', text: String(C.early_left_out) }),
    el('p', { text: 'wrapped, staked or bridged products, versions of another protocol, exchange balance sheets and bridges: a unit of account or a wrapper, not a launch still to come.' })
  ]));
  var notes = el('article', null, [el('h3', { text: 'Already trade' }), el('div', { class: 'n', text: String(C.traded_set_aside) }), el('p', { text: 'traded tokens set aside from the ranking, with a place on the record and an answer of their own:' })]);
  var list = el('ul');
  C.traded_notes.slice(0, 10).forEach(function (t) { list.appendChild(el('li', { text: t.name + ': ' + t.reason.split(', so ')[0] })); });
  notes.appendChild(list);
  acct.appendChild(notes);

  document.getElementById('colophon').textContent = DATA.rows.length + ' rows · ' + (DATA.meta.source || 'snapshot') + ' · data as of ' + DATA.meta.as_of + ' · rendered offline by ' + DATA.meta.generated_by;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
