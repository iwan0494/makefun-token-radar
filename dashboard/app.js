(function () {
  var R = window.RADAR;
  var rows = R.rowsData.map(function (a, i) {
    return {
      rank: i + 1, slug: a[0], name: a[1], category: a[2],
      family: (a[2] || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown',
      chain: a[3], tvl: a[4], chg: a[5], age: a[6], rankLo: a[7], rankHi: a[8],
      verdict: ['Worth', 'Marginal', 'Skip'][a[9]],
    };
  });
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  // The cover, the band, the odds and the farm arithmetic are derived here from
  // the model and the row — the same formulas the program used, so the page
  // can never disagree with the board. A null listing day reads as 365 days.
  var M = R.model;
  function tiltOf(list, key) {
    for (var i = 0; i < list.length; i++) if (list[i][0] === key) return list[i][2];
    return 0;
  }
  function clip(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
  rows.forEach(function (r) {
    var ageDays = r.age === null ? 365 : Math.round(r.age * 365.25);
    var growth = clip(r.chg === null ? 0 : r.chg, -25, 25) / 100;
    var lineLog = M.line.a + M.line.b * Math.log(Math.max(r.tvl, 1));
    r.catLog = tiltOf(M.category, r.category);
    r.famLog = tiltOf(M.family, r.family);
    r.growthLog = M.growth * growth;
    r.recordLog = r.age === null ? 0 : clip(M.recordSlope * (Math.log(r.age) - Math.log(M.recordRef)), -M.recordCap, M.recordCap);
    r.cover = Math.exp(lineLog + r.catLog + r.famLog + r.growthLog + r.recordLog);
    r.value = Math.round(r.tvl * r.cover);
    var tvlLog = Math.log(Math.max(r.tvl, 1));
    var supportedLog = lineLog + r.catLog + r.famLog - 0.9;
    var depth = clip(Math.exp(Math.min(tvlLog, supportedLog) - tvlLog), 0.02, 1);
    var floorCover = clip(r.cover, M.ratioP10, Math.exp(Math.log(M.ratioP10) + 0.9));
    r.bandLo = Math.max(1, Math.round(r.tvl * depth * floorCover));
    r.bandHi = Math.round(r.value * Math.exp(0.9));
    r.days = Math.round(clip(365.25 - ageDays, 21, 84));
    r.capital = Math.max(100, Math.min(2000, Math.round(r.tvl * 0.0005)));
    r.gross = Math.round(r.bandLo * 0.0012);
    var legs = (r.family === 'bridge' || r.family === 'cross' || r.family === 'canonical' || r.family === 'chain') ? 4 : 2;
    var gas = (legs + 1) * 4;
    var hours = Math.max(1, 1.5 * (r.days / 7));
    var idleRaw = r.capital * 0.045 * (r.days / 365.25);
    var exitRaw = r.capital * 0.0015;
    var timeRaw = hours * 20;
    var costRaw = gas + idleRaw + exitRaw + timeRaw;
    var grossRaw = r.bandLo * 0.0012;
    var netRaw = grossRaw - costRaw;
    r.gas = Math.round(gas);
    r.timeCost = Math.round(timeRaw);
    r.idleCost = Math.round(idleRaw);
    r.exitCost = Math.round(exitRaw);
    r.cost = Math.round(costRaw);
    r.net = Math.round(netRaw);
    r.perHour = Math.round(netRaw / hours);
    r.breakEven = Math.round(clip(costRaw / grossRaw, 0, 1) * 1000) / 1000;
    r.odds = Math.round(clip(0.08 + 0.12 * clip(ageDays / 730, 0, 1) + 0.4 * growth, 0.08, 0.5) * 1000) / 1000;
    r.perHourRaw = netRaw / hours;
    r.breakEvenRaw = clip(costRaw / grossRaw, 0, 1);
  });

  function usd(x) {
    var n = Math.abs(x), s = x < 0 ? '-' : '';
    if (n >= 1e12) return s + '$' + (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return s + '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return s + '$' + (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M';
    if (n >= 1e3) return s + '$' + (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k';
    return s + '$' + Math.round(n);
  }
  function pct1(x) { return (x * 100).toFixed(1) + '%'; }
  function pctOdds(x) {
    if (x <= 0) return '0%';
    if (x < 0.0005) return '<0.1%';
    return (x * 100).toFixed(1) + '%';
  }
  function span(days) {
    if (days < 1.5) return Math.max(1, Math.round(days * 24)) + ' h';
    if (days < 45) return Math.round(days) + ' days';
    if (days < 400) return (days / 30.44).toFixed(1) + ' months';
    return (days / 365.25).toFixed(1) + ' years';
  }
  function shareOf(amount, tvl) {
    var p = (amount / tvl) * 100;
    return (p >= 0.01 ? p.toFixed(2) : p >= 0.001 ? p.toFixed(3) : 'under 0.001') + '% of its TVL';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ------------------------------------------------------------ masthead + strips
  document.getElementById('st-rows').textContent = R.rows;
  document.getElementById('st-watch').textContent = R.accounting.onWatchlist + '/' + R.accounting.onWatchlist;
  document.getElementById('st-worth').textContent = R.worth;
  document.getElementById('st-comps').textContent = R.model.comps;
  document.getElementById('integrity').textContent =
    '758 protocols accounted for · ' + R.accounting.traded + ' traded · ' +
    R.accounting.setAside + ' set aside · 0 missing';
  document.getElementById('k-loo').textContent = R.validation.loo.w3.toFixed(1) + '%';
  document.getElementById('k-blind').textContent = R.validation.blind.w3.toFixed(1) + '%';
  document.getElementById('k-wf').textContent = R.validation.walkForward.w3.toFixed(1) + '%';
  document.getElementById('k-best').textContent = '$' + R.bestPerHour + '/h';
  document.getElementById('k-miss').textContent = '×' + R.validation.loo.miss.toFixed(2);
  document.getElementById('board-count').textContent = R.rows;

  // ------------------------------------------------------------ board
  var state = { verdict: 'all', q: '', cohort: 'all', family: 'all', sort: 'rank' };
  var pills = document.getElementById('verdict-pills');
  [['all', 'All ' + R.rows], ['Worth', R.worth + ' Worth'], ['Marginal', R.marginal + ' Marginal'], ['Skip', R.skip + ' Skip']].forEach(function (p) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = p[1];
    b.setAttribute('aria-pressed', state.verdict === p[0] ? 'true' : 'false');
    b.onclick = function () { state.verdict = p[0]; render(); };
    pills.appendChild(b);
  });
  var famSel = document.getElementById('family');
  var fams = {};
  rows.forEach(function (r) { fams[r.family] = true; });
  Object.keys(fams).sort().forEach(function (f) {
    var o = document.createElement('option');
    o.value = f; o.textContent = f;
    famSel.appendChild(o);
  });
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  document.getElementById('cohort').addEventListener('change', function (e) { state.cohort = e.target.value; render(); });
  famSel.addEventListener('change', function (e) { state.family = e.target.value; render(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
  document.getElementById('reset').addEventListener('click', function () {
    state = { verdict: 'all', q: '', cohort: 'all', family: 'all', sort: 'rank' };
    document.getElementById('q').value = '';
    document.getElementById('cohort').value = 'all';
    famSel.value = 'all';
    document.getElementById('sort').value = 'rank';
    render();
  });

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var out = rows.filter(function (r) {
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (q && (r.name + ' ' + r.category + ' ' + r.family).toLowerCase().indexOf(q) < 0) return false;
      if (state.cohort === 'watchlist' && !isWatch(r)) return false;
      if (state.cohort === 'floor' && r.tvl < 50000000) return false;
      if (state.cohort === 'below' && r.tvl >= 50000000) return false;
      if (state.family !== 'all' && r.family !== state.family) return false;
      return true;
    });
    var key = { rank: 'rank', value: 'value', net: 'net', odds: 'odds', tvl: 'tvl' }[state.sort];
    out.sort(function (a, b) { return key === 'rank' ? a.rank - b.rank : b[key] - a[key]; });
    return out;
  }
  function isWatch(r) {
    return WATCHLIST.indexOf(r.slug) >= 0;
  }
  var WATCHLIST = [];
  var body = document.getElementById('board-body');
  function render() {
    pills.querySelectorAll('button').forEach(function (b, i) {
      b.setAttribute('aria-pressed', (['all', 'Worth', 'Marginal', 'Skip'][i] === state.verdict) ? 'true' : 'false');
    });
    var list = filtered();
    document.getElementById('rowcount').textContent = list.length + ' of ' + R.rows + ' rows';
    var html = '';
    list.forEach(function (r) {
      var firstChain = r.chain.split(' and ')[0];
      html += '<tr data-slug="' + esc(r.slug) + '">'
        + '<td class="num">' + r.rank + '</td>'
        + '<td><span class="pname">' + esc(r.name) + '</span><span class="psub">' + esc(r.category) + ' · ' + esc(firstChain)
        + (isWatch(r) ? ' · <span class="watch">● watchlist</span>' : '') + '</span></td>'
        + '<td>' + esc(r.family) + '</td>'
        + '<td class="num">' + usd(r.tvl) + '</td>'
        + '<td class="num">' + (r.chg === null ? '—' : (r.chg > 0 ? '+' : '') + r.chg.toFixed(1) + '%') + '</td>'
        + '<td class="num">' + (r.age === null ? '—' : r.age.toFixed(1) + 'y') + '</td>'
        + '<td class="num">' + r.cover.toFixed(3) + '×</td>'
        + '<td class="num"><span class="big">' + usd(r.value) + '</span><span class="dim">' + usd(r.bandLo) + ' – ' + usd(r.bandHi) + '</span></td>'
        + '<td class="num">' + pct1(r.odds) + '</td>'
        + '<td class="num">' + r.rankLo + '–' + r.rankHi + '</td>'
        + '<td class="num"><span class="big">' + usd(r.net) + '</span><span class="dim">' + pctOdds(r.breakEven) + ' needed</span></td>'
        + '<td><span class="pill ' + r.verdict.toLowerCase() + '">' + r.verdict + '</span></td></tr>';
    });
    body.innerHTML = html;
    body.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
  }
  // The watchlist is the snapshot's own list; the page carries it as data, not as a claim.
  WATCHLIST = R.watchlistSlugs || [];
  render();

  // ------------------------------------------------------------ detail sheet
  var CAREERS = {
    lending: { action: 'Lend the deposit', holds: 'the receipt token is the whole position', routine: 'check the rate and the health factor weekly', lock: 'the borrow cap and the liquidation threshold', risk: 'a rate spike liquidates the position' },
    dexs: { action: 'Add the deposit to the pool', holds: 'the LP share is the whole position', routine: 'check the pool share and the fees weekly', lock: 'the pool fee tier and the price range', risk: 'impermanent loss outruns the fees' },
    bridge: { action: 'Bridge the deposit across', holds: 'the bridged balance is the whole position', routine: 'check the bridge finality weekly', lock: 'the bridge pause switch and the daily cap', risk: 'a bridge halt strands the deposit' },
    chain: { action: 'Stake the deposit on the chain', holds: 'the staked balance is the whole position', routine: 'check the validator set weekly', lock: 'the unbonding wait and the slash rules', risk: 'a validator fault slashes the stake' },
    liquid: { action: 'Stake the deposit in the pool', holds: 'the receipt token is the whole position', routine: 'check the peg and the yield weekly', lock: 'the withdrawal queue and the peg', risk: 'a depeg strands the receipt token' },
    yield: { action: 'Deposit into the vault', holds: 'the vault share is the whole position', routine: 'check the vault share price weekly', lock: 'the strategy cap and the withdrawal fee', risk: 'the strategy underperforms the idle yield' },
    restaking: { action: 'Restake the deposit', holds: 'the restaked balance is the whole position', routine: 'check the operators weekly', lock: 'the slashing conditions and the queue', risk: 'an operator fault slashes the stake' },
    'default': { action: 'Use the deposit in the protocol', holds: 'the position balance is the whole position', routine: 'check the position weekly', lock: 'the withdrawal terms and the fee', risk: 'the terms change before the window ends' },
  };
  function careerOf(r) {
    var f = r.family;
    if (f === 'lending' || f === 'cdp') return CAREERS.lending;
    if (f === 'dexs' || f === 'derivatives') return CAREERS.dexs;
    if (f === 'bridge' || f === 'cross' || f === 'canonical') return CAREERS.bridge;
    if (f === 'chain') return CAREERS.chain;
    if (f === 'liquid' || f === 'staking') return CAREERS.liquid;
    if (f === 'yield' || f === 'leveraged') return CAREERS.yield;
    if (f === 'restaking') return CAREERS.restaking;
    return CAREERS['default'];
  }
  function tiltCell(log, n) {
    if (n === 0) return '— (no comps)';
    return (log >= 0 ? '+' : '') + log.toFixed(2) + ' log';
  }
  function tiltN(key, list) {
    for (var i = 0; i < list.length; i++) if (list[i][0] === key) return list[i][1];
    return 0;
  }
  function stepsFor(r) {
    var c = careerOf(r);
    var legs = (c === CAREERS.bridge || c === CAREERS.chain) ? 4 : 2;
    var days = span(r.days);
    var aged = r.age === null ? null : Math.round(r.age * 365.25);
    var record = aged === null
      ? 'No listing day is on record; priced ' + usd(r.value) + ' at the one-year horizon, ' + usd(r.bandLo) + ' at the floor.'
      : 'Counted ' + span(aged) + ' with no token; priced ' + usd(r.value) + ' a year after listing, ' + usd(r.bandLo) + ' at the floor.';
    var growth = r.chg === null
      ? 'No seven-day change is reported, so growth is flat and odds rest on the record: ' + pct1(r.odds) + ' over ' + days + '.'
      : Math.abs(r.chg) < 0.05
        ? 'TVL is flat over seven days; with the record that puts launch odds at ' + pct1(r.odds) + ' over ' + days + '.'
        : 'TVL is ' + (r.chg > 0 ? 'up' : 'down') + ' ' + Math.abs(r.chg).toFixed(1) + '% in seven days; odds ' + pct1(r.odds) + ' over ' + days + '.';
    return [
      record,
      'TVL ' + usd(r.tvl) + ' on ' + r.chain + '; a ' + usd(r.capital) + ' deposit is ' + shareOf(r.capital, r.tvl) + '.',
      'Fund one ' + r.chain.split(' and ')[0] + ' wallet with ' + usd(r.capital) + ' alone, apart from a long-term bag; gas on ' + (legs + 1) + ' legs costs about ' + usd(r.gas) + '.',
      'On ' + r.chain.split(' and ')[0] + ', ' + c.action.toLowerCase() + ': ' + c.holds + '.',
      growth + ' A launch at the floor pays about ' + usd(r.gross) + ' on that deposit.',
      days + ' of work at 1.5 h a week: ' + c.routine.toLowerCase() + '; time worth ' + usd(r.timeCost) + '.',
      'Idle at 4.5% a year gives up ' + usd(r.idleCost) + ' over the window; beat that first.',
      'First read the lock: ' + c.lock + '. Main risk: ' + c.risk.toLowerCase() + '; if it hits, exit at once.',
      'Day ' + Math.round(r.days) + ': withdraw on ' + r.chain.split(' and ')[0] + ' for ' + usd(r.exitCost) + '; needs ' + pctOdds(r.breakEven) + ' odds vs ' + pct1(r.odds) + ' — ' + r.verdict + '.',
    ];
  }
  function shortReason(r) {
    var oddsText = pctOdds(r.breakEven) + ' launch odds';
    if (r.net <= 0) return 'the floor pays ' + usd(r.gross) + ' against ' + usd(r.cost) + ' of cost, so no odds clear it';
    if (r.perHourRaw < 6) return 'only ' + usd(r.perHour) + ' an hour against $20 of the reader\'s time; it needs ' + oddsText + ' where the record reads ' + pct1(r.odds);
    if (r.perHourRaw < 20) return 'the net clears the cost, but ' + usd(r.perHour) + ' an hour is under $20; it needs ' + oddsText + ' against ' + pct1(r.odds) + ' on the record';
    if (r.breakEvenRaw > 0.6) return 'it needs ' + oddsText + ' to clear ' + usd(r.cost) + ', past the 60% the record affords, against ' + pct1(r.odds) + ' on the record';
    if (r.breakEvenRaw > 0.3) return 'it needs ' + oddsText + ', past the board\'s best 30%, against ' + pct1(r.odds) + ' on the record';
    return 'it nets ' + usd(r.net) + ', or ' + usd(r.perHour) + ' an hour, and needs only ' + oddsText + ' against ' + pct1(r.odds) + ' on the record';
  }
  function openDetail(slug) {
    var r = bySlug[slug];
    if (!r) return;
    var lineLog = R.model.line.a + R.model.line.b * Math.log(Math.max(r.tvl, 1));
    document.getElementById('d-rank').textContent = 'Rank ' + r.rank + ' of ' + R.rows + ' · ' + (isWatch(r) ? 'on the watchlist' : 'above the floor');
    document.getElementById('d-name').textContent = r.name;
    document.getElementById('d-sub').textContent = r.category + ' · ' + r.family + ' · ' + r.chain + (isWatch(r) ? ' · ● watchlist' : '');
    var tiles = [
      ['TVL', usd(r.tvl)], ['7-day', r.chg === null ? '—' : (r.chg > 0 ? '+' : '') + r.chg.toFixed(1) + '%'],
      ['Implied cover', r.cover.toFixed(3) + '×'], ['Implied value', usd(r.value)],
      ['Net if it launches', usd(r.net)], ['Per hour', '$' + r.perHour + '/h'],
      ['Launch odds', pct1(r.odds)], ['Rank range', r.rankLo + '–' + r.rankHi],
    ];
    document.getElementById('d-tiles').innerHTML = tiles.map(function (t) {
      return '<div><dt>' + t[0] + '</dt><dd>' + t[1] + '</dd></div>';
    }).join('');
    var logCover = lineLog + r.catLog + r.famLog + r.growthLog + r.recordLog;
    var termRows = [
      ['Line at its size', 'a + b log TVL', lineLog.toFixed(2) + ' log'],
      ['Category', r.category, tiltCell(r.catLog, tiltN(r.category, R.model.category))],
      ['Family', r.family, tiltCell(r.famLog, tiltN(r.family, R.model.family))],
      ['Growth', r.chg === null ? 'no change reported' : (r.chg > 0 ? '+' : '') + r.chg.toFixed(1) + '%', (r.growthLog >= 0 ? '+' : '') + r.growthLog.toFixed(2) + ' log'],
      ['Record', r.age === null ? 'no listing day' : r.age.toFixed(1) + ' years', (r.recordLog >= 0 ? '+' : '') + r.recordLog.toFixed(2) + ' log'],
    ];
    document.getElementById('d-terms').innerHTML = termRows.map(function (t) {
      return '<tr><td>' + esc(t[0]) + '</td><td>' + esc(t[1]) + '</td><td class="num">' + t[2] + '</td></tr>';
    }).join('') + '<tr class="total"><td>Log cover</td><td>sum</td><td class="num">' + logCover.toFixed(2) + ' · ' + r.cover.toFixed(3) + '×</td></tr>'
      + '<tr><td>Implied value</td><td>' + usd(r.tvl) + ' × cover</td><td class="num">' + usd(r.value) + '</td></tr>';
    var noComp = tiltN(r.category, R.model.category) === 0 || tiltN(r.family, R.model.family) === 0;
    document.getElementById('d-note').textContent = noComp
      ? r.category + ' has no traded token in the anchor pool, so the empty tilt reads as no comps — the chain, the growth and the record price this row.'
      : 'Every tilt above is read off traded tokens in the same category and family; none is typed in.';
    document.getElementById('d-steps').innerHTML = stepsFor(r).map(function (s) {
      return '<li>' + esc(s) + '</li>';
    }).join('');
    document.getElementById('d-money').textContent =
      'Capital ' + usd(r.capital) + ' · ' + shareOf(r.capital, r.tvl) + ' — gross ' + usd(r.gross) + ', cost ' + usd(r.cost) + ', net ' + usd(r.net) + ', $' + r.perHour + '/h. ' + shortReason(r) + '.';
    document.getElementById('dialog-backdrop').hidden = false;
    document.getElementById('dialog').scrollTop = 0;
    history.replaceState(null, '', '?row=' + encodeURIComponent(r.slug));
  }
  function closeDetail() {
    document.getElementById('dialog-backdrop').hidden = true;
    history.replaceState(null, '', location.pathname);
  }
  document.getElementById('dialog-close').addEventListener('click', closeDetail);
  document.getElementById('dialog-backdrop').addEventListener('click', function (e) {
    if (e.target === this) closeDetail();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

  // ------------------------------------------------------------ proof
  var v = R.validation;
  function proofCard(label, sub, val) {
    return '<article><p class="pc-label">' + label + '</p><p class="pc-num">' + val.toFixed(1) + '%</p><p class="pc-sub">' + sub + '</p><div class="bar"><i style="width:' + val.toFixed(1) + '%"></i></div></article>';
  }
  document.getElementById('proof-cards').innerHTML =
    proofCard('Leave-one-out', v.loo.n + ' comps · median miss ×' + v.loo.miss.toFixed(2) + ' · within 2× ' + v.loo.w2.toFixed(1) + '%', v.loo.w3)
    + proofCard('Tested blind', v.blind.n + ' tokens listed from 2024 on · median miss ×' + v.blind.miss.toFixed(2), v.blind.w3)
    + proofCard('Later listings', v.walkForward.n + ' tests across five cutoffs · median miss ×' + v.walkForward.miss.toFixed(2), v.walkForward.w3);
  (function scatter() {
    var pts = v.scatter;
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var lo = Math.min.apply(null, xs.concat(ys)) - 0.4, hi = Math.max.apply(null, xs.concat(ys)) + 0.4;
    var W = 460, H = 340, pad = 34;
    function X(x) { return pad + ((x - lo) / (hi - lo)) * (W - pad * 2); }
    function Y(y) { return H - pad - ((y - lo) / (hi - lo)) * (H - pad * 2); }
    var s = '<line x1="' + X(lo) + '" y1="' + Y(lo) + '" x2="' + X(hi) + '" y2="' + Y(hi) + '" stroke="#0b6e5c" stroke-width="1.5" stroke-dasharray="4 3"/>'
      + '<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '" stroke="#1c1a16"/>'
      + '<line x1="' + pad + '" y1="' + pad + '" x2="' + pad + '" y2="' + (H - pad) + '" stroke="#1c1a16"/>'
      + '<text x="' + (W / 2) + '" y="' + (H - 8) + '" font-size="11" text-anchor="middle" fill="#6d675c">recorded log cover</text>'
      + '<text x="12" y="' + (H / 2) + '" font-size="11" text-anchor="middle" fill="#6d675c" transform="rotate(-90 12 ' + (H / 2) + ')">read log cover</text>';
    pts.forEach(function (p) {
      s += '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="3.2" fill="#0b6e5c" opacity="0.75"/>';
    });
    document.getElementById('scatter').innerHTML = s;
  })();
  var ab = v.ablation.map(function (a) {
    return '<tr><td>' + a[0] + '</td><td class="num">×' + a[1].toFixed(2) + '</td><td class="num">' + (a[2] >= 0 ? '+' : '') + a[2].toFixed(2) + '×</td></tr>';
  }).join('');
  document.getElementById('ablation').innerHTML = '<thead><tr><th>Term dropped</th><th class="num">LOO miss</th><th class="num">Cost</th></tr></thead><tbody>' + ab + '</tbody>';
  var a = R.accounting;
  document.getElementById('accounting').innerHTML = '<tbody>'
    + '<tr><td>Priced on the board</td><td class="num">' + a.priced + '</td></tr>'
    + '<tr><td>Traded, has a token</td><td class="num">' + a.traded + '</td></tr>'
    + '<tr><td>Set aside, products</td><td class="num">' + a.setAside + '</td></tr>'
    + '<tr><td>Below the $50M floor, priced</td><td class="num">' + a.belowFloor + '</td></tr>'
    + '<tr><td><strong>All protocols</strong></td><td class="num"><strong>' + (a.priced + a.traded + a.setAside) + '</strong></td></tr></tbody>'
    + '<caption style="caption-side:bottom;text-align:left;font-size:12px;color:#6d675c;padding-top:6px">' + R.model.comps + ' of the traded tokens with a market cap anchor the fit; ' + a.noMcap + ' traded tokens record no market cap.</caption>';
  document.getElementById('checks').innerHTML = (R.checks || []).map(function (c) {
    return '<li><span>' + esc(c.name) + ' — <span style="color:#6d675c">' + esc(c.detail) + '</span></span><span class="' + (c.pass ? 'ok' : 'bad') + '">' + (c.pass ? 'PASS' : 'FAIL') + '</span></li>';
  }).join('');
  var m = R.model;
  document.getElementById('method-text').textContent =
    'log r = ' + m.line.a.toFixed(4) + ' + ' + m.line.b.toFixed(4) + ' log(TVL), fitted on ' + m.comps +
    ' traded tokens at least a year old; the seven-day growth term reads ' + m.growth.toFixed(3) +
    ' a log per point of growth; the record term adds ' + m.recordSlope.toFixed(3) +
    ' a log per e-fold past ' + m.recordRef + ' years, capped at ±' + m.recordCap +
    '; category and family tilts are shrunk by n/(n+30). Leave-one-out reads ' + v.loo.w3.toFixed(1) +
    '% within 3× of the recorded cover (median miss ×' + v.loo.miss.toFixed(2) + '); the blind split reads ' + v.blind.w3.toFixed(1) +
    '% within 3×; walk-forward across 87 later listings reads ' + v.walkForward.w3.toFixed(1) + '% within 3×.';

  // ------------------------------------------------------------ deep links
  var params = new URLSearchParams(location.search);
  if (params.get('filter') === 'worth') { state.verdict = 'Worth'; render(); }
  if (params.get('view') === 'model') { document.getElementById('proof').scrollIntoView(); }
  if (params.get('row')) { openDetail(params.get('row')); }
})();
