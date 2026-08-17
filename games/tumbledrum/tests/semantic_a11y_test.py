#!/usr/bin/env python3
"""Small keyboard and semantic-control journey for TUMBLEDRUM."""

from __future__ import annotations

import argparse
import json
import os
from typing import Any
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import Browser, sync_playwright

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


def wait_for_game(raw_page: Any, target: str) -> GamePage:
    page = GamePage(raw_page)
    page.goto(target, wait_until="load")
    page.wait_for_function("typeof window.__TUMBLEDRUM__?.debugSnapshot === 'function'")
    return page


def semantic_journey(browser: Browser, target: str) -> dict[str, Any]:
    context = browser.new_context(locale="en-US", viewport={"width": 1050, "height": 1300})
    page = wait_for_game(context.new_page(), target)
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    assert page.evaluate("document.documentElement.dataset.i18nReady") == "true"
    assert page.locator("#semantic-title").get_attribute("hidden") is None
    assert page.locator("#semantic-campaign").get_attribute("aria-describedby") == (
        "campaign-description"
    )
    assert page.locator("#semantic-endless").text_content() == "Start Endless"
    assert page.locator("#semantic-settings-open").text_content() == "Open Settings"
    assert "thirteen" in (page.locator("#campaign-description").text_content() or "")

    # Keyboard-only discovery starts at the canvas, then reaches the first real title button.
    page.locator("#game").focus()
    page.keyboard.press("Tab")
    assert page.evaluate("document.activeElement.id") == "semantic-campaign"
    focused_size = page.locator("#semantic-campaign").bounding_box()
    assert focused_size and focused_size["width"] > 100 and focused_size["height"] > 30
    page.keyboard.press("Enter")
    page.wait_for_function("window.__TUMBLEDRUM__.state === 'playing'")
    assert page.evaluate("document.activeElement.id") == "game"
    assert page.locator("#semantic-gameplay").get_attribute("hidden") is None
    summary = page.locator("#semantic-gameplay-summary").text_content() or ""
    assert all(fragment in summary for fragment in ("Campaign", "Lives", "Score", "Required"))

    # A real semantic Pause button requests Host policy; Resume restores canvas focus.
    page.locator("#semantic-pause-open").focus()
    page.keyboard.press("Enter")
    page.wait_for_function("window.__TUMBLEDRUM__.paused === true")
    assert page.locator("#semantic-pause").get_attribute("hidden") is None
    assert page.evaluate("document.activeElement.id") == "semantic-resume"
    page.keyboard.press("Enter")
    page.wait_for_function("window.__TUMBLEDRUM__.paused === false")
    assert page.evaluate("document.activeElement.id") == "game"

    page.locator("#semantic-pause-open").focus()
    page.keyboard.press("Enter")
    page.wait_for_function("window.__TUMBLEDRUM__.paused === true")
    page.locator("#semantic-pause-exit").focus()
    page.keyboard.press("Enter")
    page.wait_for_function("window.__TUMBLEDRUM__.state === 'title'")
    page.wait_for_function("window.__TUMBLEDRUM__.hostPaused === false")
    assert page.evaluate("document.activeElement.id") == "game"

    # Settings expose names, values, and consequences; live locale changes relabel the active layer.
    page.locator("#semantic-settings-open").focus()
    page.keyboard.press("Enter")
    assert page.evaluate("window.__TUMBLEDRUM__.state") == "settings"
    contrast = page.locator("#semantic-contrast")
    before = contrast.is_checked()
    contrast.focus()
    page.keyboard.press("Space")
    assert contrast.is_checked() is (not before)
    assert "separation" in (page.locator("#contrast-description").text_content() or "")
    page.host_evaluate("window.gameyardTestHost.applyLocale('ja')")
    page.wait_for_function("window.TD.I18N.locale === 'ja'")
    assert page.locator("#semantic-settings-heading").text_content() == "設定"
    assert page.locator("#semantic-settings-back").text_content() == "タイトルへ戻る"

    # Upgrade choices use a labeled group, selected radio, explicit confirmation, and the same action.
    page.host_evaluate("window.gameyardTestHost.applyLocale('zh-Hans')")
    page.wait_for_function("window.TD.I18N.locale === 'zh-Hans'")
    page.evaluate("window.__TUMBLEDRUM__.startRun('campaign')")
    page.evaluate("window.__TUMBLEDRUM__.enterUpgrade({type:'campaign', index:1})")
    options = page.locator("input[name='tumbledrum-upgrade']")
    assert options.count() == 3
    assert page.locator("#semantic-upgrade-heading").text_content() == "选择一枚护符"
    assert options.nth(1).is_checked()
    assert "等级" in (options.nth(0).locator("xpath=following-sibling::span").text_content() or "")
    options.nth(0).focus()
    page.keyboard.press("ArrowRight")
    selected = page.evaluate("window.__TUMBLEDRUM__.menuIndex")
    assert selected == 1
    page.locator("#semantic-upgrade-confirm").focus()
    page.keyboard.press("Enter")
    assert page.evaluate("window.__TUMBLEDRUM__.state") == "upgradeChosen"

    # Result actions are real controls and keep their meaning when the run ends.
    page.evaluate("window.__TUMBLEDRUM__.enterVictory()")
    assert page.locator("#semantic-result").get_attribute("hidden") is None
    assert page.locator("#semantic-result-primary").text_content() == "返回标题"
    assert page.locator("#semantic-result-secondary").text_content() == "开始无尽模式"
    assert not errors, errors
    result = {
        "locale": page.evaluate("window.TD.I18N.locale"),
        "summary": summary,
        "upgradeOptions": options.count(),
    }
    context.close()
    return result


