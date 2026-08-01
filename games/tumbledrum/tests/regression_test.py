#!/usr/bin/env python3
"""Regression checks for localization, input, and repaired game-state boundaries."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from playwright.sync_api import Browser, Page, sync_playwright

from host_test_support import GamePage


def launch_browser(playwright: Any) -> Browser:
    options: dict[str, Any] = {
        "headless": True,
        "args": ["--disable-gpu", "--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
    }
    executable = os.environ.get("CHROMIUM_EXECUTABLE")
    if executable:
        options["executable_path"] = executable
    return playwright.chromium.launch(**options)


def canvas_point(page: Page, x: float, y: float) -> tuple[float, float]:
    box = page.locator("#game").bounding_box()
    assert box is not None
    return box["x"] + box["width"] * x / 900, box["y"] + box["height"] * y / 1200


def click_canvas(page: Page, x: float, y: float) -> None:
    page.mouse.click(*canvas_point(page, x, y))


def wait_for_game(raw_page: Page, target: str) -> GamePage:
    page = GamePage(raw_page)
    page.goto(target, wait_until="load")
    page.wait_for_function("typeof window.__TUMBLEDRUM__?.debugSnapshot === 'function'")
    return page


def locale_matrix(browser: Browser, target: str) -> list[dict[str, Any]]:
    expected = {
        "ja-JP": ("ja", "祭典ブレイカー"),
        "zh-CN": ("zh-Hans", "滚鼓祭"),
        "en-US": ("en", "Festival Breaker"),
    }
    results: list[dict[str, Any]] = []
    for browser_locale, (effective_locale, title_fragment) in expected.items():
        context = browser.new_context(locale=browser_locale, viewport={"width": 1050, "height": 1300})
        page = wait_for_game(context.new_page(), target)
        page.host_evaluate("resolved => window.gameyardTestHost.applyLocale(resolved)", effective_locale)
        page.wait_for_function("resolved => window.TD.I18N.locale === resolved", arg=effective_locale)
        state = page.evaluate(
            """() => ({
              locale: window.TD.I18N.locale,
              htmlLang: document.documentElement.lang,
              title: document.title,
              description: document.querySelector('meta[name="description"]').content,
              mainAria: document.querySelector('main.stage').getAttribute('aria-label'),
              canvasAria: document.getElementById('game').getAttribute('aria-label'),
              status: document.getElementById('status').textContent,
            })"""
        )
        assert state["locale"] == effective_locale and state["htmlLang"] == effective_locale, state
        assert title_fragment in state["title"], state
        assert all(state[key] for key in ("description", "mainAria", "canvasAria", "status")), state
        results.append({"browserLocale": browser_locale, **state})
        context.close()
    return results


def manual_language_and_keyboard(page: GamePage, _target: str) -> dict[str, Any]:
    page.evaluate("localStorage.clear()")
    page.reload(wait_until="load")
    page.wait_for_function("typeof window.__TUMBLEDRUM__?.debugSnapshot === 'function'")

    # Keyboard-only title -> settings, game-local contrast toggle, and close.
    page.locator("#game").focus()
    page.keyboard.press("ArrowRight")
    page.keyboard.press("ArrowRight")
    page.keyboard.press("Enter")
    assert page.evaluate("window.__TUMBLEDRUM__.state") == "settings"
    assert page.locator("#status").text_content() == "Settings. Adjust contrast or request fullscreen."
    page.keyboard.press("Enter")
    assert page.evaluate("window.__TUMBLEDRUM__.settings.contrast") is True
    english_setting_status = page.locator("#status").text_content()
    assert english_setting_status and "High contrast" in english_setting_status, english_setting_status
    page.keyboard.press("Escape")
    assert page.evaluate("window.__TUMBLEDRUM__.state") == "title"

    # Locale is changed only by an exact Host command, never browser or storage state.
    page.host_evaluate("window.gameyardTestHost.applyLocale('zh-Hans')")
    page.wait_for_function("window.TD.I18N.locale === 'zh-Hans'")
    assert "滚鼓祭" in page.title()
    stored = page.evaluate("localStorage.getItem('tumbledrum-settings-v1')")
    assert stored is None
    return {
        "stored": stored,
        "snapshot": page.evaluate("window.__TUMBLEDRUM__.debugSnapshot()"),
        "settingStatus": english_setting_status,
    }


def gamepad_pause_cycle(page: Page) -> dict[str, Any]:
    page.evaluate(
        """() => {
          const buttons = Array.from({length:16}, () => ({pressed:false}));
          window.__tdTestPad = {axes:[0], buttons};
          window.__tdOriginalGetGamepads = navigator.getGamepads;
          Object.defineProperty(navigator, 'getGamepads', {
            configurable:true,
            value:() => [window.__tdTestPad],
          });
          window.__TUMBLEDRUM__.startRun('campaign');
          buttons[9].pressed = true;
        }"""
    )
    page.wait_for_function("window.__TUMBLEDRUM__.paused === true")
    page.evaluate("window.__tdTestPad.buttons[9].pressed = false")
    page.host_evaluate("window.gameyardTestHost.resume()")
    page.wait_for_function("window.__TUMBLEDRUM__.paused === false")
    result = page.evaluate(
        """() => {
          const value = {
            paused: window.__TUMBLEDRUM__.paused,
            status: document.getElementById('status').textContent,
          };
          Object.defineProperty(navigator, 'getGamepads', {
            configurable:true,
            value:window.__tdOriginalGetGamepads,
          });
          delete window.__tdTestPad;
          delete window.__tdOriginalGetGamepads;
          return value;
        }"""
    )
    assert result["paused"] is False and result["status"], result
    return result


def state_regressions(page: Page) -> dict[str, Any]:
    result = page.evaluate(
        """() => {
          const g = window.__TUMBLEDRUM__;

          // The ball touches the visible top of a 90-degree rotated brick,
          // outside that brick's old axis-aligned hit box.
          g.startRun('campaign');
          const rotated = g.makeBrick(
            {type:'paper', x:390, y:370, w:120, h:40, required:true, rotation:Math.PI/2},
            9001
          );
          g.bricks = [rotated];
          const ball = g.balls[0];
          ball.stuck = false;
          ball.x = 450;
          ball.y = 336;
          ball.vx = 0;
          ball.vy = 600;
          g.collideBricks(ball);
          const orientedCollision = {destroyed:rotated.destroyed, vy:ball.vy};

          // Near the cap, every shown charm is still a real improvement.
          g.startRun('endless');
          for (const upgrade of window.TD.CONTENT.UPGRADES) g.runUpgrades[upgrade.id] = upgrade.max;
          g.runUpgrades.reserve = 2;
          g.reserve = 0;
          g.enterUpgrade({type:'endless', wave:2});
          const offers = g.upgradeOffers.map((offer) => offer.id);
          g.chooseUpgrade(0);
          const reserveAfterChoice = g.reserve;

          // New runs and Endless mode do not inherit or update campaign skill.
          g.skillEstimate = 6;
          g.startRun('campaign');
          const skillAfterNewRun = g.skillEstimate;
          g.startRun('endless');
          g.sweetHitsStage = 20;
          g.drainsThisStage = 0;
          g.enterStageClear();
          const skillAfterEndlessClear = g.skillEstimate;

          // Reduced motion has a materially smaller, capped visual budget.
          g.startRun('campaign');
          g.particles.length = 0;
          g.settings.motion = true;
          g.spawnPaperBurst(450, 400, g.palette.paper, 100, 1);
          const fullParticles = g.particles.length;
          g.particles.length = 0;
          g.streamers.length = 0;
          g.settings.motion = false;
          g.spawnPaperBurst(450, 400, g.palette.paper, 100, 1);
          for (let i=0; i<20; i++) g.spawnStreamer(true);
          const reducedParticles = g.particles.length;
          const reducedStreamers = g.streamers.length;

          // Stamp and associated best-wave update share one persistence write.
          g.save.bestEndless = 0;
          g.save.stamps.endless = false;
          g.unlockStamp('endless');
          const persisted = JSON.parse(localStorage.getItem('gameyard.game.tumbledrum.save.v1'));

          // Standard-mapping D-pad right drives the paddle axis.
          const buttons = Array.from({length:16}, () => ({pressed:false}));
          buttons[15].pressed = true;
          const pad = {axes:[0], buttons};
          const originalGetGamepads = navigator.getGamepads;
          Object.defineProperty(navigator, 'getGamepads', {configurable:true, value:() => [pad]});
          g.startRun('campaign');
          g.pollGamepad();
          const dpadAxis = g.gamepad.axis;
          Object.defineProperty(navigator, 'getGamepads', {configurable:true, value:originalGetGamepads});

          // Guest visibility never owns lifecycle policy.
          g.state = 'stageClear';
          g.paused = false;
          Object.defineProperty(document, 'hidden', {configurable:true, value:true});
          document.dispatchEvent(new Event('visibilitychange'));
          const hiddenPaused = g.paused;

          return {
            orientedCollision,
            offers,
            reserveAfterChoice,
            skillAfterNewRun,
            skillAfterEndlessClear,
            fullParticles,
            reducedParticles,
            reducedStreamers,
            persistedBestEndless:persisted.bestEndless,
            persistedStamp:persisted.stamps.endless,
            persistedSchemaVersion:persisted.schemaVersion,
            persistedContrast:persisted.contrast,
            dpadAxis,
            hiddenPaused,
          };
        }"""
    )
    assert result["orientedCollision"]["destroyed"] is True and result["orientedCollision"]["vy"] < 0, result
    assert result["offers"] == ["reserve"] and result["reserveAfterChoice"] == 1, result
    assert result["skillAfterNewRun"] == 0 and result["skillAfterEndlessClear"] == 0, result
    assert result["reducedParticles"] < result["fullParticles"] and result["reducedParticles"] <= 180, result
    assert result["reducedStreamers"] == 0, result
    assert result["persistedBestEndless"] == 10 and result["persistedStamp"] is True, result
    assert result["persistedSchemaVersion"] == 1 and result["persistedContrast"] is True, result
    assert result["dpadAxis"] == 1 and result["hiddenPaused"] is False, result
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("target")
    args = parser.parse_args()

    with sync_playwright() as playwright:
        browser = launch_browser(playwright)
        matrix = locale_matrix(browser, args.target)
        context = browser.new_context(locale="en-US", viewport={"width": 1050, "height": 1300})
        page = wait_for_game(context.new_page(), args.target)
        manual = manual_language_and_keyboard(page, args.target)
        pause_cycle = gamepad_pause_cycle(page)
        regressions = state_regressions(page)
        context.close()
        browser.close()

    print(
        json.dumps(
            {
                "localeMatrix": matrix,
                "manual": manual,
                "gamepadPauseCycle": pause_cycle,
                "regressions": regressions,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
