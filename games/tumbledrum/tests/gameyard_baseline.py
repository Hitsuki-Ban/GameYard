#!/usr/bin/env python3
"""Run TUMBLEDRUM's preserved behavior against the built GameYard guest."""

from __future__ import annotations

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import sys
from threading import Thread
from typing import Any
from urllib.parse import urlencode

from playwright.sync_api import Browser, sync_playwright

from host_test_support import GamePage

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parents[1]
STAGE = WORKSPACE / ".gameyard" / "stage" / "games" / "tumbledrum"
MAX_CAMPAIGN_SECONDS = 20 * 60
VIEWPORTS = (
    {"name": "desktop", "width": 1050, "height": 1300, "scale": 1, "mobile": False},
    {"name": "portrait", "width": 390, "height": 844, "scale": 2, "mobile": True},
    {"name": "landscape", "width": 844, "height": 390, "scale": 2, "mobile": True},
)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        return


def pinned_chromium_executable() -> str:
    if "CHROMIUM_EXECUTABLE" in os.environ:
        raise RuntimeError("The TUMBLEDRUM gate owns CHROMIUM_EXECUTABLE; unset the override.")
    with sync_playwright() as playwright:
        executable = Path(playwright.chromium.executable_path)
    if not executable.is_file():
        raise RuntimeError("The Chromium revision pinned by uv.lock is missing.")
    return str(executable)


def run_program(script: str, target: str, environment: dict[str, str]) -> dict[str, Any]:
    result = subprocess.run(
        [sys.executable, str(ROOT / "tests" / script), target],
        cwd=ROOT,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr, file=sys.stderr)
        raise RuntimeError(f"{script} failed with exit code {result.returncode}.")
    return json.loads(result.stdout)


def observe_fixed_step(page: GamePage) -> dict[str, int]:
    samples = page.evaluate(
        """async () => {
          const game = window.__TUMBLEDRUM__;
          const updateArguments = [];
          const accumulatorAfterDraw = [];
          const originalUpdate = game.update.bind(game);
          const originalDraw = game.draw.bind(game);
          game.update = (dt) => {
            if (updateArguments.length < 256) updateArguments.push(dt);
            return originalUpdate(dt);
          };
          game.draw = () => {
            if (accumulatorAfterDraw.length < 128) accumulatorAfterDraw.push(game.accumulator);
            return originalDraw();
          };
          await new Promise((resolve) => setTimeout(resolve, 450));
          return { updateArguments, accumulatorAfterDraw };
        }"""
    )
    fixed_dt = 1 / 120
    assert len(samples["updateArguments"]) >= 5, samples
    assert len(samples["accumulatorAfterDraw"]) >= 3, samples
    assert all(abs(argument - fixed_dt) < 1e-12 for argument in samples["updateArguments"]), samples
    assert all(-1e-12 <= value < fixed_dt + 1e-12 for value in samples["accumulatorAfterDraw"]), samples
    return {"updates": len(samples["updateArguments"]), "frames": len(samples["accumulatorAfterDraw"])}


def start_campaign_with_pointer(page: GamePage, mobile: bool) -> str:
    canvas = page.locator("#game").bounding_box()
    assert canvas is not None
    x = canvas["x"] + canvas["width"] * 450 / 900
    y = canvas["y"] + canvas["height"] * 960 / 1200
    if mobile:
        page.touchscreen.tap(x, y)
        expected = "touch"
    else:
        page.mouse.click(x, y)
        expected = "mouse"
    page.wait_for_function("window.__TUMBLEDRUM__.state === 'playing'")
    assert page.evaluate("window.__TUMBLEDRUM__.pointer.type") == expected
    return expected


def responsive_smoke(browser: Browser, target: str) -> list[dict[str, Any]]:
    results = []
    for viewport in VIEWPORTS:
        context = browser.new_context(
            viewport={"width": viewport["width"], "height": viewport["height"]},
            device_scale_factor=viewport["scale"],
            is_mobile=viewport["mobile"],
            has_touch=viewport["mobile"],
        )
        page = GamePage(context.new_page())
        errors: list[str] = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(target, wait_until="load")
        page.wait_for_function("typeof window.__TUMBLEDRUM__?.debugSnapshot === 'function'")
        fixed_step = observe_fixed_step(page)
        pointer = start_campaign_with_pointer(page, viewport["mobile"])
        metrics = page.evaluate(
            """() => {
              const canvas = document.getElementById('game').getBoundingClientRect();
              return { width: innerWidth, height: innerHeight, canvas: {...canvas.toJSON()} };
            }"""
        )
        assert not errors, errors
        assert metrics["canvas"]["width"] > 0 and metrics["canvas"]["height"] > 0, metrics
        assert metrics["canvas"]["right"] <= metrics["width"] + 1, metrics
        assert metrics["canvas"]["bottom"] <= metrics["height"] + 1, metrics
        results.append({"viewport": viewport["name"], "pointer": pointer, "fixedStep": fixed_step})
        context.close()
    return results


def main() -> None:
    manifest_path = STAGE / "game.manifest.json"
    if not manifest_path.is_file():
        raise RuntimeError("TUMBLEDRUM stage is missing; run `vp run tumbledrum#build` first.")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["entry"] == "index.html"
    assert all(not file.startswith("tests/") for file in manifest["files"]), manifest
    assert "TUMBLEDRUM_PLAY.html" not in manifest["files"], manifest

    handler = partial(QuietHandler, directory=str(WORKSPACE))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    query = urlencode({"game": "/.gameyard/stage/games/tumbledrum/index.html", "locale": "en"})
    target = (
        f"http://127.0.0.1:{server.server_port}/games/tumbledrum/tests/host_harness.html?{query}"
    )
    environment = os.environ.copy()
    environment["PYTHONIOENCODING"] = "utf-8"
    environment["CHROMIUM_EXECUTABLE"] = pinned_chromium_executable()

    try:
        smoke = run_program("smoke_test.py", target, environment)
        integration = run_program("integration_test.py", target, environment)
        regression = run_program("regression_test.py", target, environment)
        full_run = run_program("full_run_test.py", target, environment)
        assert len(integration["stages"]) == 13, integration["stages"]
        assert regression["regressions"]["orientedCollision"]["destroyed"] is True
        assert full_run["campaign"]["snapshot"]["state"] == "victory", full_run
        assert 0 < full_run["campaign"]["elapsed"] < MAX_CAMPAIGN_SECONDS, full_run
        assert full_run["endless"]["reached"] == 12, full_run

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox"],
                executable_path=environment["CHROMIUM_EXECUTABLE"],
            )
            responsive = responsive_smoke(browser, target)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()

    print(
        json.dumps(
            {
                "smoke": smoke["campaign"]["state"],
                "authoredStages": len(integration["stages"]),
                "campaignSeconds": round(full_run["campaign"]["elapsed"], 2),
                "endlessWave": full_run["endless"]["reached"],
                "responsive": responsive,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