def localized_boot_failure(browser: Browser, host_target: str) -> str:
    parsed = urlparse(host_target)
    game_path = parse_qs(parsed.query)["game"][0]
    direct_target = f"{parsed.scheme}://{parsed.netloc}{game_path}"
    context = browser.new_context(locale="ja-JP", viewport={"width": 800, "height": 900})
    page = context.new_page()
    page.goto(direct_target, wait_until="load")
    failure = page.locator(".boot-failure")
    failure.wait_for(state="visible", timeout=12_000)
    text = failure.text_content() or ""
    assert text == "TUMBLEDRUMをGameYardに接続できませんでした。", text
    assert page.locator("html").get_attribute("lang") == "ja"
    context.close()
    return text


def tap_control(page: GamePage, selector: str) -> None:
    box = page.locator(selector).bounding_box()
    assert box is not None and box["width"] >= 44 and box["height"] >= 44, box
    page.touchscreen.tap(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)


def touch_pause_journey(browser: Browser, target: str) -> dict[str, str]:
    context = browser.new_context(
        locale="en-US",
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
    )
    page = wait_for_game(context.new_page(), target)
    canvas = page.locator("#game").bounding_box()
    assert canvas is not None
    page.touchscreen.tap(
        canvas["x"] + canvas["width"] * 450 / 900,
        canvas["y"] + canvas["height"] * 960 / 1200,
    )
    page.wait_for_function("window.__TUMBLEDRUM__.state === 'playing'")
    tap_control(page, "#semantic-pause-open")
    page.wait_for_function("window.__TUMBLEDRUM__.paused === true")
    tap_control(page, "#semantic-resume")
    page.wait_for_function("window.__TUMBLEDRUM__.paused === false")
    tap_control(page, "#semantic-pause-open")
    page.wait_for_function("window.__TUMBLEDRUM__.paused === true")
    tap_control(page, "#semantic-pause-exit")
    page.wait_for_function(
        "window.__TUMBLEDRUM__.state === 'title' && window.__TUMBLEDRUM__.hostPaused === false"
    )
    result = {"pointer": page.evaluate("window.__TUMBLEDRUM__.pointer.type"), "state": "title"}
    context.close()
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("target")
    args = parser.parse_args()

    with sync_playwright() as playwright:
        browser = launch_browser(playwright)
        journey = semantic_journey(browser, args.target)
        touch = touch_pause_journey(browser, args.target)
        failure = localized_boot_failure(browser, args.target)
        browser.close()

    print(
        json.dumps(
            {"journey": journey, "touch": touch, "bootFailure": failure},
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
