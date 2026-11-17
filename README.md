# Launch Radar — refit on 81 held-out comps: LOO miss 2.58×, walk-forward 3.02×, blind test 3.10×

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/iwan0494/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/iwan0494/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Round 2 refits the comps-implied model on the 81 held-out comparable tokens in one sealed make.fun
snapshot: valuation is a line over TVL, `log r = 5.1819 + -0.3885 log(TVL)`, with the age (hold) term
switched OFF — category and family tilts only, seven-day growth kept as a term. The fit is then
scored on data it never read. Leave-one-out over all 81 comps gives a median miss of **2.58×**;
walk-forward across 87 test tokens gives **3.02×**; a blind split fit before 2024 and tested on the
39 tokens listed from 2024 on gives **3.10×**. Miss is a factor, so 1.00× would be exact.

The same snapshot (as_of 2026-11-14, sealed: 758 protocols, 416 traded) then prices the pre-token
board: **198 rows**, 40/40 on the watchlist, farm plan **Worth 31 / Marginal 35 / Skip 132**. The
dashboard is one offline page — a validation panel on top, the ranked board, a protocol detail
view, an 81-point error scatter and a term-by-term ablation.

## Run it

```sh
node main.ts --input ../kit/input/snapshot.json --output out
open out/dashboard/index.html
```

It writes `out/board.json` (ranked rows with the terms each was priced with), the dashboard copy
with its `data.js`, the screenshots, and `out/dossier.json`. Node 22.18 or newer, standard library
only, no network.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
