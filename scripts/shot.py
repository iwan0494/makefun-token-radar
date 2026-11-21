#!/usr/bin/env python3
"""Take the four screenshots from the built dashboard in out/.

Run main.ts first (with --skip-dossier if the shots do not exist yet), then
this script, then main.ts again so the fresh shots ride into out/ and the
dossier. The shots land in the repository's screenshots/ directory.
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "out" / "dashboard"
SHOTS = REPO / "screenshots"
VIEWPORT = {"width": 1280, "height": 960}

SHOTS.mkdir(parents=True, exist_ok=True)
PAGE = "file://" + str(OUT / "index.html")


def size(path: Path) -> int:
    return path.stat().st_size


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport=VIEWPORT)
        page.goto(PAGE)
        page.wait_for_selector("#rows tr")
        page.wait_for_timeout(400)
        board = SHOTS / "1-board.jpg"
        page.screenshot(path=str(board), type="jpeg", quality=82)
        print(f"1-board.jpg {size(board)} bytes")

        # A detail view: the top row's dialog, all nine steps in one frame.
        page.locator("#rows tr").first.click()
        page.locator("#overlay").wait_for(state="visible")
        page.wait_for_timeout(400)
        detail = SHOTS / "2-detail.jpg"
        page.screenshot(path=str(detail), type="jpeg", quality=82)
        print(f"2-detail.jpg {size(detail)} bytes")

        # The Worth filter, to show the shortlist alone.
        page.locator("#d-close").click()
        page.locator("#overlay").wait_for(state="hidden")
        page.locator('.chip[data-filter="Worth"]').click()
        page.wait_for_timeout(400)
        filtered = SHOTS / "3-filtered.jpg"
        page.screenshot(path=str(filtered), type="jpeg", quality=82)
        print(f"3-filtered.jpg {size(filtered)} bytes")

        # The model section: proof cards, scatter, ablation, accounting.
        model = SHOTS / "4-model.jpg"
        page.locator("#model").screenshot(path=str(model), type="jpeg", quality=82)
        print(f"4-model.jpg {size(model)} bytes")
        browser.close()

    for f in sorted(SHOTS.glob("*.jpg")):
        if size(f) > 512 * 1024:
            print(f"TOO BIG: {f.name} {size(f)} bytes > 512 KiB", file=sys.stderr)
            sys.exit(1)
    print("all four screenshots under 512 KiB")


if __name__ == "__main__":
    main()
