"""Render the ronde-3 Launch Radar dashboard with Camoufox and save its four screenshots.

Usage: TMPDIR=/home/hatch/workspace/camoufox/tmp \
       /home/hatch/workspace/camoufox/venv/bin/python scripts/shots.py --out out --shots screenshots [--only 1,3]

The page is opened from the copied output (out/dashboard/index.html) through file://, so every screen is
the page's own script drawing its own zdata.js: nothing is injected. Each shot is a plain viewport capture
after the page itself has been scrolled or filtered by a real click.

Shots (1333x1067 viewport):
  1-board.jpg    masthead + proof cards + the board's top rows (Worth, rank 1 first)
  2-detail.jpg   the detail sheet open on rank 1, showing its arithmetic and the plan's money
  3-filtered.jpg the same board after clicking the Worth segment (22 of 198 rows)
  4-model.jpg    the validation figure: scatter, ablation and later-listing splits, no modal

Size limits: every JPEG must be <= 512 KiB (the gate cap). The loop walks the quality down from 94
and stops at the first file that is <= the target (150 KiB): four shots near that size keep the
dossier near 1 MB, in the range the leaderboard's top entries carry (450–780 KB), instead of the
1.26 MB ronde 2 shipped.
"""
import argparse
import io
import pathlib

from PIL import Image
from camoufox.sync_api import Camoufox

VIEW = {"width": 1333, "height": 1067}
SCALE = 1.0
SHOT_SIDE = (800, 1440)  # short min, long max
HARD_CAP = 512 * 1024
TARGET = 150 * 1024
QUALITIES = list(range(94, 20, -3))

SHOTS = [
    ("1-board.jpg", "masthead + proof cards + board top rows"),
    ("2-detail.jpg", "detail sheet open on rank 1"),
    ("3-filtered.jpg", "board after a click on the Worth segment"),
    ("4-model.jpg", "scatter + ablation + splits, no modal"),
]


def save_jpeg(page, path):
    png = page.screenshot(full_page=False)
    im = Image.open(io.BytesIO(png)).convert("RGB")
    w, h = im.size
    if max(w, h) > SHOT_SIDE[1] or min(w, h) < SHOT_SIDE[0]:
        raise SystemExit(f"capture {w}x{h} is outside 1440x800")
    last = None
    for q in QUALITIES:
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=q, optimize=True, progressive=False, subsampling=2)
        n = buf.tell()
        last = (n, q)
        if n <= TARGET:
            path.write_bytes(buf.getvalue())
            return n, q
    raise SystemExit(f"{path.name} could not be fitted under {TARGET} bytes (last {last[0]} at q{last[1]})")


def check(page):
    return page.evaluate("""() => {
      const q = (s) => document.querySelector(s);
      const all = (s) => Array.from(document.querySelectorAll(s));
      const sc = q('#scatter');
      return {
        rows: all('#rows tr').length,
        proof: all('#proof li').length,
        ablation: all('#ablation li').length,
        splits: all('#splits-body tr').length,
        scatterNodes: sc ? sc.querySelectorAll('svg *').length : 0,
        pageinfo: q('#pageinfo') ? q('#pageinfo').textContent : null,
        filterResult: q('#filter-result') ? q('#filter-result').textContent : null,
        sheetOpen: q('#sheet') ? q('#sheet').open : null,
        sheetName: q('#sheet-name') ? q('#sheet-name').textContent : null,
      };
    }""")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--shots", required=True)
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    out = pathlib.Path(a.out)
    shots = pathlib.Path(a.shots)
    shots.mkdir(parents=True, exist_ok=True)
    wanted = {s.strip() for s in a.only.split(",") if s.strip()}
    page_url = (out / "dashboard" / "index.html").resolve().as_uri()

    with Camoufox(headless=True, geoip=False, humanize=False, os="macos") as browser:
        ctx = browser.new_context(viewport=VIEW, device_scale_factor=SCALE, ignore_https_errors=True,
                                  reduced_motion="reduce")
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append("console " + m.type + ": " + m.text) if m.type == "error" else None)
        page.goto(page_url, wait_until="load")
        page.wait_for_selector("#rows tr", timeout=20000)
        page.wait_for_timeout(800)
        print("initial DOM", check(page))
        print("errors", errors)

        def want(idx):
            return not wanted or str(idx) in wanted

        # 1 — masthead, proof cards, board top.
        if want(1):
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(300)
            n, q = save_jpeg(page, shots / "1-board.jpg")
            print("SHOT 1-board.jpg", n, "q", q)

        # 2 — detail sheet on rank 1.
        if want(2):
            page.evaluate("window.scrollTo(0, 0)")
            page.click("#rows tr:first-child button[data-open]")
            page.wait_for_selector("#sheet[open]", timeout=5000)
            page.wait_for_timeout(500)
            print("sheet DOM", check(page))
            n, q = save_jpeg(page, shots / "2-detail.jpg")
            print("SHOT 2-detail.jpg", n, "q", q)
            page.evaluate("document.querySelector('#sheet').close()")
            page.wait_for_timeout(300)

        # 3 — the board after a real click on the Worth segment.
        if want(3):
            page.click("#verdict-segs button[data-v='0']")
            page.wait_for_timeout(400)
            print("filtered DOM", check(page))
            page.evaluate("""() => {
              const head = document.querySelector('.board-head');
              window.scrollTo(0, Math.max(0, head.getBoundingClientRect().top + window.scrollY - 8));
            }""")
            page.wait_for_timeout(300)
            n, q = save_jpeg(page, shots / "3-filtered.jpg")
            print("SHOT 3-filtered.jpg", n, "q", q)
            page.click("#reset")
            page.wait_for_timeout(200)

        # 4 — scatter + ablation + splits, no modal.
        if want(4):
            page.evaluate("""() => {
              const sc = document.querySelector('#scatter').closest('figure');
              const top = sc.getBoundingClientRect().top + window.scrollY - 8;
              window.scrollTo(0, Math.max(0, top));
            }""")
            page.wait_for_timeout(300)
            n, q = save_jpeg(page, shots / "4-model.jpg")
            print("SHOT 4-model.jpg", n, "q", q)

        print("final DOM", check(page))
        print("errors", errors)
        for name, desc in SHOTS:
            p = shots / name
            print(name, "bytes", p.stat().st_size if p.exists() else "MISSING", "-", desc)
        ctx.close()


if __name__ == "__main__":
    main()
