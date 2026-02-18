from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import tempfile
import urllib.parse
from pathlib import Path

SHOP_PRODUCTS_JSON = "https://japantcjshop.myshopify.com/products.json?limit=250"

ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "images"

EXTS = (".jpg", ".jpeg", ".png", ".webp")


def curl_text(url: str) -> str:
    return subprocess.check_output(["curl", "-sL", url], text=True)


def curl_download(url: str, dest: Path) -> None:
    subprocess.check_call(["curl", "-sL", url, "-o", str(dest)])


def sips_dims(path: Path) -> tuple[int, int]:
    out = subprocess.check_output(
        ["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
        text=True,
    )
    w = h = None
    for line in out.splitlines():
        if "pixelWidth:" in line:
            w = int(line.split(":", 1)[1].strip())
        if "pixelHeight:" in line:
            h = int(line.split(":", 1)[1].strip())
    if not w or not h:
        raise RuntimeError(f"could not read image dims: {path}")
    return w, h


def to_square_600(src: Path, dest_png: Path, size: int = 600) -> None:
    w, h = sips_dims(src)
    scale = size / min(w, h)
    nw = int(math.ceil(w * scale))
    nh = int(math.ceil(h * scale))

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td) / "tmp.png"
        subprocess.check_call(
            ["sips", "-s", "format", "png", str(src), "--out", str(tmp)],
            stdout=subprocess.DEVNULL,
        )
        subprocess.check_call(["sips", "-z", str(nh), str(nw), str(tmp)], stdout=subprocess.DEVNULL)
        subprocess.check_call(
            ["sips", "--cropToHeightWidth", str(size), str(size), str(tmp), "--out", str(dest_png)],
            stdout=subprocess.DEVNULL,
        )


def parse_code_from_title(title: str) -> str:
    m = re.search(r"\(([^)]+)\)", title)
    if m:
        return m.group(1).strip()
    m = re.search(r"\[([^\]]+)\]", title)
    if m:
        return m.group(1).strip()
    return ""


def is_pokemon_product(title: str) -> bool:
    t = title.lower()
    return t.startswith("pokémon card game") or t.startswith("pokemon card game")


def main() -> None:
    ap = argparse.ArgumentParser(description="Fetch Shopify product images and convert to 600x600 PNG")
    ap.add_argument("--category", choices=["pokemon", "onepiece", "dragonball"], default="pokemon")
    ap.add_argument("--codes", default="", help="comma-separated codes (e.g. M3,M2a,SV11B)")
    ap.add_argument("--limit", type=int, default=0, help="process first N matched items (0 = no limit)")
    ap.add_argument("--products-json", default=SHOP_PRODUCTS_JSON)
    args = ap.parse_args()

    want = [c.strip() for c in args.codes.split(",") if c.strip()]
    want_set = set(want)

    obj = json.loads(curl_text(args.products_json))
    products = obj.get("products", [])

    out_dir = IMAGES / args.category
    out_dir.mkdir(parents=True, exist_ok=True)

    matched: list[tuple[str, str, str]] = []
    for prod in products:
        title = str(prod.get("title") or "")

        if args.category == "pokemon" and not is_pokemon_product(title):
            continue

        code = parse_code_from_title(title)
        if not code:
            continue

        if want_set and code not in want_set:
            continue

        imgs = prod.get("images") or []
        src = None
        for i in imgs:
            s = i.get("src")
            if isinstance(s, str) and s.lower().endswith(EXTS):
                src = s
                break
        if not src and imgs:
            s = imgs[0].get("src")
            if isinstance(s, str):
                src = s

        if not src:
            continue

        matched.append((code, title, src))

    seen = set()
    dedup: list[tuple[str, str, str]] = []
    for code, title, src in matched:
        if code in seen:
            continue
        seen.add(code)
        dedup.append((code, title, src))

    if args.limit and args.limit > 0:
        dedup = dedup[: args.limit]

    if not dedup:
        print("no matches")
        return

    print(f"matched {len(dedup)} items")

    for code, title, src in dedup:
        dest = out_dir / f"{code}.png"
        if dest.exists():
            print("skip exists", code)
            continue

        with tempfile.TemporaryDirectory() as td:
            raw_name = urllib.parse.urlparse(src).path.split("/")[-1] or "img"
            raw = Path(td) / raw_name
            curl_download(src, raw)
            to_square_600(raw, dest, 600)

        print("wrote", code, "<-", src)


if __name__ == "__main__":
    main()
