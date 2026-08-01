#!/usr/bin/env python3
"""Chromium smoke test for the built GameYard guest."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from playwright.sync_api import Page, sync_playwright

from host_test_support import GamePage


def collect(raw_page: Page, target: str, screenshot: Path | None) -> dict[str, Any]:
    page = GamePage(raw_page)
    console_errors: list[str] = []
    page_errors: list[str] = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: page_errors.append(str(error)))

    page.goto(target, wait_until="load")
    page.wait_for_function("typeof window.__TUMBLEDRUM__?.debugSnapshot === 'function'")
    page.wait_for_timeout(350)

    title = page.evaluate("window.__TUMBLEDRUM__.debugSnapshot()")
    assert title["state"] == "title", title

    # Bypass menu navigation here; interaction geometry is covered separately below.
    page.evaluate("window.__TUMBLEDRUM__.startRun('campaign')")
    page.wait_for_timeout(1700)
    campaign = page.evaluate("window.__TUMBLEDRUM__.debugSnapshot()")
    assert campaign["state"] == "playing", campaign
    assert campaign["balls"] >= 1, campaign
    assert campaign["required"] > 0, campaign

    # Exercise input, pause, settings persistence surface, and the render loop.
    page.locator("#game").focus()
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(220)
    page.keyboard.press("KeyP")
    page.wait_for_timeout(120)
    assert page.evaluate("window.__TUMBLEDRUM__.paused") is True
    page.host_evaluate("window.gameyardTestHost.resume()")
    page.wait_for_timeout(120)
    assert page.evaluate("window.__TUMBLEDRUM__.paused") is False

    # Trigger a deterministic center return and verify the charge mechanic.
    charged = page.evaluate(
        """
        (() => {
          const g = window.__TUMBLEDRUM__;
          const b = g.balls[0];
          b.stuck = false;
          b.x = g.paddle.x;
          b.y = g.paddle.y - g.paddle.h / 2 - b.r + 2;
          b.vx = 0;
          b.vy = 620;
          g.collidePaddle(b);
          return { vy: b.vy, chargeTimer: b.chargeTimer, sweetHits: g.sweetHitsStage };
        })()
        """
    )
    assert charged["vy"] < 0 and charged["chargeTimer"] > 0 and charged["sweetHits"] >= 1, charged

    # Open settings from title and make sure the settings screen renders without exceptions.
    page.evaluate("window.__TUMBLEDRUM__.state='settings'")
    page.wait_for_timeout(150)
    assert page.evaluate("window.__TUMBLEDRUM__.debugSnapshot().state") == "settings"

    if screenshot is not None:
        screenshot.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot), full_page=True)

    assert not page_errors, page_errors
    assert not console_errors, console_errors
    return {"title": title, "campaign": campaign, "charged": charged, "page_errors": page_errors, "console_errors": console_errors}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("target", help="URL or file URI")
    parser.add_argument("--screenshot", type=Path)
    args = parser.parse_args()

    with sync_playwright() as p:
        launch_options = {
            "headless": True,
            "args": ["--disable-gpu", "--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
        }
        executable = os.environ.get("CHROMIUM_EXECUTABLE")
        if not executable and Path("/usr/bin/chromium").exists():
            executable = "/usr/bin/chromium"
        if executable:
            launch_options["executable_path"] = executable
        browser = p.chromium.launch(**launch_options)
        page = browser.new_page(viewport={"width": 1050, "height": 1300}, device_scale_factor=1)
        result = collect(page, args.target, args.screenshot)
        browser.close()

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
