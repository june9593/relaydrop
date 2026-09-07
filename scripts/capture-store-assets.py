"""Render store screenshots from production UI components and fictional data.

Requires Python Playwright, installed Microsoft Edge, and Pillow. Run with a local Vite
server on port 4186; the fixture never loads Microsoft authentication or Graph.
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "release" / "edge-store" / "assets"
OUT.mkdir(parents=True, exist_ok=True)
logo = Image.open(ROOT / "public" / "icon-512.png").convert("RGBA")
mask = Image.new("L", logo.size, 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, 511, 511), radius=112, fill=255)
logo.putalpha(mask)
logo.resize((300, 300), Image.Resampling.LANCZOS).save(OUT / "logo-300.png")

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=1, locale="en-US")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    external = []

    def route(request):
        if request.request.url.startswith("http://127.0.0.1:4186/"):
            request.continue_()
        else:
            external.append(request.request.url.split("?", 1)[0])
            request.abort()

    context.route("http*://**/*", route)
    for i, scene in enumerate(["inbox", "downloads", "dark"], 1):
        page.goto(f"http://127.0.0.1:4186/scripts/store-preview/index.html?scene={scene}")
        page.wait_for_load_state("networkidle")
        frame = page.frame_locator("#panel")
        frame.get_by_text("weekend-guide.pdf", exact=True).wait_for()
        print(json.dumps({"scene": scene, "buttons": frame.get_by_role("button").all_text_contents()}))
        if scene == "dark":
            frame.get_by_role("button", name="Open account menu for Alex").click()
            frame.get_by_role("button", name="Settings", exact=True).click()
            frame.get_by_role("radio", name="Dark Comfortable in low light").check()
            frame.get_by_role("dialog", name="Settings").wait_for()
        if scene == "downloads":
            frame.get_by_role("button", name="Open local", exact=True).wait_for()
            frame.get_by_role("button", name="Delete local", exact=True).wait_for()
        if scene != "dark":
            frame.get_by_role("heading", name="Recent items").evaluate(
                "element => element.scrollIntoView({block: 'start', behavior: 'instant'})"
            )
        page.evaluate("document.fonts.ready")
        for f in page.frames:
            f.evaluate("document.fonts.ready")
        page.screenshot(path=str(OUT / f"0{i}-{scene}.png"), animations="disabled")
    assert not errors, errors
    assert not external, external
    context.close()
    browser.close()

for path in sorted(OUT.glob("*.png")):
    with Image.open(path) as im:
        expected = (300, 300) if path.name.startswith("logo") else (1280, 800)
        assert im.size == expected, (path.name, im.size)
        print(json.dumps({"asset": path.name, "size": im.size, "bytes": path.stat().st_size}))
