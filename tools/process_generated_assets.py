#!/usr/bin/env python3
"""Remove the magenta chroma background from generated Ashfall assets.

Usage:
  python3 tools/process_generated_assets.py RAW_DIR OUT_DIR [--max-size 512]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageFilter


def background_colour(im: Image.Image) -> tuple[float, float, float]:
    w, h = im.size
    points = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    samples = [im.getpixel(p) for p in points]
    return tuple(sum(c[i] for c in samples) / len(samples) for i in range(3))


def process(path: Path, out_dir: Path, max_size: int) -> dict:
    im = Image.open(path).convert("RGBA")
    rgb = im.convert("RGB")
    bg = background_colour(rgb)
    px = list(rgb.getdata())
    out = []
    for r, g, b in px:
        dr, dg, db = r - bg[0], g - bg[1], b - bg[2]
        dist = (dr * dr + dg * dg + db * db) ** 0.5
        chroma = r > 150 and b > 70 and g < 135 and (r - g) > 65 and (b - g) > 20
        alpha = 0.0 if chroma else max(0.0, min(1.0, (dist - 35.0) / 65.0))
        if alpha * 255 < 24:
            alpha = 0.0
        if alpha > 0.0:
            # Remove the background contribution from the antialiased edge.
            a = max(alpha, 0.08)
            r = max(0, min(255, round((r - bg[0] * (1 - alpha)) / a)))
            g = max(0, min(255, round((g - bg[1] * (1 - alpha)) / a)))
            b = max(0, min(255, round((b - bg[2] * (1 - alpha)) / a)))
            if r > g + 20 and b > g + 10:
                b = g
        out.append((r, g, b, round(alpha * 255)))
    rgba = Image.new("RGBA", im.size)
    rgba.putdata(out)
    # Erode one pixel of the matte edge. This removes residual chroma fringe
    # without eating into the readable interior of the asset.
    rgba.putalpha(rgba.getchannel("A").filter(ImageFilter.MinFilter(5)))
    alpha_mask = rgba.getchannel("A").point(lambda value: 255 if value >= 32 else 0)
    bbox = alpha_mask.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    if max(rgba.size) > max_size:
        scale = max_size / max(rgba.size)
        rgba = rgba.resize((max(1, round(rgba.width * scale)), max(1, round(rgba.height * scale))), Image.Resampling.LANCZOS)
    target = out_dir / path.name
    target.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(target)
    return {"source": str(path), "output": str(target), "size": list(rgba.size), "background": [round(v, 1) for v in bg]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("raw")
    parser.add_argument("out")
    parser.add_argument("--max-size", type=int, default=512)
    args = parser.parse_args()
    raw = Path(args.raw)
    out = Path(args.out)
    manifest = []
    for path in sorted(raw.glob("*.png")):
        entry = process(path, out, args.max_size)
        manifest.append(entry)
        print(f"{path.name} -> {entry['output']} {entry['size']}")
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
