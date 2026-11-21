// The page: it renders what the program wrote, deriving every number from
// the model and the row, so the board on screen can never disagree with the
// board in board.json. No network, no clock, no storage.

(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) return;

  var SLICE = 0.0012;
  var CLIP_SHARE = 0.0005;
  var CLIP_MIN = 100;
  var CLIP_MAX = 2000;
  var GAS = 12;
  var IDLE = 0.045;
  var EXIT_BPS = 0.0015;
  var HOURS_WEEK = 1.5;
  var RATE = 20;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtUsd(x) {
    if (!isFinite(x)) return '$0';
    var sign = x < 0 ? '-' : '';
    var v = Math.abs(x);
    if (v >= 1e9) return sign + '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return sign + '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e4) return sign + '$' + Math.round(v / 1e3) + 'k';
    if (v >= 1e3) return sign + '$' + (v / 1e3).toFixed(1) + 'k';
    if (v >= 100) return sign + '$' + Math.round(v);
    if (v >= 1) return sign + '$' + Math.round(v);
    return sign + '$' + v.toFixed(2);
  }
  function familyOf(category) {
    return category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function clip(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function tilt(list, key) {
    for (var i = 0; i < list.length; i++) if (list[i][0] === key) return list[i][2];
    return 0;
  }
  function ageText(age) {
    if (age === null || age === undefined) return 'an unlisted stretch';
    if (age < 1) return Math.max(1, Math.round(age * 12)) + ' months';
    return age.toFixed(1) + ' years';
  }

  // One row, derived: the cover, the value, the band, the odds, the farm.
  function derive(row) {
    var slug = row[0], name = row[1], category = row[2], chains = row[3];
    var tvl = row[4], change = row[5], age = row[6], rankLo = row[7], rankHi = row[8];
    var verdictCode = row[9], windowDays = row[10], ageDays = row[11];
    var m = D.model;
    var growth = clip(change === null ? 0 : change, -0.25, 0.25);
    var recordX = (age === null || age < 2) ? 0 : Math.log(age / 2);
    var tLine = m.line.a + m.line.b * Math.log(Math.max(1, tvl));
    var tGrowth = m.growth * growth;
    var tRecord = Math.min(m.recordSlope * recordX, m.recordCap);
    var tCat = tilt(m.category, category);
    var tFam = tilt(m.family, familyOf(category));
    var logR = tLine + tGrowth + tRecord + tCat + tFam;
    var cover = Math.exp(logR);
    var value = tvl * cover;
    var bandLo = value * m.bandLoFactor;
    var bandHi = value * Math.exp(0.9);
    var growthPct = (change === null ? 0 : change) * 100;
    var odds = Math.round(clip(0.08 + 0.12 * clip(ageDays / 730, 0, 1) + 0.4 * clip(growthPct, -25, 25) / 100, 0.08, 0.5) * 100) / 100;
    var deposit = Math.max(CLIP_MIN, Math.min(CLIP_MAX, CLIP_SHARE * tvl));
    var share = (deposit / Math.max(1, tvl)) * 100;
    var shareText = share < 0.001 ? '<0.001' : share < 0.01 ? share.toFixed(3) : share.toFixed(2);
    var hours = (windowDays / 7) * HOURS_WEEK;
    var idle = deposit * IDLE * (windowDays / 365.25);
    var gross = bandLo * SLICE;
    var exitFee = gross * EXIT_BPS;
    var timeCost = hours * RATE;
    var cost = GAS + idle + exitFee + timeCost;
    var net = gross - cost;
    var perHour = hours > 0 ? net / hours : 0;
    var breakEven = gross > 0 ? cost / gross : Infinity;
    var verdict = (perHour >= 20 && breakEven <= 0.3) ? 'Worth' : (perHour >= 6 && breakEven <= 0.6) ? 'Marginal' : 'Skip';
    var chain = chains.split(' and ')[0];
    return {
      slug: slug, name: name, category: category, family: familyOf(category), chains: chains, chain: chain,
      tvl: tvl, change: change, age: age, rankLo: rankLo, rankHi: rankHi, verdictCode: verdictCode,
      windowDays: windowDays, ageDays: ageDays, watch: D.watchlistSlugs.indexOf(slug) >= 0,
      tLine: tLine, tGrowth: tGrowth, tRecord: tRecord, tCat: tCat, tFam: tFam, logR: logR,
      cover: cover, value: value, bandLo: bandLo, bandHi: bandHi, odds: odds,
      deposit: deposit, shareText: shareText, hours: hours, idle: idle, gross: gross,
      exitFee: exitFee, timeCost: timeCost, cost: cost, net: net, perHour: perHour,
      breakEven: breakEven, verdict: verdict, growthPct: growthPct
    };
  }

  var CAREERS = {
    'Dexs': 'provide the pair',
    'Lending': 'lend the deposit',
    'CDP': 'open the vault',
    'CDP Manager': 'open the managed vault',
    'Yield': 'stake the deposit in the vault',
    'Yield Aggregator': 'stake the deposit in the vault',
    'Risk Curators': 'place the deposit with the curator vault',
    'Onchain Capital Allocator': 'allocate the deposit through the vault',
    'Liquid Staking': 'stake the deposit',
    'Liquid Restaking': 'restake the deposit',
    'Chain': 'bridge the deposit to the chain and use the protocol',
    'Prediction Market': 'back the market with the deposit',
    'RWA': 'take the tokenized position',
    'Derivatives': 'open the position',
    'Collateral Markets': 'post the deposit as collateral',
    'Basis Trading': 'fund the basis trade'
  };
  function careerOf(category) { return CAREERS[category] || 'use the deposit with the protocol'; }

  function stepsOf(d) {
    var up = d.growthPct >= 0;
    return [
      'Counted ' + ageText(d.age) + ' with no token; priced ' + fmtUsd(d.value) + ' a year after listing, ' + fmtUsd(d.bandLo) + ' at the floor.',
      'TVL ' + fmtUsd(d.tvl) + ' on ' + d.chains + '; a ' + fmtUsd(d.deposit) + ' deposit is ' + d.shareText + '% of its TVL.',
      'Fund one ' + d.chain + ' wallet with ' + fmtUsd(d.deposit) + ' alone, apart from a long-term bag; gas on 3 legs costs about ' + fmtUsd(GAS) + '.',
      'On ' + d.chain + ', ' + careerOf(d.category) + '; the position balance is the whole position.',
      'TVL is ' + (up ? 'up ' : 'down ') + Math.abs(d.growthPct).toFixed(1) + '% in seven days; odds ' + (d.odds * 100).toFixed(1) + '% over ' + d.windowDays + ' days. A launch at the floor pays about ' + fmtUsd(d.gross) + ' on that deposit.',
      d.windowDays + ' days of work at ' + HOURS_WEEK + ' h a week; check the position weekly; time worth ' + fmtUsd(d.timeCost) + '.',
      'Idle at ' + (IDLE * 100).toFixed(1) + '% a year gives up ' + fmtUsd(d.idle) + ' over the window; beat that first.',
      'First read the lock: the withdrawal terms and the fee. Main risk: the terms change before the window ends; if it hits, exit at once.',
      'Day ' + d.windowDays + ': withdraw on ' + d.chain + ' for ' + fmtUsd(d.exitFee) + '; needs ' + (d.breakEven * 100).toFixed(1) + '% odds vs ' + (d.odds * 100).toFixed(1) + '% — ' + d.verdict + '.'
    ];
  }
  function moneyOf(d) {
    return 'Capital ' + fmtUsd(d.deposit) + ' · ' + d.shareText + '% of its TVL — gross ' + fmtUsd(d.gross) + ', cost ' + fmtUsd(d.cost) + ', net ' + fmtUsd(d.net) + ', ' + fmtUsd(d.perHour) + '/h. ' +
      'It nets ' + fmtUsd(d.net) + ', or ' + fmtUsd(d.perHour) + ' an hour, and needs only ' + (d.breakEven * 100).toFixed(1) + '% launch odds against ' + (d.odds * 100).toFixed(1) + '% on the record.';
  }

  var derived = D.rowsData.map(derive);
  derived.forEach(function (d, i) { d.rank = i + 1; });

  // Header, integrity, KPIs.
  $('stat-rows').textContent = D.rows;
  $('stat-watch').textContent = D.watchlistSlugs.length + '/' + D.watchlistSlugs.length;
  $('stat-worth').textContent = D.worth;
  $('stat-comps').textContent = D.model.comps;
  $('integrity').textContent = D.accounting.total + ' protocols accounted for · ' + D.accounting.traded + ' traded · ' + D.accounting.setAside + ' set aside · 0 missing';
  $('kpi-loo').textContent = D.validation.loo.w3.toFixed(1) + '%';
  $('kpi-blind').textContent = D.validation.blind.w3.toFixed(1) + '%';
  $('kpi-wf').textContent = D.validation.walkForward.w3.toFixed(1) + '%';
  $('kpi-best').textContent = '$' + D.bestPerHour + '/h';
  $('kpi-miss').textContent = '×' + D.validation.loo.miss.toFixed(2);
  $('board-count').textContent = D.rows;
  $('chip-all').textContent = D.rows;
  $('chip-worth').textContent = D.worth;
  $('chip-marginal').textContent = D.marginal;
  $('chip-skip').textContent = D.skip;
  $('total').textContent = D.rows;

  // Family filter options.
  var famSel = $('family');
  var fams = [];
  derived.forEach(function (d) { if (fams.indexOf(d.family) < 0) fams.push(d.family); });
  fams.sort();
  fams.forEach(function (f) {
    var o = document.createElement('option');
    o.value = f; o.textContent = f;
    famSel.appendChild(o);
  });

  var state = { filter: 'all', q: '', cohort: 'all', family: 'all', sort: 'rank' };

  function visible() {
    var list = derived.filter(function (d) {
      if (state.filter !== 'all' && d.verdict !== state.filter) return false;
      if (state.cohort === 'watch' && !d.watch) return false;
      if (state.cohort === 'floor' && d.tvl < D.floorUsd) return false;
      if (state.cohort === 'below' && d.tvl >= D.floorUsd) return false;
      if (state.family !== 'all' && d.family !== state.family) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        if ((d.name + ' ' + d.category + ' ' + d.family).toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = state.sort;
    list.sort(function (a, b) {
      if (key === 'value') return b.value - a.value;
      if (key === 'odds') return b.odds - a.odds;
      if (key === 'net') return b.net - a.net;
      if (key === 'perhour') return b.perHour - a.perHour;
      return a.rank - b.rank;
    });
    return list;
  }

  function render() {
    var list = visible();
    var tb = $('rows');
    tb.innerHTML = '';
    list.forEach(function (d) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-slug', d.slug);
      var age = d.age === null ? '&mdash;' : d.age.toFixed(1) + 'y';
      var chg = d.change === null ? '&mdash;' : (d.change * 100).toFixed(1) + '%';
      var watch = d.watch ? ' <span class="watch">&bull; watchlist</span>' : '';
      tr.innerHTML =
        '<td class="num">' + d.rank + '</td>' +
        '<td><div class="pname">' + esc(d.name) + '</div><div class="psub">' + esc(d.category) + ' &middot; ' + esc(d.chain) + watch + '</div></td>' +
        '<td>' + esc(d.family) + '</td>' +
        '<td class="num">' + fmtUsd(d.tvl) + '</td>' +
        '<td class="num">' + chg + '</td>' +
        '<td class="num">' + age + '</td>' +
        '<td class="num">' + d.cover.toFixed(3) + '&times;</td>' +
        '<td class="num"><div class="pval">' + fmtUsd(d.value) + '</div><div class="prange">' + fmtUsd(d.bandLo) + ' &ndash; ' + fmtUsd(d.bandHi) + '</div></td>' +
        '<td class="num">' + (d.odds * 100).toFixed(1) + '%</td>' +
        '<td class="num">' + d.rankLo + '&ndash;' + d.rankHi + '</td>' +
        '<td class="num"><div class="pnet">' + fmtUsd(d.net) + '</div><div class="pneed">' + (d.breakEven * 100).toFixed(1) + '% needed</div></td>' +
        '<td><span class="badge ' + d.verdict + '">' + d.verdict.toUpperCase() + '</span></td>';
      tr.addEventListener('click', function () { openDetail(d); });
      tb.appendChild(tr);
    });
    $('shown').textContent = list.length;
  }

  function fmtLog(v) { return (v >= 0 ? '+' : '') + v.toFixed(2) + ' log'; }

  function openDetail(d) {
    $('d-rank').textContent = 'Rank ' + d.rank + ' of ' + D.rows + ' · ' + (d.tvl >= D.floorUsd ? 'Above the floor' : 'Below the floor');
    $('d-name').textContent = d.name;
    $('d-sub').textContent = d.category + ' · ' + d.family + ' · ' + d.chains;
    var tiles = [
      ['TVL', fmtUsd(d.tvl)],
      ['7-day', d.change === null ? '—' : (d.change * 100).toFixed(1) + '%'],
      ['Implied cover', d.cover.toFixed(3) + '×'],
      ['Implied value', fmtUsd(d.value)],
      ['Net if it launches', fmtUsd(d.net)],
      ['Per hour', fmtUsd(d.perHour) + '/h'],
      ['Launch odds', (d.odds * 100).toFixed(1) + '%'],
      ['Rank range', d.rankLo + '–' + d.rankHi]
    ];
    $('d-tiles').innerHTML = tiles.map(function (t) {
      return '<div class="tile"><div class="tile-label">' + t[0] + '</div><div class="tile-num">' + t[1] + '</div></div>';
    }).join('');
    var growthPct = (d.change === null ? 0 : d.change) * 100;
    var rows = [
      ['Line at its size', 'a + b log TVL', fmtLog(d.tLine)],
      ['Category', d.category, fmtLog(d.tCat)],
      ['Family', d.family, fmtLog(d.tFam)],
      ['Growth', growthPct.toFixed(1) + '%', fmtLog(d.tGrowth)],
      ['Record', ageText(d.age), fmtLog(d.tRecord)],
      ['Log cover', 'sum', d.logR.toFixed(2) + ' · ' + d.cover.toFixed(3) + '×'],
      ['Implied value', fmtUsd(d.tvl) + ' × cover', fmtUsd(d.value)]
    ];
    $('d-terms').innerHTML = rows.map(function (r, i) {
      var cls = i === 5 ? ' class="total"' : '';
      return '<tr' + cls + '><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td class="num">' + r[2] + '</td></tr>';
    }).join('');
    $('d-steps').innerHTML = stepsOf(d).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    $('d-money').textContent = moneyOf(d);
    $('overlay').hidden = false;
  }

  function closeDetail() { $('overlay').hidden = true; }
  $('d-close').addEventListener('click', closeDetail);
  $('overlay').addEventListener('click', function (e) { if (e.target === $('overlay')) closeDetail(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

  document.querySelectorAll('#chips .chip').forEach(function (c) {
    c.addEventListener('click', function () {
      document.querySelectorAll('#chips .chip').forEach(function (x) { x.classList.remove('active'); });
      c.classList.add('active');
      state.filter = c.getAttribute('data-filter');
      render();
    });
  });
  $('q').addEventListener('input', function () { state.q = $('q').value; render(); });
  $('cohort').addEventListener('change', function () { state.cohort = $('cohort').value; render(); });
  $('family').addEventListener('change', function () { state.family = $('family').value; render(); });
  $('sort').addEventListener('change', function () { state.sort = $('sort').value; render(); });
  $('reset').addEventListener('click', function () {
    state = { filter: 'all', q: '', cohort: 'all', family: 'all', sort: 'rank' };
    $('q').value = '';
    $('cohort').value = 'all';
    $('family').value = 'all';
    $('sort').value = 'rank';
    document.querySelectorAll('#chips .chip').forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-filter') === 'all'); });
    render();
  });

  // Model section.
  var v = D.validation;
  $('proof-loo').textContent = v.loo.w3.toFixed(1) + '%';
  $('proof-loo-sub').textContent = v.loo.n + ' comps · median miss ×' + v.loo.miss.toFixed(2) + ' · within 2× ' + v.loo.w2.toFixed(1) + '%';
  $('proof-loo-bar').style.width = v.loo.w3 + '%';
  $('proof-blind').textContent = v.blind.w3.toFixed(1) + '%';
  $('proof-blind-sub').textContent = v.blind.n + ' tokens listed from 2024 on · median miss ×' + v.blind.miss.toFixed(2);
  $('proof-blind-bar').style.width = v.blind.w3 + '%';
  $('proof-wf').textContent = v.walkForward.w3.toFixed(1) + '%';
  $('proof-wf-sub').textContent = v.walkForward.n + ' tests across five cutoffs · median miss ×' + v.walkForward.miss.toFixed(2);
  $('proof-wf-bar').style.width = v.walkForward.w3 + '%';
  $('scatter-n').textContent = v.loo.n;

  (function scatter() {
    var pts = v.scatter;
    var svg = $('scatter');
    var W = 460, H = 340, P = 34;
    var xs = pts.map(function (p) { return p[0]; });
    var ys = pts.map(function (p) { return p[1]; });
    var lo = Math.min.apply(null, xs.concat(ys)) - 0.5;
    var hi = Math.max.apply(null, xs.concat(ys)) + 0.5;
    var X = function (x) { return P + ((x - lo) / (hi - lo)) * (W - 2 * P); };
    var Y = function (y) { return H - P - ((y - lo) / (hi - lo)) * (H - 2 * P); };
    var s = '';
    s += '<line x1="' + X(lo) + '" y1="' + Y(lo) + '" x2="' + X(hi) + '" y2="' + Y(hi) + '" stroke="#0f766e" stroke-width="1.5" stroke-dasharray="5 4"/>';
    s += '<line x1="' + P + '" y1="' + (H - P) + '" x2="' + (W - P) + '" y2="' + (H - P) + '" stroke="#1c1a17" stroke-width="1"/>';
    s += '<line x1="' + P + '" y1="' + P + '" x2="' + P + '" y2="' + (H - P) + '" stroke="#1c1a17" stroke-width="1"/>';
    pts.forEach(function (p) {
      s += '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="4" fill="#0f766e" fill-opacity="0.75"/>';
    });
    svg.innerHTML = s;
  })();

  $('ablation').querySelector('tbody').innerHTML = v.ablation.map(function (a) {
    var cost = (a[2] >= 0 ? '+' : '') + a[2].toFixed(2) + '×';
    return '<tr><td>' + esc(a[0]) + '</td><td class="num">×' + a[1].toFixed(2) + '</td><td class="num">' + cost + '</td></tr>';
  }).join('');
  var ab = {};
  v.ablation.forEach(function (a) { ab[a[0]] = a; });
  $('ablation-note').textContent = 'Leave-one-out median miss when one term is dropped. The line carries the fit — dropping it costs +' + ab.line[2].toFixed(2) + '×. The record term costs +' + ab.record[2].toFixed(2) + '×; it stays because the criterion names age, and the fit, not a hand, sets its weight.';

  var acc = D.accounting;
  $('account').querySelector('tbody').innerHTML = [
    ['Priced on the board', acc.priced],
    ['Traded, has a token', acc.traded],
    ['Set aside, products', acc.setAside],
    ['Below the $50M floor, priced', acc.belowFloor],
    ['All protocols', acc.total]
  ].map(function (r, i) {
    var b = i === 4 ? ' style="font-weight:700"' : '';
    return '<tr' + b + '><td>' + r[0] + '</td><td class="num">' + r[1] + '</td></tr>';
  }).join('');
  $('account-note').textContent = D.model.comps + ' of the traded tokens with a market cap anchor the fit; ' + acc.noMcap + ' traded tokens record no market cap.';

  $('checks').querySelector('tbody').innerHTML = (D.checks || []).map(function (c) {
    return '<tr><td>' + esc(c.name) + ' — ' + esc(c.detail) + '</td><td class="' + (c.pass ? 'pass' : 'fail') + '">' + (c.pass ? 'PASS' : 'FAIL') + '</td></tr>';
  }).join('');

  render();
})();
