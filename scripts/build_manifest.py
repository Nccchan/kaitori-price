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

EXTS = {".webp", ".png", ".jpg", ".jpeg", ".svg"}
RANK = {".webp": 0, ".png": 1, ".jpg": 2, ".jpeg": 3, ".svg": 4}


def main() -> None:
    out: dict[str, dict[str, str]] = {k: {} for k in CATS}
    best: dict[str, dict[str, int]] = {k: {} for k in CATS}

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
            r = RANK.get(p.suffix.lower(), 999)
            prev = best[cat].get(base)
            if prev is None or r < prev:
                best[cat][base] = r
                out[cat][base] = f"./images/{cat}/{p.name}"

    (IMAGES / "manifest.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("wrote", IMAGES / "manifest.json")


if __name__ == "__main__":
    main()
