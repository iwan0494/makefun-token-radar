#!/usr/bin/env python3
"""Take the four token-radar screenshots from the repo dashboard, and dump
what the page itself renders so it can be checked against board.json.

Usage:
  python3 scripts/shot.py [--dump /tmp/r4-page.json]
Viewport 1300x1000 (long side 1300 <= 1440, short side 1000 >= 800).
Shots: 1-board (top), 2-detail (?row=<top-1 slug>), 3-filtered (?filter=worth),
4-model (?view=model). Each saved as JPG quality 82, checked <= 512 KiB.
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DASH = REPO / "dashboard"
SHOTS = REPO / "screenshots"


def load_radar():
    text = (DASH / "zdata.js").read_text()
    m = re.search(r"window\.RADAR = (\{.*\});\s*$", text, re.S)
    if not m:
        raise SystemExit("zdata.js did not parse")
    return json.loads(m.group(1))


def main():
    dump_path = None
    args = sys.argv[1:]
    if "--dump" in args:
        dump_path = Path(args[args.index("--dump") + 1])
    from playwright.sync_api import sync_playwright

    radar = load_radar()
    top_slug = radar["rowsData"][0][0]
    base = f"file://{DASH}/index.html"
    jobs = [
        ("1-board.jpg", base, None),
        ("2-detail.jpg", f"{base}?row={top_slug}", ".dialog"),
        ("3-filtered.jpg", f"{base}?filter=worth", None),
        ("4-model.jpg", f"{base}?view=model", "#proof"),
    ]
    SHOTS.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1300, "height": 1000})
        for name, url, wait_sel in jobs:
            page.goto(url)
            page.wait_for_timeout(400)
            if wait_sel:
                page.wait_for_selector(wait_sel, state="visible", timeout=5000)
                page.wait_for_timeout(300)
            out = SHOTS / name
            page.screenshot(path=str(out), type="jpeg", quality=82)
            size = out.stat().st_size
            print(f"{name}: {size} bytes {'OK' if size <= 524288 else 'TOO BIG'}")
        if dump_path is not None:
            page.goto(base)
            page.wait_for_timeout(400)
            table = page.evaluate(
                """() => {
                  const rows = [];
                  document.querySelectorAll('#board-body tr').forEach(tr => {
                    const t = tr.querySelectorAll('td');
                    rows.push({
                      rank: t[0].textContent.trim(),
                      name: t[1].querySelector('.pname').textContent.trim(),
                      cover: t[6].textContent.trim(),
                      value: t[7].querySelector('.big').textContent.trim(),
                      odds: t[8].textContent.trim(),
                      net: t[10].querySelector('.big').textContent.trim(),
                      verdict: t[11].textContent.trim(),
                    });
                  });
                  return rows;
                }"""
            )
            page.goto(f"{base}?row={top_slug}")
            page.wait_for_selector(".dialog", state="visible", timeout=5000)
            page.wait_for_timeout(300)
            detail = page.evaluate(
                """() => ({
                  name: document.querySelector('#d-name').textContent,
                  tiles: [...document.querySelectorAll('#d-tiles dd')].map(e => e.textContent),
                  terms: [...document.querySelectorAll('#d-terms td')].map(e => e.textContent),
                  steps: [...document.querySelectorAll('#d-steps li')].map(e => e.textContent),
                  money: document.querySelector('#d-money').textContent,
                })"""
            )
            dump_path.write_text(json.dumps({"table": table, "detail": detail, "topSlug": top_slug}, indent=1))
            print(f"dump: {dump_path}")
        browser.close()


if __name__ == "__main__":
    main()
