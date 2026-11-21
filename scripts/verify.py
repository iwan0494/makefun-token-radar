#!/usr/bin/env python3
"""Verify the built dashboard against board.json, cell by cell.

Recomputes every row from the model in zdata.js (a Python mirror of
lib/model.ts + lib/farm.ts), compares it with board.json, then opens the
page in Playwright and compares what the page renders — the whole table and
the detail dialog of a sample of rows — against the same recomputation.
Any mismatch is a page/board disagreement and fails the run.
"""

import json
import math
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "out"
BOARD = json.load(open(OUT / "board.json"))["rows"]
Z = open(OUT / "dashboard" / "zdata.js").read()
RADAR = json.loads(re.search(r"window\.RADAR = (\{.*\});", Z, re.S).group(1))

FAILURES = []


def fail(msg):
    FAILURES.append(msg)
    print("MISMATCH:", msg)


def fmt_usd(x):
    if not math.isfinite(x):
        return "$0"
    sign = "-" if x < 0 else ""
    v = abs(x)
    if v >= 1e9:
        return f"{sign}${v / 1e9:.2f}B"
    if v >= 1e6:
        return f"{sign}${v / 1e6:.1f}M"
    if v >= 1e4:
        return f"{sign}${round(v / 1e3)}k"
    if v >= 1e3:
        return f"{sign}${v / 1e3:.1f}k"
    if v >= 100:
        return f"{sign}${round(v)}"
    if v >= 1:
        return f"{sign}${round(v)}"
    return f"{sign}${v:.2f}"


def clip(x, lo, hi):
    return max(lo, min(hi, x))


def fam_of(cat):
    return re.sub(r"[^a-z0-9]+", "-", cat.lower()).strip("-")


def age_text(age):
    if age is None:
        return "an unlisted stretch"
    if age < 1:
        return f"{max(1, round(age * 12))} months"
    return f"{age:.1f} years"


CAREERS = {
    "Dexs": "provide the pair",
    "Lending": "lend the deposit",
    "CDP": "open the vault",
    "CDP Manager": "open the managed vault",
    "Yield": "stake the deposit in the vault",
    "Yield Aggregator": "stake the deposit in the vault",
    "Risk Curators": "place the deposit with the curator vault",
    "Onchain Capital Allocator": "allocate the deposit through the vault",
    "Liquid Staking": "stake the deposit",
    "Liquid Restaking": "restake the deposit",
    "Chain": "bridge the deposit to the chain and use the protocol",
    "Prediction Market": "back the market with the deposit",
    "RWA": "take the tokenized position",
    "Derivatives": "open the position",
    "Collateral Markets": "post the deposit as collateral",
    "Basis Trading": "fund the basis trade",
}


