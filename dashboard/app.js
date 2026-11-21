// Launch Radar ronde 3 — the page's only script. It reads globalThis.LAUNCH_RADAR (zdata.js,
// written beside it by main.ts) and draws every figure from it: the held-out record, the 198-row
// board with its filters, sorts and pager, the scatter and ablation, and the detail sheet a name
// opens. Nothing on the page is a typed-in figure: the farm steps are rebuilt here from each row's
// own economics and the career table, with the same numbers board.json carries.
const D = globalThis.LAUNCH_RADAR;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function usd(x) { const n = Math.abs(x), s = x < 0 ? '-' : ''; if (n >= 1e12) return s + '$' + (n / 1e12).toFixed(2) + 'T'; if (n >= 1e9) return s + '$' + (n / 1e9).toFixed(2) + 'B'; if (n >= 1e6) return s + '$' + (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M'; if (n >= 1e3) return s + '$' + (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k'; return s + '$' + Math.round(n); }
function span(d) { if (d < 1.5) return Math.max(1, Math.round(d * 24)) + ' h'; if (d < 45) return Math.round(d) + ' days'; if (d < 400) return (d / 30.44).toFixed(1) + ' months'; return (d / 365.25).toFixed(1) + ' years'; }
function pct1(x) { if (x <= 0) return '0%'; if (x < 0.0005) return '<0.1%'; return (x * 100).toFixed(1) + '%'; }
const V = ['Worth', 'Marginal', 'Skip'];
// Row tuple: [name, cat, fam, chain, chain2, tvlK, chg, age, coverX, valueK, verdict, net, perHour, odds, be, capital, gas, days, hours10, cost, basisK, watch, terms]
const R = D.rows.map((a, i) => ({ i, rank: i + 1, name: a[0], cat: a[1] < 0 ? null : D.cats[a[1]], fam: a[2] < 0 ? null : D.fams[a[2]], chain: a[3] < 0 ? 'its main network' : D.chains[a[3]], chain2: a[4] < 0 ? null : D.chains[a[4]], tvl: a[5] * 1000, chg: a[6], age: a[7], cover: a[8] / 1e6, value: a[9] * 1000, verdict: a[10], net: a[11], perHour: a[12], odds: a[13], be: a[14] / 1000, capital: a[15], gas: a[16], days: a[17], hours: a[18] / 10, cost: a[19], basis: a[20] * 1000, watch: a[21] === 1, terms: a[22] }));
function career(r) { const k = r.cat ? r.cat.trim().split(/\s+/)[0].toLowerCase() : 'generic'; return [k, D.careers[k] || D.careers.generic]; }
function share(a, tvl) { const p = (a / tvl) * 100; return p >= 0.01 ? p.toFixed(2) + '%' : p >= 0.001 ? p.toFixed(3) + '%' : 'under 0.001%'; }
function reason(r, gross) {
  const S = D.slice, be = pct1(r.be) + ' launch odds';
  if (r.net <= 0) return 'a launch at the ' + usd(r.basis) + ' floor pays ' + usd(gross) + ' against ' + usd(r.cost) + ' of cost, so the net is ' + usd(r.net) + ' and no odds clear it';
  if (r.perHour < S[10]) return 'the net is only ' + usd(r.net) + ', or ' + usd(r.perHour) + ' an hour against ' + usd(S[8]) + ' of the reader\'s time, and it needs ' + be + ' where the record reads ' + r.odds + '%';
  if (r.perHour < S[9]) return 'the net clears the cost at ' + usd(r.net) + ', but ' + usd(r.perHour) + ' an hour is under the ' + usd(S[9]) + ' the hour is worth; it needs ' + be + ' against ' + r.odds + '% on the record';
  if (r.be > S[12]) return 'the net is ' + usd(r.net) + ', but it needs ' + be + ' to clear ' + usd(r.cost) + ', past the ' + Math.round(S[12] * 100) + '% the record affords, against ' + r.odds + '% on the record';
  if (r.be > S[11]) return 'the net is ' + usd(r.net) + ' and ' + usd(r.perHour) + ' an hour, but it needs ' + be + ', past the board\'s best ' + Math.round(S[11] * 100) + '%, against ' + r.odds + '% on the record';
  return 'a launch at the floor nets ' + usd(r.net) + ', or ' + usd(r.perHour) + ' an hour, and needs ' + be + ' against ' + r.odds + '% on the record';
}
function steps(r) {
  const S = D.slice, [key, c] = career(r), [label, action, routine, risk, lock] = c;
  const legs = (key === 'bridge' || key === 'chain') ? 4 : 2;
  const idle = r.capital * S[2] * (r.days / 365.25), exit = r.capital * S[3] / 10000, wallet = r.gas + idle + exit, time = r.hours * S[8], gross = r.basis * S[5];
  const rec = r.age === null ? 'No listing day is on record, so the radar dates this protocol from the snapshot (' + D.meta[0] + ') and prices it at the one-year horizon: ' + usd(r.value) + ' centrally, ' + usd(r.basis) + ' at the band\'s low end.'
    : 'DefiLlama has counted ' + r.name + ' for ' + span(r.age) + ' without a token on record, which the radar prices at ' + usd(r.value) + ' one year after its listing day: ' + usd(r.basis) + ' at the band\'s low end.';
  const gro = r.chg === null ? 'The snapshot reports no seven-day change, so the growth term is flat and the odds rest on the record alone: ' + r.odds + '% over ' + span(r.days) + '.'
    : Math.abs(r.chg) < 0.05 ? 'TVL is flat over seven days; with the record that puts launch odds at ' + r.odds + '% over ' + span(r.days) + '.'
    : 'TVL is ' + (r.chg > 0 ? 'up' : 'down') + ' ' + Math.abs(r.chg).toFixed(1) + '% in seven days; with the record that puts launch odds at ' + r.odds + '% over ' + span(r.days) + '.';
  return [rec,
    'Its TVL is ' + usd(r.tvl) + ' on ' + r.chain + (r.chain2 ? ' and ' + r.chain2 : '') + ', so a ' + usd(r.capital) + ' deposit is ' + share(r.capital, r.tvl) + ' of its TVL: small enough to stay in through a bad week.',
    'Fund a wallet on ' + r.chain + ' with ' + usd(r.capital) + ' alone, and keep it apart from a long-term bag so the exit is one transaction; gas on ' + (legs + 1) + ' legs, the practice deposit included, costs about ' + usd(r.gas) + '.',
    'On ' + r.chain + ', ' + action.charAt(0).toLowerCase() + action.slice(1) + '; that balance is the campaign\'s whole position.',
    gro + ' A launch at the band floor pays about ' + usd(gross) + ' on that deposit, before ' + usd(wallet) + ' of gas, yield given up and exit.',
    'The window is ' + span(r.days) + ' of work at ' + S[4] + ' h a week: ' + routine.charAt(0).toLowerCase() + routine.slice(1) + '; at ' + usd(S[8]) + ' an hour that time is worth ' + usd(time) + ', and the plan is read with it counted.',
    'The deposit earns nothing here that it would not earn idle: at ' + (S[2] * 100).toFixed(1) + '% a year it gives up ' + usd(idle) + ' over the window, which a genuine position should beat before its token is counted.',
    'Before the first deposit, read this lock: ' + lock + ' The main risk is this: ' + risk.toLowerCase() + '; if it happens, exit at once and write the plan off rather than adding to it.',
    'On day ' + r.days + ', withdraw and route out on ' + r.chain + ' for about ' + usd(exit) + ' of exit cost: a near miss pays nothing, so the plan needs ' + pct1(r.be) + ' launch odds against ' + r.odds + '% on the record, and the verdict is ' + V[r.verdict] + ': ' + reason(r, gross) + '.'];
}
// Masthead, proof cards, tally.
const tally = [0, 0, 0]; R.forEach((r) => tally[r.verdict]++);
$('#mast-nums').innerHTML = [['rows', R.length], ['watchlist', D.coverage[1] + '/' + D.coverage[0]], ['worth', tally[0]], ['comps', D.validation.rec[0]]].map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('');
$('#board-title').textContent = R.length + ' pre-token protocols, priced';
$('#board-sub').textContent = 'Ranked by implied value one year past each listing day — TVL × implied cover, with the cover read by the fit below at the protocol\'s category, family, chain, seven-day growth and record. A name opens its arithmetic, its cohort and its whole plan.';
$('#tally').innerHTML = ['Worth', 'Marginal', 'Skip'].map((v, i) => '<span><b>' + tally[i] + '</b> ' + v + '</span>').join('');
const v = D.validation, wf = v.later.reduce((a, s) => [a[0] + s[1], a[1] + s[1] * s[3]], [0, 0]);
const cards = [
  ['Leave-one-out', (v.rec[6] * 100).toFixed(1) + '%', v.rec[0] + ' comps', 'Each comp priced by a fit that never saw it, at its own record.'],
  ['Tested blind', v.blind ? (v.blind[2] * 100).toFixed(1) + '%' : '—', v.blind ? v.blind[1] + ' tokens' : '', 'Fit on tokens listed before 2024, tested on tokens listed from 2024 on.'],
  ['Later listings', (wf[1] / wf[0] * 100).toFixed(1) + '%', wf[0] + ' tests', 'Fits on earlier listings price every token listed after each split.']];
$('#proof').innerHTML = cards.map(([t, x, n, p]) => '<li><span>' + t + '</span><b>' + x + '</b><p>' + p + '</p><div class="bar"><i style="width:' + parseFloat(x) + '%"></i></div><p>' + n + ' · within 3×</p></li>').join('');
// KPI strip: the small evidence numbers, under the masthead — the median miss among them, as one
// figure in the strip, never as a headline. Best $/h is the board's best plan, not a typed claim.
const bestHour = Math.max(...R.map((r) => r.perHour));
$('#kpi').innerHTML = [['LOO median miss', '×' + v.rec[7].toFixed(2)], ['within 3×', (v.rec[6] * 100).toFixed(1) + '%'], ['blind within 3×', v.blind ? (v.blind[2] * 100).toFixed(1) + '%' : '—'], ['launch median miss', '×' + v.launch[7].toFixed(2)], ['best $/h', usd(bestHour)], ['accounted', D.acct[0] + '']].map(([k, x]) => '<div><dt>' + k + '</dt><dd>' + x + '</dd></div>').join('');
// Board: filter, sort, page.
const st = { verdict: '', q: '', cohort: '', fam: '', sort: 'rank', page: 0 };
const PAGE = 15;
const famSel = $('#family'); D.fams.forEach((f) => { const o = document.createElement('option'); o.value = f; o.textContent = f; famSel.appendChild(o); });
const segs = $('#verdict-segs');
segs.innerHTML = '<button type="button" data-v="" aria-pressed="true">All ' + R.length + '</button>' + ['Worth', 'Marginal', 'Skip'].map((x, i) => '<button type="button" data-v="' + i + '" aria-pressed="false">' + x + ' ' + tally[i] + '</button>').join('');
segs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.verdict = b.dataset.v; st.page = 0; segs.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); });
$('#q').addEventListener('input', (e) => { st.q = e.target.value.toLowerCase(); st.page = 0; draw(); });
$('#cohort').addEventListener('change', (e) => { st.cohort = e.target.value; st.page = 0; draw(); });
$('#family').addEventListener('change', (e) => { st.fam = e.target.value; st.page = 0; draw(); });
$('#sort').addEventListener('change', (e) => { st.sort = e.target.value; st.page = 0; draw(); });
$('#reset').addEventListener('click', () => { Object.assign(st, { verdict: '', q: '', cohort: '', fam: '', sort: 'rank', page: 0 }); $('#q').value = ''; $('#cohort').value = ''; $('#family').value = ''; $('#sort').value = 'rank'; segs.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-pressed', String(i === 0))); draw(); });
$('#prev').addEventListener('click', () => { if (st.page > 0) { st.page--; draw(); } });
$('#next').addEventListener('click', () => { st.page++; draw(); });
function filtered() {
  let out = R.filter((r) => (st.verdict === '' || r.verdict === +st.verdict)
    && (st.q === '' || (r.name + ' ' + (r.cat || '') + ' ' + r.chain).toLowerCase().includes(st.q))
    && (st.cohort === '' || (st.cohort === 'watchlist' ? r.watch : st.cohort === 'below floor' ? r.tvl < D.meta[1] : r.tvl >= D.meta[1]))
    && (st.fam === '' || r.fam === st.fam));
  const by = { rank: (a, b) => a.rank - b.rank, value: (a, b) => b.value - a.value, tvl: (a, b) => b.tvl - a.tvl, net: (a, b) => b.net - a.net, cover: (a, b) => b.cover - a.cover }[st.sort];
  return out.sort(by);
}
function draw() {
  const list = filtered(), pages = Math.max(1, Math.ceil(list.length / PAGE));
  if (st.page >= pages) st.page = pages - 1;
  const slice = list.slice(st.page * PAGE, st.page * PAGE + PAGE);
  $('#rows').innerHTML = slice.map((r) => '<tr><td>' + r.rank + '</td><td><span class="name"><button type="button" data-open="' + r.i + '">' + esc(r.name) + '</button></span>' + (r.cat ? '<span class="cat">' + esc(r.cat) + ' · ' + esc(r.chain) + '</span>' : '') + (r.watch ? ' <span class="watch">● watchlist</span>' : '') + '</td><td>' + esc(r.fam || '—') + '</td><td class="num">' + usd(r.tvl) + '</td><td class="num">' + (r.chg === null ? 'unreported' : (r.chg > 0 ? '+' : '') + r.chg.toFixed(1) + '%') + '</td><td>' + (r.age === null ? 'snapshot day' : span(r.age)) + '</td><td class="num">' + r.cover.toFixed(3) + '×</td><td class="num"><b>' + usd(r.value) + '</b><br><span class="muted">' + usd(r.value * Math.exp(-D.meta[7])) + ' – ' + usd(r.value * Math.exp(D.meta[7])) + '</span></td><td class="num">' + usd(r.net) + '<br><span class="muted">' + r.odds + '% odds · ' + pct1(r.be) + ' needed</span></td><td><span class="pill ' + ['w', 'm', 's'][r.verdict] + '">' + V[r.verdict].toUpperCase() + '</span></td></tr>').join('');
  $('#pageinfo').textContent = 'page ' + (st.page + 1) + ' of ' + pages + ' · ' + list.length + ' rows';
  $('#filter-result').textContent = list.length + ' of ' + R.length + ' rows' + (st.verdict !== '' ? ' · ' + V[+st.verdict] + ' a position' : '');
  $('#prev').disabled = st.page === 0; $('#next').disabled = st.page >= pages - 1;
}
document.addEventListener('click', (e) => { const b = e.target.closest('button[data-open]'); if (b) openSheet(R[+b.dataset.open]); });
// Model section.
const M = D.model;
$('#model-line').innerHTML = 'log cover = ' + M[0].toFixed(3) + ' + ' + M[1].toFixed(3) + ' log(TVL) + category + family + chain + ' + M[2].toFixed(3) + ' + ' + M[3].toFixed(3) + ' × growth + ' + M[4].toFixed(3) + ' + ' + M[5].toFixed(3) + ' log(1 + age). Fitted on ' + v.rec[0] + ' traded tokens with a cover; rank correlation with the recorded covers ' + v.rank.toFixed(2) + '.';
const TERMS = [['line', 'Line on TVL', 'what a dollar of TVL pays at this size'], ['category', 'Category, family and chain', 'a peer mean residual, shrunk by n/(n+3) and n/(n+6)'], ['growth', 'Growth', 'the seven-day change as a cover tilt'], ['hold', 'Record', 'what the years since the listing day add']];
$('#ablation').innerHTML = v.abl.map(([t, rm, dr, lm, dl]) => { const L = TERMS.find(([k]) => k === t); return '<li><span><b>' + L[1] + '</b> — ' + L[2] + '</span><b>' + (dr >= 0 ? '+' : '') + dr.toFixed(2) + '×</b></li>'; }).join('');
$('#splits-body').innerHTML = v.later.map(([f, n, c, w]) => '<tr><td>' + f + '</td><td class="num">' + n + '</td><td class="num">' + (w * 100).toFixed(1) + '%</td><td class="num">' + c.toFixed(2) + '</td></tr>').join('');
$('#duel').textContent = 'All numbers are computed from the snapshot by the program that wrote this page; nothing is typed in.';
// Every protocol accounted for: priced, traded (and why each traded token did or did not anchor
// the fit), and set aside with its reason — nothing in the snapshot is left uncounted.
const A = D.acct, left = A[7] + A[8] + A[9] + A[10] + A[11];
$('#acct').textContent = A[0] + ' protocols accounted for: ' + A[1] + ' priced on this board · ' + A[2] + ' traded — ' + A[3] + ' anchor the fit, ' + A[4] + ' listed under a year, ' + A[5] + ' outside the fit\'s bounds, ' + A[6] + ' with no market cap on record · ' + left + ' set aside as not launchable: ' + A[7] + ' sheets, ' + A[8] + ' bridges, ' + A[9] + ' wrapped or staked, ' + A[10] + ' versioned, ' + A[11] + ' exchange sheets.';
// Scatter: read cover (x) against recorded cover (y), log scales, diagonal exact.
(function () {
  const pts = v.points.map(([a, b]) => [a / 1e6, b / 1e6]).filter(([a, b]) => a > 0 && b > 0);
  const W = 560, H = 360, P = 44, xs = pts.map((p) => Math.log10(p[0])), ys = pts.map((p) => Math.log10(p[1]));
  const lo = Math.floor(Math.min(...xs, ...ys)), hi = Math.ceil(Math.max(...xs, ...ys));
  const X = (x) => P + ((x - lo) / (hi - lo)) * (W - 2 * P), Y = (y) => H - P - ((y - lo) / (hi - lo)) * (H - 2 * P);
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Scatter of read cover against recorded cover for 81 comps">';
  s += '<line x1="' + X(lo) + '" y1="' + Y(lo) + '" x2="' + X(hi) + '" y2="' + Y(hi) + '" stroke="#8a8175" stroke-dasharray="4 3"/>';
  for (let t = lo; t <= hi; t++) { s += '<text x="' + (X(t) - 4) + '" y="' + (H - P + 16) + '" font-size="10" fill="#8a8175" text-anchor="middle">10^' + t + '</text><text x="' + (P - 8) + '" y="' + (Y(t) + 3) + '" font-size="10" fill="#8a8175" text-anchor="end">10^' + t + '</text>'; }
  s += '<text x="' + (W / 2) + '" y="' + (H - 8) + '" font-size="11" fill="#4a443c" text-anchor="middle">read cover</text><text x="12" y="' + (H / 2) + '" font-size="11" fill="#4a443c" text-anchor="middle" transform="rotate(-90 12 ' + (H / 2) + ')">recorded cover</text>';
  for (const [a, b] of pts) s += '<circle cx="' + X(Math.log10(a)).toFixed(1) + '" cy="' + Y(Math.log10(b)).toFixed(1) + '" r="3" fill="#0f766e" fill-opacity="0.75"/>';
  s += '</svg>';
  $('#scatter').insertAdjacentHTML('afterbegin', s);
})();
// Detail sheet.
function openSheet(r) {
  const S = D.slice, [key, c] = career(r), [label, action] = c;
  const gross = r.basis * S[5], t = r.terms, names = ['Line at its size', 'Category', 'Family', 'Chain', 'Growth', 'Record'];
  const rows = names.map((n, i) => '<tr><td>' + n + '</td><td>' + (i === 0 ? 'a + b log TVL' : i === 1 ? (r.cat || '—') : i === 2 ? (r.fam || '—') : i === 3 ? r.chain : i === 4 ? (r.chg === null ? 'unreported' : r.chg.toFixed(1) + '%') : 'record term') + '</td><td>' + t[i].toFixed(2) + ' log</td></tr>').join('');
  const sum = t.reduce((a, b) => a + b, 0);
  $('#sheet-body').innerHTML = '<p class="kicker">Rank ' + r.rank + ' of ' + R.length + ' · ' + (r.watch ? 'watchlist' : (r.tvl >= D.meta[1] ? 'above floor' : 'below floor')) + '</p><h2 id="sheet-name">' + esc(r.name) + '</h2><p class="muted">' + esc(r.cat || 'No category') + ' · ' + esc(r.fam || '') + ' · ' + esc(r.chain) + (r.chain2 ? ', ' + esc(r.chain2) : '') + '</p>'
    + '<div class="sheet-grid">' + [['TVL', usd(r.tvl)], ['7-day', r.chg === null ? 'unreported' : (r.chg > 0 ? '+' : '') + r.chg.toFixed(1) + '%'], ['Implied cover', r.cover.toFixed(3) + '×'], ['Implied value', usd(r.value)], ['Net if it launches', usd(r.net)], ['Per hour', usd(r.perHour) + '/h']].map(([k, x]) => '<div><span>' + k + '</span><b>' + x + '</b></div>').join('') + '</div>'
    + '<h3>How the cover was read</h3><table class="terms"><tbody>' + rows + '<tr><td>Log cover</td><td>sum</td><td><b>' + sum.toFixed(2) + ' · ' + r.cover.toFixed(3) + '×</b></td></tr><tr><td>Implied value</td><td>' + usd(r.tvl) + ' × cover</td><td><b>' + usd(r.value) + '</b></td></tr></tbody></table>'
    + (t[1] === 0 && t[2] === 0 ? '<p class="muted">' + esc(r.cat || 'Its category') + ' has no traded token in the pool, so the category and family tilts are 0 — the chain and the record price this row.</p>' : '')
    + '<h3>The plan\'s money, as read</h3><table class="terms"><tbody>' + [['Capital put in', usd(r.capital)], ['Basis read at', usd(r.basis)], ['Gross on a launch', usd(gross)], ['Cost of the window', usd(r.cost)], ['Launch odds on the record', r.odds + '%'], ['Break-even odds', pct1(r.be)], ['Window', r.days + ' days · ' + r.hours + ' h'], ['Net if it launches', usd(r.net)], ['Per hour', usd(r.perHour)]].map(([k, x]) => '<tr><td>' + k + '</td><td></td><td>' + x + '</td></tr>').join('') + '</tbody></table>'
    + '<p class="muted">A launch at the floor nets ' + usd(r.net) + ', or ' + usd(r.perHour) + ' an hour, and needs ' + pct1(r.be) + ' launch odds against ' + r.odds + '% on the record.</p>'
    + '<h3>The plan, step by step</h3><ol class="steps">' + steps(r).map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>';
  $('#sheet').showModal();
}
$('#colophon').textContent = 'snapshot ' + D.meta[0] + ' · ' + D.meta[3] + ' protocols · ' + D.meta[4] + ' traded · floor ' + usd(D.meta[1]) + ' · ' + R.length + ' rows · ' + D.coverage[1] + '/' + D.coverage[0] + ' watchlist · rendered offline by main.ts';
draw();
