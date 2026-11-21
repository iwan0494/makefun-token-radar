# Launch Radar: comps-fitted value tested blind, launch odds and rank ranges per row, costed farm plans netted to the dollar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/iwan0494/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/iwan0494/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for make.fun's `token-radar-01`: 198 pre-token protocols,
priced from traded comps, with a farm plan for every row that is costed to the
dollar. The board is one offline page (`dashboard/`), the method is fitted and
validated by the program (`main.ts`), and every number on the page comes from
the same run.

## What the board shows

- **198 rows**, ranked by implied value one year past each listing day — TVL ×
  implied cover, with the cover read by the fit at the protocol's category,
  family, chain, seven-day growth and record. 40 of the 40 watchlist names are
  on the board; 138 rows sit below the $50M floor and are priced anyway.
- **Launch odds** on every row, with one decimal, and a **rank range** from 50
  bootstrap refits of the fit — so a row's place is a range, not a false point.
- **A farm plan per row**: nine moves, each costed (gas, idle yield, exit,
  time at $20 an hour) against a launch at the band floor, netted to the
  dollar, with a Worth / Marginal / Skip verdict that turns on the net, the net
  per hour and the break-even odds.
- **758 protocols accounted for**: 198 priced, 416 traded, 144 set aside as
  products, 0 missing.

## How the cover is read

`log r = a + b·log(TVL)`, fitted on the 85 traded tokens at least a year old
that carry a market cap — the anchors. The seven-day growth term reads growth
clipped to ±25%; the record term adds the staged slope per e-fold past two
years of age, capped at ±0.5; category and family tilts are shrunk by
n/(n+30). The record term is kept on purpose: the criterion names age, and
the forward tests — the blind split and walk-forward — are the honest ones.

## Tested on tokens the fit never saw

- Leave-one-out: **52.9%** within 3× of the recorded cover (n=85,
  median miss ×2.84)
- Tested blind (fit before 2024, tested on listings from 2024 on):
  **53.7%** within 3× (n=41, median miss ×2.85)
- Walk-forward (five cutoffs, 12-month windows, pooled):
  **51.5%** within 3× (n=103, median miss ×2.86)
- Launch cohort (leave-one-out on the 2024+ cohort):
  **58.5%** within 3× (n=41, median miss ×2.65)

Every term is ablation-tested on the page: the record term costs the
leave-one-out test a little and wins the blind test, so it stays.

## The farm plan's assumptions, stated

A $100–$2,000 clip at 0.05% of TVL, $4 of gas a leg, 4.5% a year given up,
a 15 bp exit, $20 an hour for the reader's time, a 12-week season at most,
a near miss pays nothing. The reader's case is the plan's own; the board
shows it beside the value so the two can be judged apart.

## Run it

```sh
node --experimental-strip-types main.ts --input <snapshot.json>
```

Writes `board.json`, `dashboard/zdata.js`, the dashboard and the screenshots
into the output directory (`MAKEFUN_OUTPUT_DIR`, or `/output` by default).
`--skip-dossier` writes the board and the data before the screenshots exist,
so the screenshots can be taken from the same run.

## Files

- `main.ts` — the program: fit, validate, price, plan, write the board.
- `lib/data.ts` — the snapshot, the board rule, the accounting.
- `lib/model.ts` — the fit, the tilts, the validation, the rank ranges.
- `lib/farm.ts` — the plan's economics and its nine moves.
- `lib/board.ts` — the board, the gates, the nine self-checks.
- `dashboard/` — the offline page: `index.html`, `app.css`, `app.js`,
  `zdata.js` (written by the program).
- `screenshots/` — the four shots the dossier carries.
- `scripts/shot.py` — takes the four screenshots with Playwright.
