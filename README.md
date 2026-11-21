# Launch Radar — comps-fitted value tested blind and walk-forward, farm plans netted to the dollar: 198 pre-token protocols, 40/40 watchlist

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/iwan0494/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/iwan0494/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Round 3 prices the pre-token board from the snapshot's own traded tokens: a comps-fitted value
model — a line over TVL, `log r = 5.1819 + -0.3885 log(TVL)`, with category, family and first-chain
tilts, a seven-day growth term, and the record term kept with its slope capped at half a log per
e-fold — fitted on the 81 traded tokens that carry a cover, and tested only on tokens the fit
never saw. Leave-one-out reads **55.6% within 3×** of the recorded cover (median miss ×2.85); a
blind split fit before 2024 and tested on the 39 tokens listed from 2024 on reads **46.2% within
3×**; walk-forward across 87 later listings reads **46.0% within 3×**. The launch state of the
same test reads 49.4% within 3×. Every term is ablation-tested: dropping the TVL line costs
+2.77× of median miss.

The same snapshot (as_of 2026-11-14, sealed: 758 protocols, 416 traded) then prices the board:
**198 rows**, 40/40 on the watchlist, each with its own fitted cover — never a pool constant —
and a farm plan netted to the dollar, **Worth 22 / Marginal 46 / Skip 130**, best plan $577 an
hour. All 758 protocols are accounted for on the page: 198 priced, 416 traded (81 anchor the
fit, 40 listed under a year, 7 outside the fit's bounds, 288 with no market cap on record), and
144 set aside as not launchable, with the reason for each group. The dashboard is one offline
page — an evidence strip, three out-of-sample proof cards, the ranked board with filters, sorts
and a detail sheet per protocol, an 81-point read-vs-recorded scatter and a term-by-term
ablation — 64,432 bytes of source, so the dossier reads every file whole inside its 65,536-byte
text cap.

## Run it

```sh
node main.ts --input ../kit/input/snapshot.json --output out
open out/dashboard/index.html
```

It writes `out/board.json` (ranked rows with the terms each was priced with), the dashboard copy
with its `zdata.js`, the screenshots, and `out/dossier.json`. Node 22.18 or newer, standard library
only, no network.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