def derive(row, model):
    slug, name, cat, chains, tvl, chg, age, rlo, rhi, vcode, window, agedays = row
    growth = clip(chg if chg is not None else 0, -0.25, 0.25)
    rx = 0 if (age is None or age < 2) else math.log(age / 2)
    tline = model["line"]["a"] + model["line"]["b"] * math.log(max(1, tvl))
    tgrowth = model["growth"] * growth
    trecord = min(model["recordSlope"] * rx, model["recordCap"])
    tcat = next((t[2] for t in model["category"] if t[0] == cat), 0)
    tfam = next((t[2] for t in model["family"] if t[0] == fam_of(cat)), 0)
    logr = tline + tgrowth + trecord + tcat + tfam
    cover = math.exp(logr)
    value = tvl * cover
    band_lo = value * model["bandLoFactor"]
    band_hi = value * math.exp(0.9)
    gpct = (chg if chg is not None else 0) * 100
    odds = round(clip(0.08 + 0.12 * clip(agedays / 730, 0, 1) + 0.4 * clip(gpct, -25, 25) / 100, 0.08, 0.5) * 100) / 100
    deposit = max(100, min(2000, 0.0005 * tvl))
    share = deposit / max(1, tvl) * 100
    share_text = "<0.001" if share < 0.001 else (f"{share:.3f}" if share < 0.01 else f"{share:.2f}")
    hours = window / 7 * 1.5
    idle = deposit * 0.045 * (window / 365.25)
    gross = band_lo * 0.0012
    exit_fee = gross * 0.0015
    time_cost = hours * 20
    cost = 12 + idle + exit_fee + time_cost
    net = gross - cost
    per_hour = net / hours if hours > 0 else 0
    be = cost / gross if gross > 0 else math.inf
    verdict = "Worth" if (per_hour >= 20 and be <= 0.3) else ("Marginal" if (per_hour >= 6 and be <= 0.6) else "Skip")
    chain = chains.split(" and ")[0]
    up = gpct >= 0
    steps = [
        f"Counted {age_text(age)} with no token; priced {fmt_usd(value)} a year after listing, {fmt_usd(band_lo)} at the floor.",
        f"TVL {fmt_usd(tvl)} on {chains}; a {fmt_usd(deposit)} deposit is {share_text}% of its TVL.",
        f"Fund one {chain} wallet with {fmt_usd(deposit)} alone, apart from a long-term bag; gas on 3 legs costs about {fmt_usd(12)}.",
        f"On {chain}, {CAREERS.get(cat, 'use the deposit with the protocol')}; the position balance is the whole position.",
        f"TVL is {'up ' if up else 'down '}{abs(gpct):.1f}% in seven days; odds {odds * 100:.1f}% over {window} days. A launch at the floor pays about {fmt_usd(gross)} on that deposit.",
        f"{window} days of work at 1.5 h a week; check the position weekly; time worth {fmt_usd(time_cost)}.",
        f"Idle at 4.5% a year gives up {fmt_usd(idle)} over the window; beat that first.",
        "First read the lock: the withdrawal terms and the fee. Main risk: the terms change before the window ends; if it hits, exit at once.",
        f"Day {window}: withdraw on {chain} for {fmt_usd(exit_fee)}; needs {be * 100:.1f}% odds vs {odds * 100:.1f}% — {verdict}.",
    ]
    money = (
        f"Capital {fmt_usd(deposit)} · {share_text}% of its TVL — gross {fmt_usd(gross)}, cost {fmt_usd(cost)}, "
        f"net {fmt_usd(net)}, {fmt_usd(per_hour)}/h. It nets {fmt_usd(net)}, or {fmt_usd(per_hour)} an hour, and needs only "
        f"{be * 100:.1f}% launch odds against {odds * 100:.1f}% on the record."
    )
    return {
        "slug": slug, "name": name, "category": cat, "family": fam_of(cat), "chains": chains, "chain": chain,
        "tvl": tvl, "change": chg, "age": age, "rankLo": rlo, "rankHi": rhi, "verdictCode": vcode,
        "window": window, "ageDays": agedays, "cover": cover, "value": value, "bandLo": band_lo,
        "bandHi": band_hi, "odds": odds, "deposit": deposit, "shareText": share_text, "hours": hours,
        "idle": idle, "gross": gross, "exitFee": exit_fee, "timeCost": time_cost, "cost": cost,
        "net": net, "perHour": per_hour, "breakEven": be, "verdict": verdict,
        "tLine": tline, "tGrowth": tgrowth, "tRecord": trecord, "tCat": tcat, "tFam": tfam,
        "logR": logr, "steps": steps, "money": money, "growthPct": gpct,
    }


