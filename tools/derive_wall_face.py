#!/usr/bin/env python3
"""Derive the flat-wall face tile from the generated straight-wall source.

The generated wall asset contains a cap and end trims, so using it directly
on every wall segment produces visible posts. This script crops the central
face and mirrors it horizontally; the mirrored tile has matching edges and
can be repeated without a hard seam.

Usage:
  python3 tools/derive_wall_face.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "client" / "public" / "assets" / "buildings"
SOURCE = ASSETS / "wall_straight_h.png"
TARGET = ASSETS / "wall_face.png"


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    face = source.crop((28, 96, 176, 500))
    mirror = face.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    out = Image.new("RGBA", (face.width * 2, face.height))
    out.paste(face, (0, 0))
    out.paste(mirror, (face.width, 0))
    out.save(TARGET)
    print(f"{SOURCE.name} -> {TARGET.name} {out.size}")


if __name__ == "__main__":
    main()
