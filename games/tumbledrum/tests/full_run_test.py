#!/usr/bin/env python3
"""Accelerated whole-run simulation for campaign and Endless progression."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

from host_test_support import GamePage


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("target")
    args = parser.parse_args()

    page_errors: list[str] = []
    console_errors: list[str] = []

    with sync_playwright() as p:
        launch_options = {
            "headless": True,
            "args": ["--disable-gpu", "--no-sandbox"],
        }
        executable = os.environ.get("CHROMIUM_EXECUTABLE")
        if not executable and Path("/usr/bin/chromium").exists():
            executable = "/usr/bin/chromium"
        if executable:
            launch_options["executable_path"] = executable
        browser = p.chromium.launch(**launch_options)
        page = GamePage(browser.new_page(viewport={"width": 900, "height": 1200}))
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.goto(args.target, wait_until="load")
        page.wait_for_function("typeof window.__TUMBLEDRUM__?.debugSnapshot === 'function'")

        campaign_script = """() => {
              const g = window.__TUMBLEDRUM__;
              g.settings.audio = false;
              g.settings.music = false;
              g.settings.motion = false;
              g.audio.setSettings(g.settings);
              if (!g.rng || !Number.isInteger(g.rng.state) || !Number.isFinite(g.time)) {
                throw new TypeError('TUMBLEDRUM full-run requires the gameplay RNG and simulation clock.');
              }
              g.rng.state = 0x51a7c0de;
              g.time = 0;
              g.accumulator = 0;
              g.startRun('campaign');
              let elapsed = 0;
              for (let i=0; i<120*60*20; i++) {
                const live = g.balls && (g.balls.find(b => b.alive && !b.stuck) || g.balls[0]);
                if (live && g.paddle) {
                  g.pointer.active = true;
                  g.pointer.x = Math.max(70, Math.min(830, live.x + live.vx * 0.025));
                }
                if (g.state === 'upgrade') g.chooseUpgrade(1);
                g.update(1/120);
                elapsed = i / 120;
                if (g.state === 'victory') break;
              }
              return {elapsed, snapshot:g.debugSnapshot(), save:g.save, boss:g.boss ? {hp:g.boss.hp, phase:g.boss.phase} : null};
            }"""
        campaign = page.evaluate(campaign_script)
        campaign_repeat = page.evaluate(campaign_script)
        assert campaign_repeat == campaign, {"first": campaign, "repeat": campaign_repeat}
        assert campaign["snapshot"]["state"] == "victory", campaign
        assert campaign["save"]["cleared"] is True, campaign
        assert campaign["save"]["stamps"]["boss"] is True, campaign

        endless_script = """() => {
              const g = window.__TUMBLEDRUM__;
              g.settings.motion = false;
              if (!g.rng || !Number.isInteger(g.rng.state) || !Number.isFinite(g.time)) {
                throw new TypeError('TUMBLEDRUM full-run requires the gameplay RNG and simulation clock.');
              }
              g.rng.state = 0x51a7c0de;
              g.time = 0;
              g.accumulator = 0;
              g.startRun('endless');
              let reached = 1;
              let elapsed = 0;
              for (let i=0; i<120*60*25; i++) {
                const live = g.balls && (g.balls.find(b => b.alive && !b.stuck) || g.balls[0]);
                if (live && g.paddle) {
                  g.pointer.active = true;
                  g.pointer.x = Math.max(70, Math.min(830, live.x + live.vx * 0.025));
                }
                if (g.state === 'upgrade') g.chooseUpgrade(1);
                g.update(1/120);
                elapsed = i / 120;
                reached = Math.max(reached, g.endlessWave || 1);
                if (reached >= 12 && g.state === 'playing') break;
                if (g.state === 'gameover') break;
              }
              return {elapsed, reached, snapshot:g.debugSnapshot(), save:g.save};
            }"""
        endless = page.evaluate(endless_script)
        endless_repeat = page.evaluate(endless_script)
        assert endless_repeat == endless, {"first": endless, "repeat": endless_repeat}
        assert endless["reached"] >= 12, endless
        assert endless["save"]["stamps"]["endless"] is True, endless
        assert endless["save"]["bestEndless"] >= 12, endless

        browser.close()

    assert not page_errors, page_errors
    assert not console_errors, console_errors
    print(json.dumps({"campaign": campaign, "endless": endless, "page_errors": page_errors, "console_errors": console_errors}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
