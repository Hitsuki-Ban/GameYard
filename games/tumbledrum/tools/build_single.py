#!/usr/bin/env python3
"""Build a dependency-free, single-file offline edition of TUMBLEDRUM."""

from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "TUMBLEDRUM_PLAY.html"
SOURCES = ("src/i18n.js", "src/content.js", "src/audio.js", "src/game.js")


def main() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "styles.css").read_text(encoding="utf-8")

    style_tag = '  <link rel="stylesheet" href="styles.css">'
    if html.count(style_tag) != 1:
        raise RuntimeError("Expected exactly one stylesheet tag for styles.css.")
    html = html.replace(style_tag, "  <style>\n" + css + "\n  </style>", 1)

    for source in SOURCES:
        js = (ROOT / source).read_text(encoding="utf-8")
        # Prevent an accidental literal closing tag from terminating the inline block.
        js = js.replace("</script", "<\\/script")
        tag = f'  <script src="{source}"></script>'
        if html.count(tag) != 1:
            raise RuntimeError(f"Expected exactly one script tag for {source}.")
        html = html.replace(tag, f'  <script>\n/* {source} */\n{js}\n  </script>', 1)

    html = html.replace(
        "<head>",
        "<head>\n  <!-- Self-contained offline build. No network requests or external assets. -->",
        1,
    )
    if re.search(r'<script\b[^>]*\bsrc=|<link\b[^>]*\brel=["\']stylesheet["\']', html, re.IGNORECASE):
        raise RuntimeError("Offline build still contains an external script or stylesheet reference.")
    OUTPUT.write_text(html, encoding="utf-8", newline="\n")
    print(f"Built {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
