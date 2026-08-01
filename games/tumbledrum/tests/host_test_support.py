"""Playwright adapter for the test-only same-origin GameYard Host."""

from __future__ import annotations

from typing import Any

from playwright.sync_api import Frame, Page


class GamePage:
    def __init__(self, page: Page):
        self.outer = page
        self.frame: Frame | None = None

    @property
    def keyboard(self) -> Any:
        return self.outer.keyboard

    @property
    def mouse(self) -> Any:
        return self.outer.mouse

    @property
    def touchscreen(self) -> Any:
        return self.outer.touchscreen

    def on(self, *args: Any, **kwargs: Any) -> Any:
        return self.outer.on(*args, **kwargs)

    def goto(self, target: str, **kwargs: Any) -> Any:
        result = self.outer.goto(target, **kwargs)
        self.outer.wait_for_selector("#game-frame")
        self.frame = self.outer.frame(name="game")
        if self.frame is None:
            raise RuntimeError("The test Host did not create its game iframe.")
        return result

    def reload(self, **kwargs: Any) -> Any:
        result = self.outer.reload(**kwargs)
        self.outer.wait_for_selector("#game-frame")
        self.frame = self.outer.frame(name="game")
        if self.frame is None:
            raise RuntimeError("The test Host did not recreate its game iframe.")
        return result

    def evaluate(self, *args: Any, **kwargs: Any) -> Any:
        return self._frame().evaluate(*args, **kwargs)

    def wait_for_function(self, *args: Any, **kwargs: Any) -> Any:
        return self._frame().wait_for_function(*args, **kwargs)

    def wait_for_timeout(self, timeout: float) -> None:
        self.outer.wait_for_timeout(timeout)

    def locator(self, *args: Any, **kwargs: Any) -> Any:
        return self._frame().locator(*args, **kwargs)

    def title(self) -> str:
        return self._frame().title()

    def screenshot(self, *args: Any, **kwargs: Any) -> Any:
        return self.outer.screenshot(*args, **kwargs)

    def host_evaluate(self, *args: Any, **kwargs: Any) -> Any:
        return self.outer.evaluate(*args, **kwargs)

    def _frame(self) -> Frame:
        if self.frame is None:
            raise RuntimeError("Navigate the GamePage before using the guest frame.")
        return self.frame
