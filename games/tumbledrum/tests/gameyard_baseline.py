#!/usr/bin/env python3
"""Run the pinned TUMBLEDRUM standalone baseline as one GameYard gate."""

from __future__ import annotations

from functools import partial
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import sys
from threading import Thread
from typing import Any

from playwright.sync_api import Browser, Page, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM_CHECKSUM_COUNT = 36
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
        raise RuntimeError(
            "TUMBLEDRUM's GameYard baseline owns CHROMIUM_EXECUTABLE; unset the external override."
        )
    with sync_playwright() as playwright:
        executable = Path(playwright.chromium.executable_path)
    if not executable.is_file():
        raise RuntimeError(
            "The Chromium revision required by playwright==1.61.0 is missing; "
            "install the pinned Playwright browser before running the baseline."
        )
    return str(executable)


def verify_upstream_checksums() -> None:
    entries = []
    for line in (ROOT / "SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
        expected, logical_path = line.split(maxsplit=1)
        path = ROOT / logical_path.removeprefix("./")
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        assert actual == expected, f"Checksum mismatch: {logical_path}"
        entries.append(logical_path)
    assert len(entries) == UPSTREAM_CHECKSUM_COUNT, entries
    assert "const FIXED_DT = 1 / 120;" in (ROOT / "src/game.js").read_text(encoding="utf-8")


def run_original(script: str, target: str, environment: dict[str, str]) -> dict[str, Any]:
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


def assert_no_browser_errors(page: Page, page_errors: list[str], console_errors: list[str]) -> None:
    assert not page_errors, page_errors
    assert not console_errors, console_errors
    metrics = page.evaluate(
        """() => {
          const canvas = document.getElementById('game').getBoundingClientRect();
          return {
            innerWidth,
            innerHeight,
            scrollWidth: document.documentElement.scrollWidth,
            scrollHeight: document.documentElement.scrollHeight,
            canvas: {
              left:canvas.left,
              top:canvas.top,
              right:canvas.right,
              bottom:canvas.bottom,
              width:canvas.width,
              height:canvas.height,
            },
          };
        }"""
    )
    assert metrics["scrollWidth"] <= metrics["innerWidth"], metrics
    assert metrics["scrollHeight"] <= metrics["innerHeight"], metrics
    assert metrics["canvas"]["width"] > 0 and metrics["canvas"]["height"] > 0, metrics
    assert metrics["canvas"]["left"] >= 0 and metrics["canvas"]["top"] >= 0, metrics
    assert metrics["canvas"]["right"] <= metrics["innerWidth"] + 1, metrics
    assert metrics["canvas"]["bottom"] <= metrics["innerHeight"] + 1, metrics


def observe_fixed_step(page: Page) -> dict[str, int]:
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
            if (accumulatorAfterDraw.length < 128) {
              accumulatorAfterDraw.push(game.accumulator);
            }
            return originalDraw();
          };
          await new Promise((resolve) => setTimeout(resolve, 450));
          return { updateArguments, accumulatorAfterDraw };
        }"""
    )
    fixed_dt = 1 / 120
    update_arguments = samples["updateArguments"]
    accumulators = samples["accumulatorAfterDraw"]
    assert len(update_arguments) >= 5, samples
    assert len(accumulators) >= 3, samples
    assert all(abs(argument - fixed_dt) < 1e-12 for argument in update_arguments), samples
    assert all(-1e-12 <= accumulator < fixed_dt + 1e-12 for accumulator in accumulators), samples
    return {"updates": len(update_arguments), "frames": len(accumulators)}


def start_campaign_with_pointer(page: Page, mobile: bool) -> str:
    canvas = page.locator("#game").bounding_box()
    assert canvas is not None and canvas["width"] > 0 and canvas["height"] > 0, canvas
    x = canvas["x"] + canvas["width"] * (450 / 900)
    y = canvas["y"] + canvas["height"] * (960 / 1200)
    if mobile:
        page.touchscreen.tap(x, y)
        expected_pointer = "touch"
    else:
        page.mouse.click(x, y)
        expected_pointer = "mouse"
    page.wait_for_function("window.__TUMBLEDRUM__.debugSnapshot().state === 'playing'")
    pointer_type = page.evaluate("window.__TUMBLEDRUM__.pointer.type")
    assert pointer_type == expected_pointer, pointer_type
    return pointer_type


def responsive_smoke(browser: Browser, targets: dict[str, str]) -> list[dict[str, Any]]:
    results = []
    for build, target in targets.items():
        for viewport in VIEWPORTS:
            context = browser.new_context(
                viewport={"width": viewport["width"], "height": viewport["height"]},
                device_scale_factor=viewport["scale"],
                is_mobile=viewport["mobile"],
                has_touch=viewport["mobile"],
                locale="en-US",
            )
            page = context.new_page()
            page_errors: list[str] = []
            console_errors: list[str] = []
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.on(
                "console",
                lambda message: console_errors.append(message.text)
                if message.type == "error"
                else None,
            )
            page.goto(target, wait_until="load")
            page.wait_for_function("typeof window.__TUMBLEDRUM__?.debugSnapshot === 'function'")
            assert page.evaluate("window.__TUMBLEDRUM__.debugSnapshot().state") == "title"
            fixed_step = observe_fixed_step(page)
            pointer_type = start_campaign_with_pointer(page, viewport["mobile"])
            assert_no_browser_errors(page, page_errors, console_errors)
            results.append(
                {
                    "build": build,
                    "viewport": viewport["name"],
                    "pointer": pointer_type,
                    "fixedStep": fixed_step,
                }
            )
            context.close()
    return results


def main() -> None:
    verify_upstream_checksums()
    subprocess.run(
        [sys.executable, str(ROOT / "tools/build_single.py")],
        cwd=ROOT,
        check=True,
    )
    verify_upstream_checksums()

    handler = partial(QuietHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    source_url = f"http://127.0.0.1:{server.server_port}/"
    single_file_url = (ROOT / "TUMBLEDRUM_PLAY.html").as_uri()
    environment = os.environ.copy()
    environment["PYTHONIOENCODING"] = "utf-8"
    executable = pinned_chromium_executable()
    environment["CHROMIUM_EXECUTABLE"] = executable

    try:
        source_smoke = run_original("smoke_test.py", source_url, environment)
        single_file_smoke = run_original("smoke_test.py", single_file_url, environment)
        integration = run_original("integration_test.py", source_url, environment)
        regression = run_original("regression_test.py", source_url, environment)
        full_run = run_original("full_run_test.py", source_url, environment)
        assert len(integration["stages"]) == 13, integration["stages"]
        assert integration["page_errors"] == [] and integration["console_errors"] == []
        assert regression["regressions"]["orientedCollision"]["destroyed"] is True
        assert full_run["campaign"]["snapshot"]["state"] == "victory", full_run
        assert 0 < full_run["campaign"]["elapsed"] < MAX_CAMPAIGN_SECONDS, full_run
        assert full_run["endless"]["reached"] == 12, full_run

        launch_options: dict[str, Any] = {"headless": True, "args": ["--no-sandbox"]}
        launch_options["executable_path"] = executable
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(**launch_options)
            responsive = responsive_smoke(
                browser,
                {"source": source_url, "single-file": single_file_url},
            )
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()

    print(
        json.dumps(
            {
                "upstreamChecksums": UPSTREAM_CHECKSUM_COUNT,
                "sourceSmoke": source_smoke["campaign"]["state"],
                "singleFileSmoke": single_file_smoke["campaign"]["state"],
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