# --- 1. Recomputed values vs board.json ---
derived = [derive(r, RADAR["model"]) for r in RADAR["rowsData"]]
print(f"recomputed {len(derived)} rows from zdata.js")
for d, b in zip(derived, BOARD):
    if d["slug"] != b["slug"]:
        fail(f"row order: {d['slug']} vs board {b['slug']}")
        continue
    # Tolerances: the page and board.json both run V8 on identical inputs, so
    # they agree exactly; this Python mirror runs a different libm, whose
    # exp/log differ by a unit in the last place — a dollar here, a ten-
    # thousandth there. A real derivation bug moves values by percent, not
    # by a dollar, so these tolerances still catch one.
    if abs(round(d["value"]) - b["implied_value_usd"]) > 2:
        fail(f"{d['slug']}: value {round(d['value'])} vs board {b['implied_value_usd']}")
    if d["odds"] != b["odds"]:
        fail(f"{d['slug']}: odds {d['odds']} vs board {b['odds']}")
    if abs(round(d["net"]) - b["net_usd"]) > 2:
        fail(f"{d['slug']}: net {round(d['net'])} vs board {b['net_usd']}")
    if abs(round(d["perHour"] * 100) / 100 - b["per_hour_usd"]) > 0.01:
        fail(f"{d['slug']}: perHour {d['perHour']:.2f} vs board {b['per_hour_usd']}")
    if abs(round(d["breakEven"] * 10000) / 10000 - b["break_even"]) > 0.0002:
        fail(f"{d['slug']}: breakEven {d['breakEven']:.4f} vs board {b['break_even']}")
    if d["verdict"] != b["verdict"]:
        fail(f"{d['slug']}: verdict {d['verdict']} vs board {b['verdict']}")
    if (d["rankLo"], d["rankHi"]) != (b["rank_lo"], b["rank_hi"]):
        fail(f"{d['slug']}: rank range {(d['rankLo'], d['rankHi'])} vs board {(b['rank_lo'], b['rank_hi'])}")
    if d["steps"] != b["farm_steps"]:
        for i, (x, y) in enumerate(zip(d["steps"], b["farm_steps"])):
            if x != y:
                fail(f"{d['slug']} step {i + 1}:\n  recomputed: {x}\n  board:       {y}")
    if d["window"] != b["window_days"] or d["ageDays"] != b["age_days"]:
        fail(f"{d['slug']}: window/ageDays {d['window']}/{d['ageDays']} vs board {b['window_days']}/{b['age_days']}")
print("board.json comparison done")

# --- 2. The rendered page vs the recomputation ---
from playwright.sync_api import sync_playwright

SAMPLE = [0, 1, 2, 4, 5, 197]  # ranks 1,2,3,5,6,198
by_slug = {d["slug"]: d for d in derived}
# rows with null age / null change for the dialog sample
for d in derived:
    if d["age"] is None:
        SAMPLE.append(derived.index(d))
        break
for d in derived:
    if d["change"] is None:
        SAMPLE.append(derived.index(d))
        break
