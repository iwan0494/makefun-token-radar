# Launch Radar — token launch radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/iwan0494/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/iwan0494/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Launch Radar reads one sealed make.fun snapshot and ranks early, pre-token protocols by a
comps-implied value: a joint fit of market cap over TVL on the traded tokens in the snapshot,
adjusted for seven-day growth, seasoning, size and category, with a farm plan for each row. The
dashboard is one offline page — board, protocol detail, filters and the fitted model.

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
