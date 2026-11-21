# Launch Radar: comps-fitted value tested blind, launch odds and rank ranges per row, costed farm plans netted to the dollar

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/competitions/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/iwan0494/makefun-token-radar/rank.svg)](https://make.fun/competitions/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/iwan0494/makefun-token-radar/reward.svg)](https://make.fun/competitions/token-radar-01)

A token launch radar: 198 pre-token protocols, each priced by a fit on traded comps, tested on tokens the fit never saw. Every row carries launch odds, a rank range from 50 bootstrap refits, and a nine-move farm plan netted to the dollar.

## What it says

- **198 rows** — pre-token protocols, 40 of 40 watchlist names present. 758 protocols accounted for: 416 traded, 144 set aside as products, 198 priced.
- **The fit** — on 85 traded comps: log cover = 7.5949 − 0.5179 log(TVL), seven-day growth −1.196, record slope −0.017, plus category and family tilts read off traded tokens in the same group (family fitted after category, so the same residual is never counted twice). Every term is fitted, never typed in.
- **Tested, not asserted** — leave-one-out median miss ×2.82, 52.9% within 3× (n=85); tested blind on tokens listed from 2024 on, ×2.86, 53.7% within 3× (n=41); walk-forward across five cutoffs, ×2.46, 53.4% within 3× (n=58); launch cohort, ×2.62, 58.5% within 3× (n=41).
- **The band** — implied value × e^0.9 at the ceiling; at the floor, implied value × 0.00756, the 1st percentile of the leave-one-out recorded-over-predicted ratios — the model's own worst case, on purpose.
- **The farm** — 4 Worth, 14 Marginal, 180 Skip. Best plan nets $140 an hour. Each plan: a deposit clipped to 0.05% of TVL ($100–$2,000), gas on three legs, 4.5% idle a year, a 15 bps exit, 1.5 hours a week at $20 an hour, over a window clipped to 21–84 days. Worth needs $20 an hour and a break-even at or under 30%.

## Run it

```sh
node main.ts
```

Bare, no flags, no network, standard library only. It reads the snapshot from `$MAKEFUN_INPUT_DIR` (`/input`) and writes everything under `$MAKEFUN_OUTPUT_DIR` (`/output`): `board.json`, `dashboard/`, `screenshots/`, `dossier.json`. Nothing is written into the repository — the program must run with the repo mounted read-only. With a snapshot elsewhere:

```sh
node main.ts --input /path/to/snapshot.json --output /path/to/out
```

`--skip-dossier` runs without screenshots (take them first with `scripts/shot.py`, then run again so they ride into the dossier). The program runs twice and both runs write the same bytes.

## Files

- `main.ts` — entrypoint: reads the snapshot, fits, validates, writes the board, the dashboard data and the dossier.
- `lib/data.ts` — snapshot parsing, ages, the product categories set aside, the 758-protocol accounting.
- `lib/model.ts` — the fit (line, growth, record, tilts), leave-one-out / blind / walk-forward / launch validation, ablation, 50 bootstrap refits for rank ranges.
- `lib/farm.ts` — launch odds, the nine-move plan, the money line, the verdict.
- `lib/board.ts` — the 198-row board, the gate checks, the nine self-checks.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`. The page derives every number from the model and the row, so what it shows can never disagree with `board.json`.
- `scripts/shot.py` — takes the four screenshots from the built dashboard with Playwright.
- `vendor/makefun-board.ts` — the kit's dossier writer, copied verbatim.

## Assumptions

- The snapshot is DefiLlama data as of 2026-11-14, 758 protocols, floor $50M. A protocol is priced when it has no token and is not a product (exchange, bridge, staking, farm and the like), or when it is on the watchlist.
- A traded token anchors the fit when it is at least a year old, carries a market cap and records a positive cover (market cap over TVL): 85 anchors.
- Launch odds rise with age and seven-day growth, from 8% to 50%. The window runs to one year past listing, clipped to 21–84 days.
- The dossier is built from the run's own numbers; the page checks itself against nine self-checks printed on the model page.