SAMPLE = sorted(set(SAMPLE))
print("dialog sample ranks:", [i + 1 for i in SAMPLE])

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 960})
    page.goto("file://" + str(OUT / "dashboard" / "index.html"))
    page.wait_for_selector("#rows tr")
    rows = page.locator("#rows tr")
    n = rows.count()
    print(f"page renders {n} rows")
    if n != len(BOARD):
        fail(f"page row count {n} vs board {len(BOARD)}")
    for i in range(n):
        d = derived[i]
        cells = rows.nth(i).locator("td")
        got = [cells.nth(j).inner_text().strip() for j in range(12)]
        # 0 rank, 1 protocol, 2 family, 3 tvl, 4 7d, 5 record, 6 cover, 7 value+band, 8 odds, 9 rank range, 10 net, 11 plan
        if got[0] != str(i + 1):
            fail(f"row {i + 1}: rank cell {got[0]}")
        if d["name"] not in got[1]:
            fail(f"row {i + 1}: name {got[1]!r} lacks {d['name']}")
        if got[2] != d["family"]:
            fail(f"row {i + 1}: family {got[2]} vs {d['family']}")
        if got[3] != fmt_usd(d["tvl"]):
            fail(f"row {i + 1}: tvl {got[3]} vs {fmt_usd(d['tvl'])}")
        chg = "—" if d["change"] is None else f"{d['change'] * 100:.1f}%"
        if got[4] != chg:
            fail(f"row {i + 1}: 7d {got[4]} vs {chg}")
        age = "—" if d["age"] is None else f"{d['age']:.1f}y"
        if got[5] != age:
            fail(f"row {i + 1}: record {got[5]} vs {age}")
        if got[6] != f"{d['cover']:.3f}×":
            fail(f"row {i + 1}: cover {got[6]} vs {d['cover']:.3f}×")
        val_parts = got[7].split("\n")
        if val_parts[0] != fmt_usd(d["value"]):
            fail(f"row {i + 1}: value {val_parts[0]} vs {fmt_usd(d['value'])}")
        band = f"{fmt_usd(d['bandLo'])} – {fmt_usd(d['bandHi'])}"
        if len(val_parts) > 1 and val_parts[1] != band:
            fail(f"row {i + 1}: band {val_parts[1]} vs {band}")
        if got[8] != f"{d['odds'] * 100:.1f}%":
            fail(f"row {i + 1}: odds {got[8]} vs {d['odds'] * 100:.1f}%")
        if got[9] != f"{d['rankLo']}–{d['rankHi']}":
            fail(f"row {i + 1}: rank range {got[9]} vs {d['rankLo']}–{d['rankHi']}")
        net_parts = got[10].split("\n")
        if net_parts[0] != fmt_usd(d["net"]):
            fail(f"row {i + 1}: net {net_parts[0]} vs {fmt_usd(d['net'])}")
        need = f"{d['breakEven'] * 100:.1f}% needed"
        if len(net_parts) > 1 and net_parts[1] != need:
            fail(f"row {i + 1}: needed {net_parts[1]} vs {need}")
        if got[11].strip().upper() != d["verdict"].upper():
            fail(f"row {i + 1}: badge {got[11]} vs {d['verdict']}")
    print("table comparison done")
    # detail dialogs
    for i in SAMPLE:
        d = derived[i]
        rows.nth(i).click()
        page.locator("#overlay").wait_for(state="visible")
        page.wait_for_timeout(200)
        name = page.locator("#d-name").inner_text().strip()
        if name != d["name"]:
            fail(f"dialog rank {i + 1}: name {name} vs {d['name']}")
        tiles = [t.inner_text().strip() for t in page.locator("#d-tiles .tile").all()]
        tile_vals = [t.split("\n")[-1] for t in tiles]
        expect_tiles = [
            fmt_usd(d["tvl"]),
            "—" if d["change"] is None else f"{d['change'] * 100:.1f}%",
            f"{d['cover']:.3f}×",
            fmt_usd(d["value"]),
            fmt_usd(d["net"]),
            fmt_usd(d["perHour"]) + "/h",
            f"{d['odds'] * 100:.1f}%",
            f"{d['rankLo']}–{d['rankHi']}",
        ]
        if tile_vals != expect_tiles:
            fail(f"dialog rank {i + 1}: tiles {tile_vals} vs {expect_tiles}")
        steps = [li.inner_text().strip() for li in page.locator("#d-steps li").all()]
        if steps != d["steps"]:
            for j, (x, y) in enumerate(zip(steps, d["steps"])):
                if x != y:
                    fail(f"dialog rank {i + 1} step {j + 1}:\n  page: {x}\n  calc: {y}")
        money = page.locator("#d-money").inner_text().strip()
        if money != d["money"]:
            fail(f"dialog rank {i + 1} money:\n  page: {money}\n  calc: {d['money']}")
        page.locator("#d-close").click()
        page.locator("#overlay").wait_for(state="hidden")
    print("dialog comparison done")
    browser.close()

if FAILURES:
    print(f"\n{len(FAILURES)} MISMATCHES")
    sys.exit(1)
print("\nALL CHECKS PASS: page == board.json == recomputation")
