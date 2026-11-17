"""Render the Launch Radar dashboard with Camoufox and save the entry's screenshots.

Usage: TMPDIR=/home/hatch/workspace/camoufox/tmp \
       /home/hatch/workspace/camoufox/venv/bin/python scripts/shots.py --out <output dir> --shots <screenshots dir> [--only 1]

The page is opened from the copied output (out/dashboard/index.html) through file://, so every screen is
the page's own script drawing its own data.js: nothing is injected.
"""
import argparse
import io
import pathlib
import sys

from PIL import Image
from camoufox.sync_api import Camoufox

VIEW = {"width": 1333, "height": 1067}
SCALE = 1.0
SHOT_SIDE = (960, 1280)  # short, long
TARGET = (300 * 1024, 350 * 1024)


def shoot(page, out, min_h=900):
    png = page.screenshot(full_page=False)
    im = Image.open(io.BytesIO(png)).convert("RGB")
    w, h = im.size
    # Keep the dossier's limits: long side <= 1440, short side >= 800.
    if max(w, h) > SHOT_SIDE[1] or min(w, h) < SHOT_SIDE[0]:
        raise SystemExit(f"viewport {w}x{h} is outside 1440x800")
    for q in range(96, 20, -2):
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=q, optimize=True, progressive=False, subsampling=2)
        n = buf.tell()
        if n <= TARGET[1]:
            if n >= TARGET[0] or q <= 22:
                out.write_bytes(buf.getvalue())
                return n, q
    raise SystemExit("could not fit the screenshot into 300-350 KB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--shots", required=True)
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    out = pathlib.Path(a.out)
    shots = pathlib.Path(a.shots)
    shots.mkdir(parents=True, exist_ok=True)
    page_url = (out / "dashboard" / "index.html").resolve().as_uri()

    with Camoufox(headless=True, geoip=False, humanize=False, os="macos") as browser:
        ctx = browser.new_context(viewport=VIEW, device_scale_factor=SCALE, ignore_https_errors=True)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append("console " + m.type + ": " + m.text) if m.type == "error" else None)
        page.goto(page_url, wait_until="load")
        page.wait_for_selector("#rows tr", timeout=20000)
        page.wait_for_timeout(500)
        print("rows", page.locator("#rows tr").count(), "errors", errors)
        print("checks", page.inner_text("#checks-body")[:600])
        print("acct", page.inner_text("#acct-body")[:600])
        print("colophon", page.inner_text("#colophon"))
        print("snapshot", page.inner_text("#snapshot"))
        n, q = shoot(page, shots / "probe.jpg")
        print("probe bytes", n, "q", q)
        ctx.close()


if __name__ == "__main__":
    main()
