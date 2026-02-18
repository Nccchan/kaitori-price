from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "images"

CATS = {
    "pokemon": IMAGES / "pokemon",
    "onepiece": IMAGES / "onepiece",
    "dragonball": IMAGES / "dragonball",
}

EXTS = {".webp", ".png", ".jpg", ".jpeg"}


def main() -> None:
    out: dict[str, dict[str, str]] = {k: {} for k in CATS}

    for cat, d in CATS.items():
        if not d.exists():
            continue
        for p in sorted(d.iterdir()):
            if not p.is_file():
                continue
            if p.suffix.lower() not in EXTS:
                continue
            base = p.stem
            # キーは「型式」想定。値はサイトから見た相対パス。
            out[cat][base] = f"./images/{cat}/{p.name}"

    (IMAGES / "manifest.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("wrote", IMAGES / "manifest.json")


if __name__ == "__main__":
    main()
