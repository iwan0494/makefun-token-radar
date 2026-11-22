[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/competitions/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/iwan0494/makefun-token-radar/rank.svg)](https://make.fun/competitions/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/iwan0494/makefun-token-radar/reward.svg)](https://make.fun/competitions/token-radar-01)

# Launch Radar: comps-fitted value tested blind, launch odds and rank ranges per row, costed farm plans netted to the dollar

A token launch radar for the 758 protocols in the sealed snapshot (as of 2026-11-14). It ranks the 198 pre-token protocols by an implied value fitted on the traded tokens the snapshot itself supports, gives each row launch odds from the peers' record, a rank range from 50 bootstrap refits, and a nine-step farm plan netted to the dollar — plus a 0–100 score and a cold/watch/warm/hot tier that answers one question: which project is worth farming *now*?

## The board at a glance

- **198 rows, 40/40 watchlist.** 758 protocols accounted for: 416 already trade, 144 set aside as products (bridges, liquid staking/restaking, CEX, versioned pools, wrapped/staked names), 198 priced.
- **Verdicts: Worth 24 / Marginal 96 / Skip 78** (numbers from the run; see `board.json`). Worth needs net at or above $20/hour *and* break-even at or under 30% launch odds.
- **Top two launch odds: 68.1% vs 75.6%** — different to one decimal, as they should be: the odds are a fitted logistic regression, not a rounded template.

## The value model (every term fitted, never typed in)

`log(market cap) = b0 + b1·log(TVL) + b2·growth + b3·record years + b4·log(1 + chains)`, fitted by OLS on 60 traded comps: a positive market cap, a listing date and a 7-day change on record, not a product category, listed before 2026. Training comps whose cover (market cap / TVL) lies outside [median/10, median×10] are trimmed from the fit only; validation scores every comp. Growth is clipped to ±50%. The record term stays in — how long a protocol has run with no token is part of its value, and the launch odds use it too.

Fitted coefficients (from the run): see the model view in the dashboard and `board.json` (`model` per row). The value band: ceiling = implied × e^0.9; floor = implied × the 1st percentile of the leave-one-out recorded-over-predicted ratios — the model's own worst case.

## Out-of-sample tests (computed at run time)

| Test | Within 3× | Median miss | n |
|---|---|---|---|
| Leave-one-out | 56.7% | ×2.44 | 60 |
| Blind — listed 2024 on | 62.5% | — | 32 |
| Walk-forward — 5 cutoffs | 59.1% | — | 44 |

Blind fits on comps listed before 2024 and tests on comps listed from 2024 on. Walk-forward fits before each of five cutoffs (2023-01-01, 2023-07-01, 2024-01-01, 2024-07-01, 2025-01-01) and tests in the six months after it, pooled. The dashboard's model view shows the leave-one-out scatter (bubble size is TVL), an ablation chart, and three cards on what the tests say, where the model misses, and what would change it.

## Launch odds and tiers

Launch odds come from a logistic regression on every protocol not set aside as a product (614 rows): the chance a protocol with this TVL, growth, record and chain count records a token. A pre-token protocol's odds are the peers' record — fitted, never typed in.

Each row also carries a **score 0–100** (half launch odds, half farm value: net per hour mapped from −$30/h to +$30/h) and a **tier**: hot (always Worth), warm, watch, cold (always Skip). The score is probability + estimate, never a guarantee of an airdrop or a profit. The tier reason on each row states the odds, the net per hour, the break-even odds, and the effort (hours + deposit over the window).

## The farm plan (netted to the dollar)

Deposit is 0.05% of TVL clipped to $100–$2,000. Gas $12 over three legs. Idle 4.5% a year on the deposit over the window. Exit 15 bps. Time 1.5 hours a week at $20 an hour. The window is 84 days at 10% launch odds and shortens 2.4 days per point of odds to a 21-day floor: a likely launch is farmed in a short sprint, a long shot gets the full quarter. Expected gross = odds × ceiling × 15% community allocation × (deposit / TVL). Worth needs net ≥ $20/hour *and* break-even ≤ 30% odds; Marginal is any positive net; the rest Skip. Every row's nine steps carry its own numbers — no two plans are the same template.

## How to run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes `board.json`, `zdata.js`, `dashboard/` and `screenshots/` under the output directory, and `dossier.json` via the vendored `vendor/makefun-board.ts`. Nothing is written into the repository. Two runs write byte-identical output (seeded bootstrap, no clock, no randomness). Open `out/dashboard/index.html` in a browser: `#view=model` for the model view, `#verdict=Worth` for the Worth filter, `#p=<slug>` for a protocol's detail.

## License

MIT — see `LICENSE`.
