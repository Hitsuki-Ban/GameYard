#!/usr/bin/env python3
"""State, content, and interaction integration checks for TUMBLEDRUM."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from playwright.sync_api import Page, sync_playwright

from host_test_support import GamePage


def canvas_point(page: Page, x: float, y: float) -> tuple[float, float]:
    box = page.locator("#game").bounding_box()
    assert box is not None
    return box["x"] + box["width"] * x / 900, box["y"] + box["height"] * y / 1200


def click_canvas(page: Page, x: float, y: float) -> None:
    px, py = canvas_point(page, x, y)
    page.mouse.click(px, py)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("target")
    parser.add_argument("--shots", type=Path)
    args = parser.parse_args()

    errors: list[str] = []
    console_errors: list[str] = []
    report: dict[str, Any] = {"stages": []}

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
        page = GamePage(browser.new_page(viewport={"width": 1000, "height": 1280}, device_scale_factor=1))
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.goto(args.target, wait_until="load")
        page.wait_for_function("typeof window.__TUMBLEDRUM__?.debugSnapshot === 'function'")
        page.wait_for_timeout(250)

        # Real pointer path: title -> settings -> toggle -> title -> campaign.
        click_canvas(page, 815, 88)
        page.wait_for_timeout(80)
        assert page.evaluate("window.__TUMBLEDRUM__.state") == "settings"
        original_motion = page.evaluate("window.__TUMBLEDRUM__.settings.motion")
        page.host_evaluate("window.gameyardTestHost.applySettings({motion:{reduced:true}})")
        page.wait_for_function("window.__TUMBLEDRUM__.settings.motion === false")
        assert page.evaluate("window.__TUMBLEDRUM__.settings.motion") is (not original_motion)
        page.host_evaluate("window.gameyardTestHost.applySettings({motion:{reduced:false}})")
        click_canvas(page, 815, 82)
        page.wait_for_timeout(60)
        assert page.evaluate("window.__TUMBLEDRUM__.state") == "title"
        click_canvas(page, 450, 960)
        page.wait_for_timeout(250)
        assert page.evaluate("window.__TUMBLEDRUM__.state") == "playing"
        assert page.evaluate("window.__TUMBLEDRUM__.audio.ready") is True

        # Render every authored stage and validate content bounds/required targets.
        shot_dir = args.shots
        if shot_dir:
            shot_dir.mkdir(parents=True, exist_ok=True)
        stage_count = page.evaluate("window.TD.CONTENT.stageCount")
        assert isinstance(stage_count, int) and stage_count > 0
        for index in range(stage_count):
            stage_data = page.evaluate(
                """(index) => {
                  const g = window.__TUMBLEDRUM__;
                  g.startRun('campaign');
                  g.loadStage(index, false, false);
                  return {
                    index,
                    id: g.stage.id,
                    boss: !!g.stage.boss,
                    total: g.bricks.length,
                    required: g.requiredRemaining(),
                    outOfBounds: g.bricks.filter(b => b.x < 45 || b.x + b.w > 855 || b.y < 110 || b.y + b.h > 930).map(b => ({type:b.type,x:b.x,y:b.y,w:b.w,h:b.h})),
                  };
                }""",
                index,
            )
            page.wait_for_timeout(75)
            assert stage_data["total"] > 0
            assert stage_data["required"] > 0
            assert not stage_data["outOfBounds"], stage_data
            if index == stage_count - 1:
                assert stage_data["boss"] is True
            else:
                assert stage_data["boss"] is False
            if shot_dir:
                page.locator("#game").screenshot(path=str(shot_dir / f"stage_{index+1:02d}.png"))
            report["stages"].append(stage_data)

        # Material/effect paths: destroy one of every brick type and render.
        effect_result = page.evaluate(
            """() => {
              const g = window.__TUMBLEDRUM__;
              g.startRun('campaign');
              g.particles.length = 0;
              g.rings.length = 0;
              g.powerups.length = 0;
              const types = ['paper','clay','wood','bomb','spinner','bell','anchor','gift'];
              const seen = [];
              for (let i=0; i<types.length; i++) {
                const type = types[i];
                const spec = {type, x:100+i*80, y:320, w:72, h:52, required:false, gift:'multi'};
                const b = g.makeBrick(spec, i);
                g.bricks = [b];
                g.destroyBrick(b, g.balls[0], 'ball');
                seen.push(type);
              }
              g.loadStage(8, false, false);
              g.hype = 100;
              g.paradeReady = true;
              g.activateParade();
              return {seen, balls:g.balls.length, parade:g.paradeTimer, particles:g.particles.length};
            }"""
        )
        page.wait_for_timeout(400)
        assert effect_result["parade"] > 0
        assert effect_result["balls"] >= 3
        assert len(effect_result["seen"]) == 8
        report["effects"] = effect_result

        # Upgrade states and capped application.
        upgrade = page.evaluate(
            """() => {
              const g = window.__TUMBLEDRUM__;
              g.startRun('campaign');
              g.enterUpgrade({type:'campaign', index:2});
              const before = {...g.runUpgrades};
              const offer = g.upgradeOffers[1].id;
              g.chooseUpgrade(1);
              for (let i=0;i<130;i++) g.updateUpgradeChosen(1/120);
              return {before, offer, after:{...g.runUpgrades}, state:g.state, stageIndex:g.stageIndex};
            }"""
        )
        assert upgrade["after"][upgrade["offer"]] == upgrade["before"][upgrade["offer"]] + 1
        assert upgrade["state"] == "playing" and upgrade["stageIndex"] == 2
        report["upgrade"] = upgrade

        # Structural anchor cascade.
        cascade = page.evaluate(
            """() => {
              const g = window.__TUMBLEDRUM__;
              g.startRun('campaign');
              g.loadStage(3, false, false);
              const anchor = g.bricks.find(b => b.type === 'anchor');
              const linkedBefore = g.bricks.filter(b => b.group === anchor.group && b.linked).length;
              g.destroyBrick(anchor, g.balls[0], 'ball');
              const falling = g.bricks.filter(b => b.group === anchor.group && b.falling).length;
              return {linkedBefore, falling};
            }"""
        )
        assert cascade["linkedBefore"] > 0 and cascade["falling"] == cascade["linkedBefore"]
        report["cascade"] = cascade

        # Regular stage clear, retry assistance, and endless game-over persistence.
        progression = page.evaluate(
            """() => {
              const g = window.__TUMBLEDRUM__;
              g.startRun('campaign');
              g.loadStage(0, false, false);
              g.bricks.forEach(b => { if (b.required) b.destroyed = true; });
              g.updatePlaying(1/120);
              const clearState = g.state;
              g.state = 'playing';
              g.balls.length = 0;
              g.reserve = 0;
              g.safety = 0;
              g.handleVolleyLost();
              const retryState = g.state;
              const fails = g.stageFailCount;
              g.startRun('endless');
              g.loadEndlessWave(12, true);
              const savedOnLoad = g.save.bestEndless;
              g.reserve = 0;
              g.safety = 0;
              g.balls.length = 0;
              g.handleVolleyLost();
              return {clearState, retryState, fails, gameover:g.state, bestEndless:g.save.bestEndless, savedOnLoad};
            }"""
        )
        assert progression["clearState"] == "stageClear"
        assert progression["retryState"] == "retry" and progression["fails"] == 1
        assert progression["gameover"] == "gameover" and progression["bestEndless"] >= 12 and progression["savedOnLoad"] >= 12
        report["progression"] = progression

        # Boss exposure, damage, defeat, and victory transition.
        boss = page.evaluate(
            """() => {
              const g = window.__TUMBLEDRUM__;
              g.startRun('campaign');
              g.loadStage(12, false, false);
              for (const b of g.bricks) if (b.required) b.destroyed = true;
              g.updateBoss(1/120);
              const opened = g.boss.coreOpen;
              const ball = g.balls[0];
              ball.stuck = false;
              ball.x = g.boss.x;
              ball.y = g.boss.y + 18 - g.boss.coreR - ball.r + 1;
              ball.vx = 0;
              ball.vy = 700;
              ball.chargeTimer = 3;
              ball.pierce = 3;
              const before = g.boss.hp;
              g.collideBoss(ball);
              const after = g.boss.hp;
              g.boss.hp = 1;
              ball.bossCooldown = 0;
              ball.x = g.boss.x;
              ball.y = g.boss.y + 18 - g.boss.coreR - ball.r + 1;
              ball.vy = 700;
              g.collideBoss(ball);
              const defeatedState = g.state;
              for (let i=0;i<500;i++) g.updateBossDefeat(1/120);
              return {opened,before,after,defeatedState,victory:g.state,cleared:g.save.cleared};
            }"""
        )
        assert boss["opened"] is True and boss["after"] < boss["before"]
        assert boss["defeatedState"] == "bossDefeat"
        assert boss["victory"] == "victory" and boss["cleared"] is True
        report["boss"] = boss

        # Run the real update/render loop under an automated paddle for 20 seconds of game time.
        stability = page.evaluate(
            """() => {
              const g = window.__TUMBLEDRUM__;
              g.startRun('campaign');
              for (let i=0;i<2400;i++) {
                const live = g.balls.find(b => b.alive && !b.stuck) || g.balls[0];
                if (live) {
                  g.pointer.active = true;
                  g.pointer.x = Math.max(80, Math.min(820, live.x));
                }
                if (g.state === 'playing') g.update(1/120);
                else if (g.state === 'stageClear') g.updateStageClear(1/120);
                else if (g.state === 'upgrade') g.chooseUpgrade(1);
                else if (g.state === 'upgradeChosen') g.updateUpgradeChosen(1/120);
                else if (g.state === 'retry') g.updateRetry(1/120);
              }
              return g.debugSnapshot();
            }"""
        )
        assert stability["state"] in {"playing", "stageClear", "upgrade", "upgradeChosen", "retry"}
        report["stability"] = stability

        page.wait_for_timeout(100)
        browser.close()

    assert not errors, errors
    assert not console_errors, console_errors
    report["page_errors"] = errors
    report["console_errors"] = console_errors
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
