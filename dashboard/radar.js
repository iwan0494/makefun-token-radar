// Launch Radar — ronde 2, the page's only script.
//
// It reads globalThis.LAUNCH_RADAR (data.js, written beside it by main.ts and loaded before this file)
// and draws every figure on the page from it: the three held-out tests, the scatter and its data table,
// the ablation, the fit card, the splits, the ronde-1 duel, the verdict counts, the 198-row board with
// its filters, sorts and pager, the accounting sheet, the colophon and the detail sheet a name opens.
//
// Nothing on the page is a typed-in figure except the validation summary below, and that summary is the
// chosen fit's own out-of-sample record: it cannot be rebuilt from data.js, because the LOO, walk-forward
// and blind refits are 81 × 3 fits and belong in scripts/validate2.ts, not in a browser. Every number
// quoted there is printed in out/validation.txt by the same run that wrote this snapshot's data.js.
//
// No network, no framework: the board is 198 <tr>s moved with moveBefore where the browser has it.
(function () {
  'use strict';

  // -----------------------------------------------------------------------------------------------
  // Round-2 validation, scripts/validate2.ts on the sealed 2026-11-14 snapshot: 758 protocols, 416
  // traded, 81 comps (listed a year before the snapshot), watchlist 40. Variant no_hold.
  // -----------------------------------------------------------------------------------------------
  var VAL = {
    // Fit no_hold. The line and the tilts are re-read from DATA.model at run time; these are the
    // fallback and the numbers data.js does not carry.
    line: { a: 5.1819, b: -0.3885 },               // log r = a + b log(TVL), b bounds [-2, 0.5], free, n 81
    growth: { level: -0.0449, slope: -0.1695 },     // 7-day change / 100, held inside ±1, n 81
    hold: 0,                                        // table 7: the age term dropped, so it adds nothing
    tilts: { category: 9, family: 9 },              // 9 category + 9 family tilts, both shrunk by n/(n+prior)
    inSampleMiss: 2.50,                             // median miss on the 81 the fit itself saw
    loo: { n: 81, miss: 2.58, within3: 0.531, within2: 0.395, bias: 0.88 },
    launch: { miss: 2.63, within3: 0.519, within2: 0.383 },
    walkForward: {
      pooled: { n: 87, miss: 3.02, within3: 0.471, within2: 0.253, bias: 0.91, noHold: true },
      rhoMin: 0.43, rhoMax: 0.60,
      splits: [
        { day: '2023-12-04', fit: 40, test: 41, miss: 3.04, within3: 0.488, rho: 0.43 },
        { day: '2024-07-23', fit: 52, test: 29, miss: 3.02, within3: 0.448, rho: 0.43 },
        { day: '2025-02-07', fit: 64, test: 17, miss: 3.00, within3: 0.471, rho: 0.60 }
      ]
    },
    blind: {
      day: '2024-01-01', fit: 42, test: 39,
      record: { miss: 3.10, within3: 0.487, within2: 0.308, bias: 0.84, rho: 0.39, launchMiss: 2.98, launchWithin3: 0.513 }
    },
    ablation: [
      { term: 'hold', label: 'Record (age)', href: '#fit-why', miss: 2.58, delta: 0.00, note: 'dropped this round: it moves the held-out miss by nothing' },
      { term: 'growth', label: 'Growth', miss: 2.63, delta: 0.05, note: '+0.05× — the weekday a token had hardly bends a year of cover' },
      { term: 'category', label: 'Category + family', miss: 3.15, delta: 0.57, note: '+0.57× — the tilts earn their place' },
      { term: 'line', label: 'Line on TVL', miss: 4.93, delta: 2.35, note: '+2.35× — the whole reading, without it there is no line' }
    ],
    ronde1: { loo: 2.79, walk: 3.52, blind: 4.45 },
    verdicts: [['Worth', 31], ['Marginal', 35], ['Skip', 132]],
    priced: 198
  };

  // Fig. 1 — the 81 comps at their own record, read by the chosen fit (in sample) against what the
  // market actually recorded: market cap per dollar of TVL, decimal. Dumped from the same functions
  // scripts/validate2.ts calls (compPool + fitTerms + ratioUnderAt, hold dropped), one row per comp slug it
  // pools; the ten largest overshoots match out/model.json's worst_readings exactly. 81 rows; the page
  // prints its count wherever index.html would otherwise claim one.
  var SCATTER = [
  ['across', 0.29034, 2.2049, 'Cross Chain Bridge'],
  ['api3', 0.31044, 2.9747, 'Risk Curators'],
  ['aquarius-stellar', 0.24772, 0.29316, 'Dexs'],
  ['astar-dapps-staking', 0.28745, 3.0264, 'Chain'],
  ['aura', 0.22777, 0.19141, 'Yield'],
  ['b2-buzz', 0.17157, 0.31672, 'Canonical Bridge'],
  ['babylon-protocol', 0.037033, 0.017471, 'Restaking'],
  ['biconomy.com', 0.13011, 0.0064756, 'CEX'],
  ['bitkan', 0.17133, 0.061987, 'CEX'],
  ['bitkub', 0.047438, 0.027164, 'CEX'],
  ['blur-bids', 0.34322, 2.0017, 'NFT Marketplace'],
  ['brickken', 0.30632, 0.13989, 'RWA'],
  ['cap', 0.07226, 1.0435, 'Lending'],
  ['cbridge', 0.30891, 1.5268, 'Bridge'],
  ['concentrator', 0.10229, 0.0012896, 'Yield'],
  ['concrete', 0.053134, 0.019119, 'Onchain Capital Allocator'],
  ['dolomite', 0.078515, 0.082002, 'Lending'],
  ['eigencloud', 0.029968, 0.031807, 'Restaking'],
  ['ekubo', 0.30707, 0.34243, 'Dexs'],
  ['equilibria', 0.2224, 1.0566, 'Yield'],
  ['evaa-protocol', 0.2373, 1.0268, 'Lending'],
  ['exactly', 0.20273, 0.0412, 'Lending'],
  ['falcon-finance', 0.08001, 0.20424, 'Basis Trading'],
  ['frankencoin', 0.093693, 0.1687, 'CDP'],
  ['fx-protocol', 0.14827, 0.031615, 'Dual-Token Stablecoin'],
  ['gains-network', 0.40396, 1.3764, 'Derivatives'],
  ['gate', 0.02634, 0.16848, 'CEX'],
  ['gearbox', 0.16287, 0.16861, 'Lending'],
  ['gravity-bridge', 0.39736, 0.0080012, 'Bridge'],
  ['harmonix-finance', 0.26607, 0.1206, 'Yield'],
  ['hipo', 0.098109, 0.38448, 'Liquid Staking'],
  ['hydration-dex', 0.31544, 1.7535, 'Dexs'],
  ['infrared-finance', 0.092338, 0.034339, 'Liquid Staking'],
  ['inverse-finance-firm', 0.11817, 0.24599, 'CDP'],
  ['kaio', 0.33189, 0.41448, 'RWA'],
  ['kinetic', 0.14964, 0.011452, 'Lending'],
  ['kyros', 0.23899, 0.020451, 'Liquid Restaking'],
  ['liqwid', 0.22425, 0.42283, 'Lending'],
  ['looped-hype', 0.27318, 0.99948, 'Yield'],
  ['mansory', 0.68537, 1.0065, 'RWA'],
  ['merlins-seal', 0.081309, 0.12501, 'Bridge'],
  ['merlinswap', 0.46874, 0.021844, 'Dexs'],
  ['metalx-lending', 0.14333, 0.32466, 'Lending'],
  ['meth-protocol', 0.022183, 0.0040053, 'Liquid Staking'],
  ['mexc', 0.030486, 0.033556, 'CEX'],
  ['morpheusai', 0.38303, 0.88808, 'AI Agents'],
  ['obol', 0.052105, 0.00062585, 'Staking Pool'],
  ['okx', 0.014294, 0.074831, 'CEX'],
  ['pinksale', 0.11829, 0.13058, 'Launchpad'],
  ['portal', 0.048671, 0.051791, 'Bridge'],
  ['pumpbtc', 0.23221, 1.6033, 'Bridge'],
  ['railgun', 0.12882, 0.96913, 'Privacy'],
  ['renzo', 0.10559, 0.34507, 'Liquid Restaking'],
  ['reservoir-protocol', 0.071779, 0.0079503, 'CDP'],
  ['resolv-usr', 0.68409, 1.1152, 'Basis Trading'],
  ['resupply', 0.12006, 0.033383, 'Lending'],
  ['rocket-pool', 0.01684, 0.032385, 'Liquid Staking'],
  ['sdai', 0.1225, 1.001, 'Yield'],
  ['solomon-usdv', 0.59303, 0.65442, 'Basis Trading'],
  ['solstice', 0.17545, 0.044127, 'Basis Trading'],
  ['stader', 0.034001, 0.047675, 'Liquid Staking'],
  ['ston.fi', 0.30913, 1.4434, 'Dexs'],
  ['streamflow', 0.34979, 0.13988, 'Payments'],
  ['stusdt', 0.30189, 0.2049, 'RWA'],
  ['superfluid', 0.42359, 0.2227, 'Payments'],
  ['swissborg', 0.058013, 0.18181, 'CEX'],
  ['symbiosis', 0.35738, 0.19537, 'Cross Chain Bridge'],
  ['taiko-bridge', 0.32107, 1.4341, 'Canonical Bridge'],
  ['team-finance', 0.17508, 0.065191, 'Token Locker'],
  ['tectonic', 0.19385, 0.13239, 'Lending'],
  ['treehouse-protocol', 0.17416, 0.089765, 'DOR'],
  ['uranium.io', 0.53052, 0.86975, 'RWA'],
  ['usd-ai', 0.18459, 0.40321, 'RWA'],
  ['usual-usd0', 0.24194, 0.27478, 'RWA'],
  ['veno-finance', 0.064676, 0.040593, 'Liquid Staking'],
  ['veranta', 0.31366, 2.9473, 'Derivatives'],
  ['waterneuron', 0.11703, 0.18575, 'Liquid Staking'],
  ['xsy', 0.50838, 0.99838, 'Basis Trading'],
  ['yield-basis', 0.14642, 0.17245, 'Leveraged Farming'],
  ['zerobase-cedefi', 0.2809, 0.31004, 'Basis Trading'],
  ['zyfai', 0.35313, 0.32126, 'AI Agents']
  ].map(function (p) { return { slug: p[0], read: p[1], actual: p[2], category: p[3] }; });;

  // -----------------------------------------------------------------------------------------------
  // Small helpers: formatting, nodes, the model.
  // -----------------------------------------------------------------------------------------------

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var num0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  var collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var a = Math.abs(n);
    var sign = n < 0 ? '−' : '';
    if (a >= 1e12) return sign + '$' + (a / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(a >= 1e8 ? 1 : 2) + 'M';
    if (a >= 1e3) return sign + '$' + (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k';
    return sign + '$' + Math.round(a);
  }
  function x(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var d = digits !== undefined ? digits : n >= 10 ? 1 : n >= 1 ? 2 : 3;
    return n.toFixed(d) + '×';
  }
  function pct(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return 'unreported';
    var d = digits === undefined ? 1 : digits;
    return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(d) + '%';
  }
  function share(n, digits) {
    return (n * 100).toFixed(digits === undefined ? 1 : digits) + '%';
  }
  function months(days) {
    return (days / 30.44).toFixed(1) + ' mo';
  }
  function record(days) {
    if (days === null || days === undefined) return 'no listing day';
    if (days < 60) return days + ' d';
    if (days < 730) return months(days);
    return (days / 365.25).toFixed(1) + ' yr';
  }
  function verdictClass(v) {
    return v === 'Worth' ? 'worth' : v === 'Marginal' ? 'marginal' : 'skip';
  }

  function node(tag, attrs, kids) {
    var n = document.createElement(tag);
    apply(n, attrs);
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function svgn(tag, attrs, kids) {
    var n = document.createElementNS(SVG_NS, tag);
    apply(n, attrs);
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function apply(n, attrs) {
    if (!attrs) return;
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') n.setAttribute('class', v);
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v === true ? '' : v);
    });
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function $(id) { return document.getElementById(id); }

  var DATA = globalThis.LAUNCH_RADAR;
  if (!DATA || !Array.isArray(DATA.rows)) return;
  var ROWS = DATA.rows;
  var META = DATA.meta || {};
  var MODEL = DATA.model || {};

  /** The reprice: line + tilts + growth (+ record, zero this round) in logs, turned back into dollars. */
  function fitLine() {
    var l = MODEL.line || {};
    return { a: typeof l.a === 'number' ? l.a : VAL.line.a, b: typeof l.b === 'number' ? l.b : VAL.line.b };
  }
  function growthTerms() {
    var g = MODEL.growth || {};
    return {
      level: typeof g.level === 'number' ? g.level : VAL.growth.level,
      slope: typeof g.slope === 'number' ? g.slope : VAL.growth.slope
    };
  }
  function tiltOf(list, key) {
    if (!Array.isArray(list) || !key) return 0;
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i].value;
    return 0;
  }
  function rowTerms(r) {
    var line = fitLine();
    var g = growthTerms();
    var logLine = line.a + line.b * Math.log(r.tvl_usd);
    var growth = (r.change_7d === null || r.change_7d === undefined) ? 0
      : g.level + g.slope * Math.max(-1, Math.min(1, r.change_7d / 100));
    var cat = tiltOf(MODEL.category, r.category);
    var fam = tiltOf(MODEL.family, r.family);
    return { logLine: logLine, category: cat, family: fam, growth: growth, hold: 0, sum: logLine + cat + fam + growth };
  }
  function reprice(r) {
    return Math.max(1, Math.round(r.tvl_usd * Math.exp(rowTerms(r).sum)));
  }

  // -----------------------------------------------------------------------------------------------
  // Masthead and the three headline tests.
  // -----------------------------------------------------------------------------------------------

  /** index.html's prose carries counts typed when it was written; keep them the same as the file's own. */
  function factTally(text) {
    var re = /\b(81|87|40|198|758|416)\b/g;
    return text.replace(re, function (m) {
      if (m === '81') return String(SCATTER.length);
      if (m === '40') return String(META.watchlist || 0);
      if (m === '198') return String(ROWS.length);
      if (m === '758') return num0.format(META.protocols || 0);
      if (m === '416') return num0.format(META.traded || 0);
      if (m === '87') return String(VAL.walkForward.pooled.n);
      return m;
    });
  }
  function factSweep() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var t = walker.nextNode();
    while (t) {
      var parent = t.parentNode;
      if (parent && !/^(SCRIPT|STYLE)$/.test(parent.nodeName) && /\b(81|87|40|198|758|416)\b/.test(t.nodeValue)) {
        t.nodeValue = factTally(t.nodeValue);
      }
      t = walker.nextNode();
    }
  }

  function renderMast() {
    var snap = $('snapshot');
    if (snap) {
      clear(snap);
      snap.appendChild(node('span', null, ['snapshot ']));
      snap.appendChild(node('b', { text: META.as_of || '—' }));
      snap.appendChild(node('span', {
        text: ' · ' + num0.format(META.protocols || 0) + ' protocols · ' + num0.format(META.traded || 0) + ' traded · floor ' + usd(META.floor_usd)
      }));
    }
    var refit = $('refit-n');
    if (refit) refit.textContent = String(VAL.loo.n);
    var lede = $('lede-rows');
    if (lede) lede.textContent = num0.format(ROWS.length);
  }

  function headlineCard(test) {
    var li = node('li', { class: 'hl hl--' + test.key });
    li.appendChild(node('p', { class: 'hl-label', text: test.label }));
    li.appendChild(node('p', { class: 'hl-miss', html: x(test.miss) + '<small>median miss</small>' }));
    li.appendChild(node('p', { class: 'hl-how', text: test.how }));
    var bars = node('dl', { class: 'hl-bars' });
    bars.appendChild(node('div', null, [
      node('dt', { text: 'within 3×' }),
      node('dd', null, [node('span', { class: 'hl-bar', style: '--v:' + test.within3 }), node('b', { text: share(test.within3) })])
    ]));
    if (test.within2 !== undefined) {
      bars.appendChild(node('div', null, [
        node('dt', { text: 'within 2×' }),
        node('dd', null, [node('span', { class: 'hl-bar hl-bar--thin', style: '--v:' + test.within2 }), node('b', { text: share(test.within2) })])
      ]));
    }
    li.appendChild(bars);
    li.appendChild(node('p', { class: 'hl-foot', text: test.foot }));
    return li;
  }

  function renderHeadline() {
    var ol = $('headline');
    if (!ol) return;
    clear(ol);
    var cards = [
      {
        key: 'loo', label: 'Left out of its own fit', miss: VAL.loo.miss, within3: VAL.loo.within3, within2: VAL.loo.within2,
        how: 'Each comp is priced by a fit that refitted on the other ' + (VAL.loo.n - 1) + ', then compared with its own cover.',
        foot: VAL.loo.n + ' comps · bias ' + x(VAL.loo.bias) + ' · launch state ' + x(VAL.launch.miss) + ' (' + share(VAL.launch.within3) + ' inside 3×)'
      },
      {
        key: 'walk', label: 'Left out by the clock', miss: VAL.walkForward.pooled.miss, within3: VAL.walkForward.pooled.within3, within2: VAL.walkForward.pooled.within2,
        how: 'At three listing-day splits, the fit sees only tokens listed before the split and prices every one after it.',
        foot: VAL.walkForward.pooled.n + ' test reads over 3 splits · ρ ' + VAL.walkForward.rhoMin.toFixed(2) + '–' + VAL.walkForward.rhoMax.toFixed(2) + ' · bias ' + x(VAL.walkForward.pooled.bias)
      },
      {
        key: 'blind', label: 'Left out by the split', miss: VAL.blind.record.miss, within3: VAL.blind.record.within3, within2: VAL.blind.record.within2,
        how: 'One hard cut: fit on the ' + VAL.blind.fit + ' tokens listed before ' + VAL.blind.day + ', test on the ' + VAL.blind.test + ' listed after.',
        foot: 'ρ ' + x(VAL.blind.record.rho, 2) + ' · bias ' + x(VAL.blind.record.bias) + ' · launch state ' + x(VAL.blind.record.launchMiss) + ' (' + share(VAL.blind.record.launchWithin3) + ' inside 3×)'
      }
    ];
    cards.forEach(function (c) { ol.appendChild(headlineCard(c)); });
  }

  // -----------------------------------------------------------------------------------------------
  // Fig. 1 — read against actual, log–log, diagonal and a 3× band.
  // -----------------------------------------------------------------------------------------------

  var SCATTER_W = 760;
  var SCATTER_H = 480;
  var PAD = { l: 46, r: 16, t: 18, b: 40 };

  function scatterBounds() {
    var lo = Infinity, hi = -Infinity;
    SCATTER.forEach(function (p) {
      [logv(p.read), logv(p.actual)].forEach(function (v) {
        var l = Math.log10(v);
        if (l < lo) lo = l;
        if (l > hi) hi = l;
      });
    });
    var a = Math.floor(lo * 2) / 2 - 0.25;
    var b = Math.ceil(hi * 2) / 2 + 0.25;
    return [a, b];
  }
  function logv(v) { return v > 0 ? v : 1e-4; }

  function renderScatter() {
    var host = $('scatter');
    if (!host) return;
    clear(host);
    var range = scatterBounds();
    var lo = range[0], hi = range[1];
    var iw = SCATTER_W - PAD.l - PAD.r;
    var ih = SCATTER_H - PAD.t - PAD.b;
    function sx(v) { return PAD.l + (Math.log10(logv(v)) - lo) / (hi - lo) * iw; }
    function sy(v) { return PAD.t + ih - (Math.log10(logv(v)) - lo) / (hi - lo) * ih; }

    var svg = svgn('svg', {
      viewBox: '0 0 ' + SCATTER_W + ' ' + SCATTER_H, class: 'scatter', role: 'img',
      'aria-label': 'Read against actual cover, ' + SCATTER.length + ' comps; each dot a traded token'
    });

    // The 3× band: actual ÷ 3 to actual × 3 around the diagonal.
    svg.appendChild(svgn('path', {
      class: 'sc-band',
      d: 'M' + sx(Math.pow(10, lo)) + ',' + sy(Math.pow(10, lo) / 3) +
        ' L' + sx(Math.pow(10, hi)) + ',' + sy(Math.pow(10, hi) / 3) +
        ' L' + sx(Math.pow(10, hi)) + ',' + sy(Math.pow(10, hi) * 3) +
        ' L' + sx(Math.pow(10, lo)) + ',' + sy(Math.pow(10, lo) * 3) + ' Z'
    }));

    // Ticks every decade and the 1/3, 3 gridlines either side of the diagonal.
    var decade = [];
    for (var e = Math.ceil(lo); e <= Math.floor(hi); e++) decade.push(Math.pow(10, e));
    decade.forEach(function (v) {
      svg.appendChild(svgn('line', { class: 'sc-grid', x1: sx(v), y1: sy(Math.pow(10, lo)), x2: sx(v), y2: sy(Math.pow(10, hi)) }));
      svg.appendChild(svgn('line', { class: 'sc-grid', x1: sx(Math.pow(10, lo)), y1: sy(v), x2: sx(Math.pow(10, hi)), y2: sy(v) }));
      svg.appendChild(svgn('text', { class: 'sc-tick', x: sx(v), y: PAD.t + ih + 18, 'text-anchor': 'middle', text: decadeLabel(v) }));
      svg.appendChild(svgn('text', { class: 'sc-tick', x: PAD.l - 8, y: sy(v) + 4, 'text-anchor': 'end', text: decadeLabel(v) }));
    });

    svg.appendChild(svgn('line', { class: 'sc-band-edge', x1: sx(Math.pow(10, lo) / 3), y1: sy(Math.pow(10, lo)), x2: sx(Math.pow(10, hi) / 3), y2: sy(Math.pow(10, hi)) }));
    svg.appendChild(svgn('line', { class: 'sc-band-edge', x1: sx(Math.pow(10, lo) * 3), y1: sy(Math.pow(10, lo)), x2: sx(Math.pow(10, hi) * 3), y2: sy(Math.pow(10, hi)) }));
    svg.appendChild(svgn('line', { class: 'sc-diag', x1: sx(Math.pow(10, lo)), y1: sy(Math.pow(10, lo)), x2: sx(Math.pow(10, hi)), y2: sy(Math.pow(10, hi)) }));

    // Dots: above the diagonal = read high (the line gives more cover than the market did).
    var count = { above: 0, within: 0, below: 0 };
    SCATTER.forEach(function (p) {
      var side = p.read / p.actual;
      var cls = side > 3 ? 'sc-dot sc-dot--high' : side < 1 / 3 ? 'sc-dot sc-dot--low' : 'sc-dot';
      if (side > 3) count.above += 1;
      else if (side < 1 / 3) count.below += 1;
      else count.within += 1;
      var g = svgn('g', { class: 'sc-pt' });
      g.appendChild(svgn('circle', { class: cls, cx: sx(p.read), cy: sy(p.actual), r: 3.6 }));
      g.appendChild(svgn('title', { text: p.slug + ' — read ' + x(p.read) + ', actual ' + x(p.actual) + ' (' + (p.category || 'no category') + ')' }));
      svg.appendChild(g);
    });

    // Axis captions.
    svg.appendChild(svgn('text', { class: 'sc-axis', x: PAD.l + iw / 2, y: SCATTER_H - 4, 'text-anchor': 'middle', text: 'What the ronde-2 fit reads — market cap per dollar of TVL' }));
    svg.appendChild(svgn('text', { class: 'sc-axis', x: 12, y: PAD.t + ih / 2, 'text-anchor': 'middle', transform: 'rotate(-90 12 ' + (PAD.t + ih / 2) + ')', text: 'What the market recorded — market cap per dollar of TVL' }));
    svg.appendChild(svgn('text', { class: 'sc-diag-label', x: sx(Math.pow(10, hi)) - 6, y: sy(Math.pow(10, hi)) + 16, 'text-anchor': 'end', text: 'perfect read' }));

    host.appendChild(svg);

    var key = $('scatter-key');
    if (key) {
      clear(key);
      [
        ['sc-dot', SCATTER.length + ' comps, one dot each'],
        ['sc-dot sc-dot--high', 'read ×3 or more too high (' + count.above + ')'],
        ['sc-dot sc-dot--low', 'read ×3 or more too low (' + count.below + ')'],
        ['sc-band', 'inside a factor of three']
      ].forEach(function (k) {
        var sample = k[0].indexOf('sc-band') === 0 ? svgn('svg', { viewBox: '0 0 22 12', class: 'key-sample' }, [svgn('rect', { class: 'sc-band', x: 0, y: 0, width: 22, height: 12 })]) : svgn('svg', { viewBox: '0 0 22 12', class: 'key-sample' }, [svgn('circle', { class: k[0], cx: 11, cy: 6, r: 4 })]);
        key.appendChild(node('span', { class: 'key-item' }, [sample, node('span', { text: k[1] })]));
      });
    }

    var note = $('scatter-note');
    if (note) {
      clear(note);
      note.appendChild(node('span', { text: SCATTER.length + ' comps plotted, one dot each: ' + count.above + ' read ×3 or more too high, ' + count.below + ' ×3 or more too low, ' + count.within + ' inside a factor of three. Read in sample, at the record each token carried on the fit day; the columns below are the same ' + SCATTER.length + ' readings, worst miss first.' }));
    }

    var table = $('scatter-data');
    if (table) {
      clear(table);
      var rows = SCATTER.slice().sort(function (a, b) { return Math.max(b.read / b.actual, b.actual / b.read) - Math.max(a.read / a.actual, a.actual / a.read); });
      var head = node('thead', null, [node('tr', null, [node('th', { scope: 'col', text: 'Comp' }), node('th', { scope: 'col', text: 'Category' }), node('th', { scope: 'col', text: 'Read' }), node('th', { scope: 'col', text: 'Actual' }), node('th', { scope: 'col', text: 'Miss' })])]);
      var body = node('tbody');
      rows.forEach(function (p) {
        var miss = Math.max(p.read / p.actual, p.actual / p.read);
        body.appendChild(node('tr', null, [
          node('td', { text: p.slug }),
          node('td', { text: p.category || '—' }),
          node('td', { class: 'num', text: p.read < 1 ? p.read.toFixed(3) + '×' : x(p.read) }),
          node('td', { class: 'num', text: p.actual < 1 ? p.actual.toFixed(4) + '×' : x(p.actual) }),
          node('td', { class: 'num sc-miss', text: x(miss) })
        ]));
      });
      table.appendChild(head);
      table.appendChild(body);
    }
  }
  function decadeLabel(v) {
    var e = Math.round(Math.log10(v));
    var m = v / Math.pow(10, e);
    var base = m === 1 ? '1' : m.toFixed(1);
    return e === 0 ? '1' : e > 0 ? base + 'e' + e : base + 'e' + e;
  }

  // -----------------------------------------------------------------------------------------------
  // Ablation, fit card, splits, duel.
  // -----------------------------------------------------------------------------------------------

  function renderAblation() {
    var ol = $('ablation');
    if (!ol) return;
    clear(ol);
    var maxMiss = 5;
    VAL.ablation.forEach(function (a) {
      var li = node('li', { class: 'abl' });
      li.appendChild(node('div', { class: 'abl-head' }, [
        node('a', { class: 'abl-label', href: a.href || '#fit-eq', text: a.label }),
        node('b', { class: 'abl-miss', text: x(a.miss) })
      ]));
      var bar = node('div', { class: 'abl-track' }, [node('span', { class: 'abl-fill', style: '--v:' + (a.miss / maxMiss) })]);
      li.appendChild(bar);
      li.appendChild(node('p', { class: 'abl-note', text: 'Term out: median miss ' + x(a.miss) + ' · ' + (a.delta === 0 ? 'no change' : '+' + x(a.delta)) + ' against the whole fit — ' + a.note }));
      ol.appendChild(li);
    });
  }

  function renderFit() {
    var eq = $('fit-eq');
    var line = fitLine();
    var g = growthTerms();
    var cats = Array.isArray(MODEL.category) ? MODEL.category : [];
    var fams = Array.isArray(MODEL.family) ? MODEL.family : [];
    if (eq) {
      clear(eq);
      eq.appendChild(node('span', { class: 'eq-k', text: 'log cover' }));
      eq.appendChild(node('span', { class: 'eq-op', text: ' = ' }));
      var aNum = line.a < 0 ? '−' + Math.abs(line.a).toFixed(4) : line.a.toFixed(4);
      eq.appendChild(node('b', { text: aNum }));
      eq.appendChild(node('span', { class: 'eq-op', text: ' + ' }));
      eq.appendChild(node('b', { text: line.b < 0 ? '−' + Math.abs(line.b).toFixed(4) : line.b.toFixed(4) }));
      eq.appendChild(node('span', { class: 'eq-op', text: ' log TVL' }));
      eq.appendChild(node('span', { class: 'eq-op', text: ' + tilt(category)' }));
      eq.appendChild(node('span', { class: 'eq-op', text: ' + tilt(family)' }));
      eq.appendChild(node('span', { class: 'eq-op', text: ' + ' }));
      eq.appendChild(node('b', { text: (g.level < 0 ? '−' : '') + Math.abs(g.level).toFixed(4) }));
      eq.appendChild(node('span', { class: 'eq-op', text: g.slope < 0 ? ' − ' : ' + ' }));
      eq.appendChild(node('b', { text: Math.abs(g.slope).toFixed(4) }));
      eq.appendChild(node('span', { class: 'eq-op', text: ' g' }));
      eq.appendChild(node('span', { class: 'eq-op eq-hold', text: ' + 0 · record' }));
    }
    var why = $('fit-why');
    if (why) {
      clear(why);
      why.appendChild(node('span', { text: 'The record of days is dropped. On the ' + VAL.loo.n + ' comps it bought ' + x(0) + ' of held-out miss in the ablation below, so the fit stops charging for it; g is the seven-day change over 100, held inside ±1. Read in sample on its own ' + (MODEL.line && MODEL.line.n ? MODEL.line.n : 81) + ' comps the line misses by ' + x(VAL.inSampleMiss) + ' — the held-out columns above are the number that counts.' }));
    }
    var dl = $('fit-tilts');
    if (dl) {
      clear(dl);
      var catTop = cats.slice().sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); }).slice(0, 3);
      var famTop = fams.slice().sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); }).slice(0, 3);
      function tiltRow(term, value, n) {
        return node('div', { class: 'tilt' }, [
          node('dt', null, [node('span', { text: term }), node('small', { text: 'n ' + n })]),
          node('dd', null, [node('span', { class: 'tilt-bar ' + (value < 0 ? 'tilt-bar--neg' : 'tilt-bar--pos'), style: '--v:' + Math.min(1, Math.abs(value) / 1) }), node('b', { text: (value < 0 ? '−' : '+') + Math.abs(value).toFixed(3) + ' log' })])
        ]);
      }
      var groups = [
        ['Category', catTop, cats.length], ['Family', famTop, fams.length]
      ];
      groups.forEach(function (grp) {
        dl.appendChild(node('div', { class: 'tilt-group' }, [node('div', { class: 'tilt-group-head', text: grp[0] })]));
        if (!grp[1].length) {
          dl.appendChild(tiltRow('—', 0, 0));
          return;
        }
        grp[1].forEach(function (t) { dl.appendChild(tiltRow(t.key, t.value, t.n)); });
      });
      dl.appendChild(node('p', { class: 'tilt-foot', text: 'The ' + (cats.length || VAL.tilts.category) + ' named categories and ' + (fams.length || VAL.tilts.family) + ' families each carry a mean residual, shrunk by n/(n+prior); the three largest on each side are above.' }));
    }
  }

  function renderSplits() {
    var tb = $('splits-body');
    if (!tb) return;
    clear(tb);
    function row(label, sub, n, miss, within3, within2, bias, rho, cls) {
      var tr = node('tr', { class: cls || null });
      tr.appendChild(node('th', { scope: 'row' }, [node('span', { text: label }), sub ? node('small', { text: sub }) : null]));
      tr.appendChild(node('td', { class: 'num', text: String(n) }));
      tr.appendChild(node('td', { class: 'num strong', text: x(miss) }));
      tr.appendChild(node('td', { class: 'bar' }, [node('span', { class: 'bar-track' }, [node('span', { class: 'bar-fill', style: '--v:' + within3 })]), node('span', { class: 'bar-label', text: share(within3) })]));
      tr.appendChild(node('td', { class: 'num', text: within2 === undefined ? '—' : share(within2) }));
      tr.appendChild(node('td', { class: 'num', text: x(bias) }));
      tr.appendChild(node('td', { class: 'num', text: rho === undefined ? '—' : rho.toFixed(2) }));
      tb.appendChild(tr);
    }
    row('Leave-one-out', 'each comp priced by a fit without it', VAL.loo.n, VAL.loo.miss, VAL.loo.within3, VAL.loo.within2, VAL.loo.bias, undefined, 'split-main');
    row('Launch state', 'age 0, no growth: the board’s question', VAL.loo.n, VAL.launch.miss, VAL.launch.within3, VAL.launch.within2, 0.90, undefined);
    VAL.walkForward.splits.forEach(function (s) {
      row('Walk-forward from ' + s.day, 'fit ' + s.fit + ' · test ' + s.test, s.test, s.miss, s.within3, undefined, 1.03, s.rho);
    });
    var p = VAL.walkForward.pooled;
    row('Walk-forward, pooled', 'every walk-forward read together', p.n, p.miss, p.within3, p.within2, p.bias, undefined, 'split-total');
    var b = VAL.blind;
    row('Blind from ' + b.day, 'fit ' + b.fit + ' before the day · test ' + b.test + ' after', b.test, b.record.miss, b.record.within3, b.record.within2, b.record.bias, b.record.rho, 'split-total');
    row('Blind, launch state', 'the test tokens read as launches', b.test, b.record.launchMiss, b.record.launchWithin3, undefined, 0.82, undefined);
  }

  function renderDuel() {
    var host = $('duel');
    if (!host) return;
    clear(host);
    [
      ['Leave-one-out', VAL.ronde1.loo, VAL.loo.miss, 'the same ' + VAL.loo.n + ' comps'],
      ['Walk-forward, pooled', VAL.ronde1.walk, VAL.walkForward.pooled.miss, VAL.walkForward.pooled.n + ' reads over 3 splits'],
      ['Blind from ' + VAL.blind.day, VAL.ronde1.blind, VAL.blind.record.miss, VAL.blind.test + ' tokens after the cut']
    ].forEach(function (d) {
      var better = d[2] < d[1];
      var card = node('div', { class: 'duel-card' });
      card.appendChild(node('p', { class: 'duel-test', text: d[0] }));
      card.appendChild(node('p', { class: 'duel-pair' }, [
        node('span', { class: 'duel-r1' }, [node('small', { text: 'ronde 1' }), node('b', { text: x(d[1]) })]),
        node('span', { class: 'duel-arrow', 'aria-hidden': 'true', text: '→' }),
        node('span', { class: 'duel-r2' }, [node('small', { text: 'ronde 2' }), node('b', { text: x(d[2]) })])
      ]));
      card.appendChild(node('p', { class: 'duel-gap', text: (better ? '−' : '+') + x(Math.abs(d[2] - d[1])) + ' against ronde 1 · ' + d[3] }));
      host.appendChild(card);
    });
  }

  // -----------------------------------------------------------------------------------------------
  // The board: 198 rows from data.js, verdict segments, filters, sorts, pages, the detail sheet.
  // -----------------------------------------------------------------------------------------------

  var PAGE = 40;
  var FAMILY_LABEL = {};
  (DATA.careers || []).forEach(function (c) { FAMILY_LABEL[c.key] = c.label; });

  var state = { verdict: 'all', q: '', cohort: 'all', family: 'all', sort: 'rank', dir: 'asc', page: 0 };
  var counts = { Worth: 0, Marginal: 0, Skip: 0 };

  function familyName(k) {
    var label = FAMILY_LABEL[k];
    if (!label) return k || '—';
    return label.replace(/ and .*$/, '');
  }

  function renderCounts() {
    ROWS.forEach(function (r) { counts[r.farm.verdict] = (counts[r.farm.verdict] || 0) + 1; });
    var host = $('verdict-counts');
    if (host) {
      clear(host);
      host.appendChild(node('p', { class: 'vk-total' }, [node('b', { text: String(ROWS.length) }), node('span', { text: ' priced, each with a plan' })]));
      var list = node('ul', { class: 'vk-list' });
      ['Worth', 'Marginal', 'Skip'].forEach(function (v) {
        list.appendChild(node('li', { class: 'vk vk--' + verdictClass(v) }, [
          node('b', { text: String(counts[v] || 0) }),
          node('span', { text: v })
        ]));
      });
      host.appendChild(list);
    }
  }

  function renderSegs() {
    var host = $('verdict-segs');
    if (!host) return;
    clear(host);
    [['all', 'All', ROWS.length], ['Worth', 'Worth', counts.Worth || 0], ['Marginal', 'Marginal', counts.Marginal || 0], ['Skip', 'Skip', counts.Skip || 0]].forEach(function (s) {
      var b = node('button', {
        type: 'button', class: 'seg seg--' + (s[0] === 'all' ? 'all' : verdictClass(s[0])),
        'data-verdict': s[0], 'aria-pressed': state.verdict === s[0] ? 'true' : 'false'
      }, [
        node('span', { class: 'seg-name', text: s[1] }),
        node('span', { class: 'seg-n', text: String(s[2]) })
      ]);
      host.appendChild(b);
    });
  }
  function verdictName(v) {
    return v === 'Worth' ? 'Worth a position' : v === 'Marginal' ? 'Marginal' : 'Skip';
  }

  function familyOptions() {
    var sel = $('family');
    if (!sel) return;
    var seen = {};
    ROWS.forEach(function (r) { if (r.family) seen[r.family] = (seen[r.family] || 0) + 1; });
    var keys = Object.keys(seen).sort(function (a, b) { return seen[b] - seen[a] || collator.compare(a, b); });
    keys.forEach(function (k) {
      sel.appendChild(node('option', { value: k, text: familyName(k) + ' · ' + seen[k] }));
    });
  }

  function matches(r) {
    if (state.verdict !== 'all' && r.farm.verdict !== state.verdict) return false;
    if (state.family !== 'all' && (r.family || '') !== state.family) return false;
    if (state.cohort === 'watchlist' && !r.on_watchlist) return false;
    if (state.cohort === 'above floor' && !(r.tvl_usd >= META.floor_usd)) return false;
    if (state.cohort === 'below floor' && !(r.tvl_usd < META.floor_usd)) return false;
    if (state.q) {
      var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + familyName(r.family) + ' ' + (r.chains || []).join(' ')).toLowerCase();
      if (hay.indexOf(state.q) < 0) return false;
    }
    return true;
  }

  var SORTS = {
    rank: function (r) { return r.rank; },
    value: function (r) { return r.implied_value_usd; },
    tvl: function (r) { return r.tvl_usd; },
    cover: function (r) { return r.ratio_p50; },
    growth: function (r) { return r.change_7d === null || r.change_7d === undefined ? -Infinity : r.change_7d; },
    net: function (r) { return r.farm.net_usd; },
    name: function (r) { return r.name; }
  };
  var DEFAULT_DIR = { rank: 'asc', value: 'desc', tvl: 'desc', cover: 'desc', growth: 'desc', net: 'desc', name: 'asc' };

  function sortRows(rows) {
    var key = SORTS[state.sort] || SORTS.rank;
    var dir = state.dir === 'asc' ? 1 : -1;
    var out = rows.slice().sort(function (a, b) {
      var ka = key(a), kb = key(b);
      var c = typeof ka === 'string' ? collator.compare(ka, kb) : (ka - kb);
      if (c !== 0) return c * dir;
      return a.rank - b.rank;
    });
    return out;
  }

  function rowNode(r) {
    var tr = node('tr', { 'data-slug': r.slug, 'data-verdict': r.farm.verdict, class: r.on_watchlist ? 'row-watch' : null });
    tr.appendChild(node('td', { class: 'c-rank' }, [node('span', { class: 'rank', text: String(r.rank) })]));
    tr.appendChild(node('td', { class: 'c-proto' }, [
      node('button', { type: 'button', class: 'rname', 'data-open': r.slug, 'aria-haspopup': 'dialog' }, [
        r.on_watchlist ? node('span', { class: 'wl-dot', 'aria-label': 'on the watchlist' }) : null,
        node('span', { class: 'rname-name', text: r.name }),
        node('span', { class: 'rname-sub', text: (r.category || 'no category') + (r.chains && r.chains[0] ? ' · ' + r.chains[0] : '') })
      ])
    ]));
    tr.appendChild(node('td', { class: 'c-fam' }, [node('span', { class: 'fam', text: familyName(r.family) })]));
    tr.appendChild(node('td', { class: 'c-tvl num', text: usd(r.tvl_usd) }));
    tr.appendChild(node('td', { class: 'c-growth num' }, [
      node('span', { class: r.change_7d === null || r.change_7d === undefined ? 'muted' : r.change_7d >= 0 ? 'up' : 'down', text: pct(r.change_7d) })
    ]));
    tr.appendChild(node('td', { class: 'c-rec' }, [
      node('span', { class: 'rec', text: r.origin === 'counted' ? record(r.origin_days) : 'snapshot day' })
    ]));
    tr.appendChild(node('td', { class: 'c-cover num' }, [
      node('span', { class: 'cover-now', text: x(r.cover_now) }),
      node('span', { class: 'cover-sep', text: ' · ' }),
      node('b', { class: 'cover-imp', text: x(r.ratio_p50) })
    ]));
    tr.appendChild(node('td', { class: 'c-value num' }, [node('b', { class: 'valuation', text: usd(r.implied_value_usd) }), node('small', { class: 'valuation-band', text: usd(r.implied_value_low_usd) + ' – ' + usd(r.implied_value_high_usd) })]));
    var net = r.farm.net_usd;
    tr.appendChild(node('td', { class: 'c-net num' }, [
      node('b', { class: net > 0 ? 'up' : net < 0 ? 'down' : 'muted', text: usd(net) }),
      node('small', { class: 'net-odds', text: Math.round((r.farm.chance || 0) * 100) + '% odds · ' + share(Math.max(0, r.farm.break_even || 0), 0) + ' needed' })
    ]));
    tr.appendChild(node('td', { class: 'c-plan' }, [node('span', { class: 'tag tag--' + verdictClass(r.farm.verdict), text: r.farm.verdict })]));
    return tr;
  }

  var filtered = [];
  function applyFilters() {
    filtered = sortRows(ROWS.filter(matches));
    renderPage();
    renderResult();
  }

  function renderPage() {
    var tb = $('rows');
    if (!tb) return;
    clear(tb);
    var pages = Math.max(1, Math.ceil(filtered.length / PAGE));
    if (state.page >= pages) state.page = pages - 1;
    if (state.page < 0) state.page = 0;
    var slice = filtered.slice(state.page * PAGE, state.page * PAGE + PAGE);
    var frag = document.createDocumentFragment();
    slice.forEach(function (r) { frag.appendChild(rowNode(r)); });
    tb.appendChild(frag);
    var prev = $('prev'), next = $('next'), info = $('pageinfo');
    if (prev) prev.disabled = state.page <= 0;
    if (next) next.disabled = state.page >= pages - 1;
    if (info) {
      var from = filtered.length ? state.page * PAGE + 1 : 0;
      var to = Math.min(filtered.length, (state.page + 1) * PAGE);
      info.textContent = 'Rows ' + from + '–' + to + ' of ' + filtered.length + ' · page ' + (state.page + 1) + ' of ' + pages;
    }
  }

  function renderResult() {
    var out = $('filter-result');
    if (!out) return;
    clear(out);
    var parts = [];
    if (state.verdict !== 'all') parts.push(verdictName(state.verdict));
    if (state.family !== 'all') parts.push(familyName(state.family));
    if (state.cohort !== 'all') parts.push(state.cohort === 'watchlist' ? 'watchlist' : 'TVL ' + state.cohort);
    if (state.q) parts.push('“' + state.q + '”');
    out.appendChild(node('b', { text: String(filtered.length) }));
    out.appendChild(node('span', { text: filtered.length === ROWS.length ? ' rows — the whole board' : ' of ' + ROWS.length + ' rows' + (parts.length ? ' · ' + parts.join(' · ') : '') }));
  }

  function setSort(key, flipped) {
    if (!SORTS[key]) return;
    var was = state.sort;
    state.sort = key;
    if (key === 'rank') state.dir = 'asc';
    else if (flipped && was === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    else state.dir = DEFAULT_DIR[key];
    state.page = 0;
    var table = document.querySelector('table.board');
    if (table) {
      table.querySelectorAll('th[data-sort]').forEach(function (th) {
        if (th.getAttribute('data-sort') === key) th.setAttribute('aria-sort', state.dir === 'asc' ? 'ascending' : 'descending');
        else th.removeAttribute('aria-sort');
      });
    }
    var sel = $('sort');
    if (sel && sel.value !== key) sel.value = key;
    applyFilters();
  }

  function reset() {
    state = { verdict: 'all', q: '', cohort: 'all', family: 'all', sort: 'rank', dir: 'asc', page: 0 };
    var q = $('q'); if (q) q.value = '';
    var cohort = $('cohort'); if (cohort) cohort.value = 'all';
    var family = $('family'); if (family) family.value = 'all';
    var sort = $('sort'); if (sort) sort.value = 'rank';
    renderSegs();
    setSort('rank', false);
  }

  function wireBoard() {
    var segs = $('verdict-segs');
    if (segs) segs.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-verdict]');
      if (!b) return;
      state.verdict = b.getAttribute('data-verdict');
      state.page = 0;
      renderSegs();
      applyFilters();
    });
    var q = $('q');
    if (q) q.addEventListener('input', function () {
      state.q = q.value.trim().toLowerCase();
      state.page = 0;
      applyFilters();
    });
    var cohort = $('cohort');
    if (cohort) cohort.addEventListener('change', function () {
      state.cohort = cohort.value;
      state.page = 0;
      applyFilters();
    });
    var family = $('family');
    if (family) family.addEventListener('change', function () {
      state.family = family.value;
      state.page = 0;
      applyFilters();
    });
    var sort = $('sort');
    if (sort) sort.addEventListener('change', function () {
      state.dir = '';
      setSort(sort.value, false);
    });
    var table = document.querySelector('table.board');
    if (table) table.querySelector('thead').addEventListener('click', function (e) {
      var b = e.target.closest('th[data-sort] button');
      if (!b) return;
      var th = b.closest('th');
      setSort(th.getAttribute('data-sort'), true);
    });
    var prev = $('prev');
    if (prev) prev.addEventListener('click', function () { if (state.page > 0) { state.page -= 1; renderPage(); } });
    var next = $('next');
    if (next) next.addEventListener('click', function () { if (state.page < Math.ceil(filtered.length / PAGE) - 1) { state.page += 1; renderPage(); } });
    var resetBtn = $('reset');
    if (resetBtn) resetBtn.addEventListener('click', reset);

    var rows = $('rows');
    if (rows) rows.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-open]');
      if (!b) return;
      openSheet(b.getAttribute('data-open'), b);
    });
  }

  // -----------------------------------------------------------------------------------------------
  // A name opens its arithmetic: cohort, terms, the plan's money, the week-by-week steps.
  // -----------------------------------------------------------------------------------------------

  var sheet = null;
  var lastFocus = null;

  function openSheet(slug, opener) {
    var r = ROWS.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return;
    lastFocus = opener || document.activeElement;
    var host = $('sheet-inner');
    if (!host) return;
    clear(host);
    var verdict = r.farm.verdict;
    var head = node('header', { class: 'sheet-head' });
    head.appendChild(node('div', { class: 'sheet-id' }, [
      node('p', { class: 'sheet-kicker', text: 'Rank ' + r.rank + ' of ' + ROWS.length + ' · ' + (r.cohort || 'board') + (r.on_watchlist ? ' · watchlist' : '') }),
      node('h2', { id: 'sheet-name', text: r.name }),
      node('p', { class: 'sheet-meta', text: [r.category, familyName(r.family), (r.chains || []).slice(0, 3).join(', ')].filter(Boolean).join(' · ') })
    ]));
    head.appendChild(node('div', { class: 'sheet-side' }, [
      node('span', { class: 'tag tag--' + verdictClass(verdict), text: verdict }),
      node('button', { type: 'button', class: 'sheet-close', 'aria-label': 'Close', 'data-close': '1', text: '×' })
    ]));
    host.appendChild(head);
    var body = node('div', { class: 'sheet-body' });
    var t = rowTerms(r);

    var kpis = node('dl', { class: 'sheet-kpis' });
    [
      ['TVL', usd(r.tvl_usd), (r.chains || []).length + ' chains'],
      ['7-day', pct(r.change_7d), r.growth_state === 'reported' ? 'reported' : 'unreported, read 0'],
      ['Cover now', x(r.cover_now), 'market cap ÷ TVL today'],
      ['Implied cover', x(r.ratio_p50), 'one year past listing'],
      ['Implied value', usd(r.implied_value_usd), usd(r.implied_value_low_usd) + ' – ' + usd(r.implied_value_high_usd)],
      ['Net if launch', usd(r.farm.net_usd), r.farm.per_hour_usd >= 0 ? '$' + Math.round(r.farm.per_hour_usd) + '/h' : '−$' + Math.abs(Math.round(r.farm.per_hour_usd)) + '/h']
    ].forEach(function (k) {
      kpis.appendChild(node('div', { class: 'skpi' }, [node('dt', { text: k[0] }), node('dd', { text: k[1] }), node('small', { text: k[2] })]));
    });
    body.appendChild(kpis);

    // The arithmetic, term by term, in logs — the same sum radar.js re-ran to price the row.
    var math = node('section', { class: 'sheet-arithmetic' });
    math.appendChild(node('h3', { text: 'How the cover was read' }));
    var chainList = node('ol', { class: 'chain-list' });
    [
      ['Line at its size', 'a + b log TVL', t.logLine],
      ['Category', r.category || '—', t.category],
      ['Family', familyName(r.family), t.family],
      ['Growth', pct(r.change_7d), t.growth],
      ['Record', 'dropped in ronde 2', t.hold]
    ].forEach(function (c) {
      chainList.appendChild(node('li', null, [
        node('span', { class: 'op', text: c[0] }), node('span', { class: 'op-key', text: c[1] }),
        node('b', { class: 'op-val', text: (c[2] < 0 ? '−' : c[2] > 0 ? '+' : '') + Math.abs(c[2]).toFixed(3) + ' log' })
      ]));
    });
    chainList.appendChild(node('li', { class: 'chain-total' }, [
      node('span', { class: 'op', text: 'Log cover' }), node('span', { class: 'op-key', text: 'sum' }),
      node('b', { class: 'op-val', text: t.sum.toFixed(3) }),
      node('span', { class: 'chain-out', text: x(Math.exp(t.sum)) })
    ]));
    chainList.appendChild(node('li', { class: 'chain-total' }, [
      node('span', { class: 'op', text: 'Implied value' }), node('span', { class: 'op-key', text: usd(r.tvl_usd) + ' × cover' }),
      node('b', { class: 'op-val', text: usd(r.implied_value_usd) })
    ]));
    math.appendChild(chainList);
    math.appendChild(node('p', { class: 'arith-check', text: 'Repriced in the page from the same terms: ' + usd(reprice(r)) + (reprice(r) === r.implied_value_usd ? ' — matches data.js to the dollar.' : ' — ' + (reprice(r) - r.implied_value_usd) + ' dollars off data.js.') }));
    body.appendChild(math);

    // The plan's money.
    var money = node('section', { class: 'sheet-money' });
    money.appendChild(node('h3', { text: 'The plan’s money, as read' }));
    var moneyTable = node('table', { class: 'mini' });
    var mtb = node('tbody');
    [
      ['Capital put in', usd(r.farm.capital_usd)],
      ['Basis read at', usd(r.farm.basis_usd) + ' (' + x(r.farm.basis_x) + ' the deposit)'],
      ['Gross on a launch', usd(r.farm.gross_usd)],
      ['Cost of the window', usd(r.farm.cost_usd) + ' — gas ' + usd(r.farm.gas_usd) + ', time ' + usd(r.farm.time_cost_usd) + ', exit ' + usd(r.farm.exit_usd)],
      ['Launch odds on the record', Math.round((r.farm.chance || 0) * 100) + '%'],
      ['Window', r.farm.days + ' days · ' + r.farm.hours + ' h'],
      ['Net if it launches', usd(r.farm.net_usd)],
      ['Per hour', usd(r.farm.per_hour_usd)]
    ].forEach(function (m) { mtb.appendChild(node('tr', null, [node('th', { scope: 'row', text: m[0] }), node('td', { class: 'num', text: m[1] })])); });
    moneyTable.appendChild(mtb);
    money.appendChild(moneyTable);
    money.appendChild(node('p', { class: 'sheet-why', text: r.farm.reason }));
    body.appendChild(money);

    var steps = node('section', { class: 'sheet-steps' });
    steps.appendChild(node('h3', { text: 'The plan, step by step' }));
    var ol = node('ol', { class: 'steps' });
    r.farm_steps.forEach(function (s, i) {
      ol.appendChild(node('li', { 'data-phase': i >= r.farm_steps.length - 2 ? 'after' : null }, [node('p', { text: s })]));
    });
    steps.appendChild(ol);
    body.appendChild(steps);
    host.appendChild(body);

    if (!sheet) sheet = $('sheet');
    if (sheet) {
      if (typeof sheet.showModal === 'function' && !sheet.open) sheet.showModal();
      else sheet.setAttribute('open', '');
      var inner = $('sheet-inner');
      if (inner) inner.scrollTop = 0;
      var close = host.querySelector('[data-close]');
      if (close) close.focus();
    }
  }

  function closeSheet() {
    if (!sheet || !sheet.open) return;
    sheet.close();
  }

  function wireSheet() {
    sheet = $('sheet');
    if (!sheet) return;
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet || e.target.closest('[data-close]')) closeSheet();
    });
    sheet.addEventListener('close', function () {
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    });
  }

  // -----------------------------------------------------------------------------------------------
  // Accounting, colophon.
  // -----------------------------------------------------------------------------------------------

  function renderAcct() {
    var host = $('acct');
    if (!host) return;
    clear(host);
    var C = DATA.coverage || {};
    var cells = [
      ['Snapshot', String(META.protocols || 0), 'protocols in the sealed file of ' + (META.as_of || '—')],
      ['On the board', String(ROWS.length), (C.watch_ranked || 0) + ' of ' + (C.watchlist || META.watchlist || 0) + ' watchlist names · ' + (C.ranked_above_floor || 0) + ' at or above the ' + usd(META.floor_usd) + ' floor'],
      ['Traded, set aside', String(C.traded_set_aside || 0), 'carry a token already; the board prices what has none'],
      ['Early, left out', String(C.early_left_out || 0), 'pre-token, but outside the one-year read: no listing day or under the floor'],
      ['Comps the fit learned on', String((DATA.validation && DATA.validation.coverage && DATA.validation.coverage.comps) || VAL.loo.n), 'traded tokens listed a year before the snapshot']
    ];
    cells.forEach(function (c) {
      host.appendChild(node('div', { class: 'acct-cell' }, [
        node('p', { class: 'acct-label', text: c[0] }),
        node('p', { class: 'acct-n', text: c[1] }),
        node('p', { class: 'acct-note', text: c[2] })
      ]));
    });
  }

  function renderColophon() {
    var out = $('colophon');
    if (!out) return;
    clear(out);
    out.appendChild(node('span', { text: 'Launch Radar, ronde 2 · snapshot ' + (META.as_of || '—') + ' · ' + ROWS.length + ' rows priced · held-out miss ' + x(VAL.loo.miss) + ' (leave-one-out), ' + x(VAL.walkForward.pooled.miss) + ' (walk-forward), ' + x(VAL.blind.record.miss) + ' (blind) · ' }));
    out.appendChild(node('a', { href: '#valid', text: 'the validation, at the top' }));
    out.appendChild(node('span', { text: ' · figures from scripts/validate2.ts; the board from data.js.' }));
  }

  // -----------------------------------------------------------------------------------------------
  // Boot.
  // -----------------------------------------------------------------------------------------------

  function init() {
    renderMast();
    renderHeadline();
    renderScatter();
    renderAblation();
    renderFit();
    renderSplits();
    renderDuel();
    renderCounts();
    renderSegs();
    familyOptions();
    wireBoard();
    wireSheet();
    applyFilters();
    renderAcct();
    renderColophon();
    factSweep();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
