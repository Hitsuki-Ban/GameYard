from __future__ import annotations

import hashlib
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent
PACKAGE = "kamifuda-runner-v3"
STANDALONE_NAME = f"{PACKAGE}-standalone.html"
ZIP_NAME = f"{PACKAGE}.zip"
DIST_STANDALONE = ROOT.parent / STANDALONE_NAME
DIST_ZIP = ROOT.parent / ZIP_NAME
CHECKSUMS = ROOT.parent / "CHECKSUMS.txt"


def make_standalone(*, test_mode: bool = False) -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "style.css").read_text(encoding="utf-8")
    js = (ROOT / "game.js").read_text(encoding="utf-8")
    html = html.replace(
        '<link rel="stylesheet" href="style.css" />',
        f"<style>\n{css}\n</style>",
    )
    prefix = "<script>window.__KAMIFUDA_TEST__ = true;</script>\n" if test_mode else ""
    html = html.replace(
        '<script src="game.js"></script>',
        f"{prefix}<script>\n{js}\n</script>",
    )
    return html


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build() -> None:
    standalone = make_standalone()
    root_standalone = ROOT / STANDALONE_NAME
    root_standalone.write_text(standalone, encoding="utf-8")
    DIST_STANDALONE.write_text(standalone, encoding="utf-8")

    include = [
        "index.html",
        "style.css",
        "game.js",
        "build.py",
        "DESIGN_NOTES.md",
        "LEVEL_CONTENT_AUDIT.md",
        "TEST_REPORT.md",
        "ACCEPTANCE_RESULTS.json",
    ]
    with ZipFile(DIST_ZIP, "w", ZIP_DEFLATED) as archive:
        for name in include:
            path = ROOT / name
            if not path.is_file():
                raise FileNotFoundError(path)
            archive.write(path, f"{PACKAGE}/{name}")
        archive.writestr(f"{PACKAGE}/{STANDALONE_NAME}", standalone)

    CHECKSUMS.write_text(
        f"{sha256(DIST_STANDALONE)}  {DIST_STANDALONE.name}\n"
        f"{sha256(DIST_ZIP)}  {DIST_ZIP.name}\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    build()
    print(DIST_STANDALONE)
    print(DIST_ZIP)
    print(CHECKSUMS)
