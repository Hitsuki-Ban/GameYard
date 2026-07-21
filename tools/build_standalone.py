"""Build a self-contained PULSE LINK HTML file with no external runtime assets."""

from __future__ import annotations

import argparse
import base64
import re
from pathlib import Path

SCRIPT_ORDER = (
    "config.js",
    "i18n.js",
    "audio.js",
    "input.js",
    "model.js",
    "render.js",
    "app.js",
)


def build(root: Path, output: Path) -> None:
    index_path = root / "index.html"
    css_path = root / "styles.css"
    icon_path = root / "assets" / "icon.svg"
    if not index_path.is_file() or not css_path.is_file() or not icon_path.is_file():
        raise FileNotFoundError("index.html, styles.css, or assets/icon.svg is missing")

    html = index_path.read_text(encoding="utf-8")
    css = css_path.read_text(encoding="utf-8")
    icon_data = base64.b64encode(icon_path.read_bytes()).decode("ascii")

    html = re.sub(r'\s*<link rel="manifest"[^>]*>', "", html)
    html, count = re.subn(
        r'<link rel="icon"[^>]*>',
        f'<link rel="icon" href="data:image/svg+xml;base64,{icon_data}" type="image/svg+xml">',
        html,
        count=1,
    )
    if count != 1:
        raise RuntimeError("icon tag was not found exactly once")
    html, count = re.subn(
        r'<link rel="stylesheet" href="styles\.css">',
        f"<style>\n{css}\n</style>",
        html,
        count=1,
    )
    if count != 1:
        raise RuntimeError("stylesheet tag was not found exactly once")

    for filename in SCRIPT_ORDER:
        script_path = root / "src" / filename
        if not script_path.is_file():
            raise FileNotFoundError(script_path)
        source = script_path.read_text(encoding="utf-8")
        if "</script" in source.lower():
            raise ValueError(f"unsafe closing script token in {filename}")
        pattern = rf'<script(?: defer)? src="src/{re.escape(filename)}"></script>'
        html, count = re.subn(pattern, f"<script>\n{source}\n</script>", html, count=1)
        if count != 1:
            raise RuntimeError(f"script tag for {filename} was not found exactly once")

    standalone_flag = "<script>window.__PULSE_LINK_STANDALONE__ = true;</script>"
    html = html.replace("<head>", f"<head>\n  {standalone_flag}", 1)
    marker = "<!-- Standalone build: no external runtime assets, manifest, or service worker. -->"
    html = html.replace("</head>", f"  {marker}\n</head>", 1)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, encoding="utf-8")
    print(f"Built {output} ({output.stat().st_size:,} bytes)")


def main() -> None:
    default_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=default_root)
    parser.add_argument(
        "--output",
        type=Path,
        default=default_root / "dist" / "pulse-link-overdrive-standalone.html",
    )
    args = parser.parse_args()
    build(args.root.resolve(), args.output.resolve())


if __name__ == "__main__":
    main()
