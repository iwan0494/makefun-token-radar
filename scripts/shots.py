"""Render the ronde-2 Launch Radar dashboard with Camoufox and save its four screenshots.

Usage: TMPDIR=/home/hatch/workspace/camoufox/tmp \
       /home/hatch/workspace/camoufox/venv/bin/python scripts/shots.py --out out --shots screenshots [--only 1,3]

The page is opened from the copied output (out/dashboard/index.html) through file://, so every screen is
the page's own script drawing its own data.js: nothing is injected. Each shot is a plain viewport capture
after the page itself has been scrolled or filtered by a real click.

Shots (1333x1067 viewport):
  1-board.jpg    masthead + the three held-out headline figures + the start of the scatter
  2-detail.jpg   the board, paged through to the last of the 198 rows and scrolled to that page's foot,
                 before any filter
  3-filtered.jpg the same board after clicking the Worth segment (31 of 198 rows), pager at page 1
  4-model.jpg    the validation figure with the ablation beside it (about 817 px tall) and the detail sheet
                 opened on Steakhouse Financial over it; the splits table is the figure's lower half,
                 so it sits just under this frame

Size limits: every JPEG must be <= 256 KiB (262144 bytes). The loop walks the quality down from 94
and stops at the first file that is <= the target (250 KiB, headroom under the hard cap). The dossier
also wants the long side <= 1440 and the short side >= 800; the 1333x1067 viewport keeps both.
"""
import argparse
import io
import pathlib

from PIL import Image
from camoufox.sync_api import Camoufox

VIEW = {"width": 1333, "height": 1067}
SCALE = 1.0
SHOT_SIDE = (800, 1440)  # short min, long max
HARD_CAP = 256 * 1024
TARGET = 250 * 1024
QUALITIES = list(range(94, 20, -3))

SHOTS = [
    ("1-board.jpg", "masthead + headline + start of scatter"),
    ("2-detail.jpg", "board opened on the last of its 198 rows, unfiltered"),
    ("3-filtered.jpg", "board after a click on the Worth segment"),
    ("4-model.jpg", "scatter + ablation, Steakhouse sheet open; splits are the same figure's lower half"),
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


def check(page, errors):
    return page.evaluate("""() => {
      const q = (s) => document.querySelector(s);
      const all = (s) => Array.from(document.querySelectorAll(s));
      const sc = q('#scatter');
      const marks = sc ? all('#scatter svg circle').filter(c => !c.classList.contains('mark-dot')).length : 0;
      return {
        rows: all('#rows tr').length,
        headline: all('#headline li').length,
        headlineText: all('#headline li .hl-x, #headline li b, #headline li strong').map(e => e.textContent.trim()).slice(0, 8),
        ablation: all('#ablation li').length,
        splits: all('#splits-body tr').length,
        duel: all('#duel > *').length,
        scatterNodes: sc ? sc.querySelectorAll('svg *').length : 0,
        scatterCircles: marks,
        scatterSize: sc ? [Math.round(sc.getBoundingClientRect().width), Math.round(sc.getBoundingClientRect().height)] : null,
        pageinfo: q('#pageinfo') ? q('#pageinfo').textContent : null,
        filterResult: q('#filter-result') ? q('#filter-result').textContent : null,
        sheetOpen: q('#sheet') ? q('#sheet').open : null,
        sheetName: q('#sheet-name') ? q('#sheet-name').textContent : null,
        errors: 0
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
        print("initial DOM", check(page, errors))
        print("errors", errors)

        def want(idx):
            return not wanted or str(idx) in wanted

        # 1 — masthead and the validation panel.
        if want(1):
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(300)
            n, q = save_jpeg(page, shots / "1-board.jpg")
            print("SHOT 1-board.jpg", n, "q", q, "scroll", page.evaluate("window.scrollY"))

        # 2 — the board paged to the end of its 198 rows, unfiltered.
        if want(2):
            page.evaluate("window.scrollTo(0, 0)")
            while page.locator("#next").is_enabled():
                page.click("#next")
            page.wait_for_timeout(300)
            print("board-end DOM", check(page, errors))
            page.evaluate("""() => {
              const wrap = document.querySelector('.tablewrap--board');
              wrap.scrollTop = wrap.scrollHeight;
              const head = document.querySelector('.board-head');
              window.scrollTo(0, Math.max(0, head.getBoundingClientRect().top + window.scrollY - 8));
            }""")
            page.wait_for_timeout(300)
            n, q = save_jpeg(page, shots / "2-detail.jpg")
            print("SHOT 2-detail.jpg", n, "q", q, "scroll", page.evaluate("window.scrollY"))
            page.evaluate("document.querySelector('.tablewrap--board').scrollTop = 0")
            page.click("#reset")
            page.wait_for_timeout(300)

        # 3 — the same board after a real click on the Worth verdict segment.
        if want(3):
            page.click("#verdict-segs button[data-verdict='Worth']")
            page.wait_for_timeout(400)
            wrap_top = page.evaluate("() => { const w = document.querySelector('.tablewrap--board'); return [w.scrollTop, w.scrollHeight, w.clientHeight]; }")
            print("filtered DOM", check(page, errors), "wrap", wrap_top, "firstRow", page.evaluate("() => { const r = document.querySelector('#rows tr'); const w = document.querySelector('.tablewrap--board'); return Math.round(r.getBoundingClientRect().top - w.getBoundingClientRect().top); }"))
            page.evaluate("""() => {
              const wrap = document.querySelector('.tablewrap--board');
              wrap.scrollTop = 0;
              const head = document.querySelector('.board-head');
              window.scrollTo(0, Math.max(0, head.getBoundingClientRect().top + window.scrollY - 8));
            }""")
            page.wait_for_timeout(300)
            n, q = save_jpeg(page, shots / "3-filtered.jpg")
            print("SHOT 3-filtered.jpg", n, "q", q, "scroll", page.evaluate("window.scrollY"))
            page.evaluate("document.querySelector('.tablewrap--board').scrollTop = 0")
            page.click("#reset")
            page.wait_for_timeout(200)

        # 4 — scatter + ablation + splits, then the Steakhouse sheet.
        if want(4):
            page.evaluate("""() => {
              const sc = document.querySelector('#scatter').closest('figure');
              const top = sc.getBoundingClientRect().top + window.scrollY - 8;
              window.scrollTo(0, Math.max(0, top));
            }""")
            page.wait_for_timeout(300)
            page.evaluate("""() => {
              const tr = Array.from(document.querySelectorAll('#rows tr')).find(r => /steak/i.test(r.textContent));
              tr.querySelector('button[data-open]').click();
            }""")
            page.wait_for_selector("#sheet[open]", timeout=5000)
            page.wait_for_timeout(500)
            print("sheet DOM", check(page, errors))
            n, q = save_jpeg(page, shots / "4-model.jpg")
            print("SHOT 4-model.jpg", n, "q", q, "scroll", page.evaluate("window.scrollY"))
            page.evaluate("document.querySelector('#sheet').close()")

        print("final DOM", check(page, errors))
        print("errors", errors)
        for name, desc in SHOTS:
            p = shots / name
            print(name, "bytes", p.stat().st_size if p.exists() else "MISSING", "-", desc)
        ctx.close()


if __name__ == "__main__":
    main()
