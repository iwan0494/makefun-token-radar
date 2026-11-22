# Launch Radar

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/competitions/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/iwan0494/makefun-token-radar/rank.svg)](https://make.fun/competitions/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/iwan0494/makefun-token-radar/reward.svg)](https://make.fun/competitions/token-radar-01)

A token launch radar: 198 pre-token protocols ranked by implied value, each
with launch odds, a rank range, and a costed 9-step farm plan netted to the
dollar. The value model is fitted at runtime from the 60 launched comps in
the sealed snapshot — no hand-kept list of names, so a new snapshot
re-prices the board instead of replaying old coefficients.

## The model

`log(mcap) = 4.5001 + 0.7263·log(TVL) + 0.5184·growth − 0.0531·record years − 0.1268·log(1+chains)`

- **Comps (n=60):** token-bearing protocols with a market cap, a 7-day
  change and a listing date, whose market cap sits between 0.1x and 20x
  their TVL. Outside that band the ratio is a data quirk, not a price.
- **Growth** is the 7-day TVL change as a fraction, clamped to [-0.6, 1.2].
- **Record years** is the time since DefiLlama first listed the protocol
  with no token on record (1.0 years when the listing date is unknown).
- **Launch odds** are a logistic of the same figures; **score (0–100)**
  blends a row's implied percentile with its odds. Both are the model's
  estimate, not a guarantee — the board says so, and each detail view
  recomputes its row and checks the number board.json carries.
- **Tier:** Worth at score ≥ 72, Marginal at ≥ 50, Skip below.
- **Rank range** per row comes from 50 bootstrap refits of the comps.

## Validation (computed in the same run, from the same snapshot)

| Test | Within 3x | Median miss |
| --- | --- | --- |
| Leave-one-out (n=60) | 34/60 — 56.7% | x2.53 |
| Blind (fit 28 earliest-listed, predict 32 most recent) | 22/32 — 68.8% | x2.13 |
| Walk-forward (fit first 16 listed, predict each next in order) | 27/44 — 61.4% | x2.19 |

## Accounting — 758 protocols

416 already trade · 144 pre-token set aside (wrapped, staked or bridged
products of a token that already trades, versioned pools, exchanges) ·
198 priced · 40/40 watchlist covered. Tiers: Worth 24 / Marginal 63 /
Skip 111. Top-two launch odds: 67.4% vs 61.4%.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes
`board.json`, `data.js`, `dashboard/` and `screenshots/` to the output
directory, and `dossier.json` last. It writes nothing to the repository
it runs from. Open `out/dashboard/index.html` with `out/data.js` beside
it to browse the radar.
