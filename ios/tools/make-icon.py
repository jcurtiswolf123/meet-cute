#!/usr/bin/env python3
"""The app mark: two circles and the part they share.

Mutuals is the overlap - the friends two people already have in common - so the
icon is the overlap and nothing else. Cream ground, ink outlines, the
intersection in the one brand accent. No gradient, no glyph, no rounded-square
chrome (iOS adds that itself).

Regenerate: python3 ios/tools/make-icon.py
"""

from pathlib import Path
from PIL import Image, ImageDraw

CREAM = (244, 241, 234, 255)
INK = (23, 23, 20, 255)
OXBLOOD = (118, 45, 56, 255)

HERE = Path(__file__).resolve().parent
ICONSET = HERE.parent / "Mutuals" / "Resources" / "Assets.xcassets" / "AppIcon.appiconset"
IMAGESET = HERE.parent / "Mutuals" / "Resources" / "Assets.xcassets" / "LaunchMark.imageset"

# Drawn at 4x and downsampled: PIL has no antialiasing on shapes.
SCALE = 4


def circles(size, inset_ratio, radius_ratio, stroke_ratio):
    """The two overlapping discs, as (bbox, bbox)."""
    r = size * radius_ratio
    cy = size / 2
    gap = r * 0.62  # how far each centre sits from the middle
    left = (size / 2 - gap, cy)
    right = (size / 2 + gap, cy)
    box = lambda c: (c[0] - r, c[1] - r, c[0] + r, c[1] + r)
    return box(left), box(right), max(2, size * stroke_ratio)


def mark(size, ground=None):
    s = size * SCALE
    image = Image.new("RGBA", (s, s), ground if ground else (0, 0, 0, 0))
    # 0.235 keeps the mark inside the ~80% square iOS leaves after it applies
    # its own rounded-rect mask. At 0.30 the circles were clipped left and right.
    a, b, stroke = circles(s, 0.0, 0.235, 0.020)

    # The shared part, painted first so the outlines sit on top of its edge.
    mask_a = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask_a).ellipse(a, fill=255)
    mask_b = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask_b).ellipse(b, fill=255)
    from PIL import ImageChops

    overlap = ImageChops.multiply(mask_a, mask_b)
    image.paste(Image.new("RGBA", (s, s), OXBLOOD), (0, 0), overlap)

    draw = ImageDraw.Draw(image)
    draw.ellipse(a, outline=INK, width=int(stroke))
    draw.ellipse(b, outline=INK, width=int(stroke))

    return image.resize((size, size), Image.LANCZOS)


def main():
    ICONSET.mkdir(parents=True, exist_ok=True)
    IMAGESET.mkdir(parents=True, exist_ok=True)

    # One 1024 icon; Xcode 14+ generates every other size from it.
    mark(1024, ground=CREAM).save(ICONSET / "icon-1024.png")
    (ICONSET / "Contents.json").write_text(
        '{\n  "images" : [\n    {\n      "filename" : "icon-1024.png",\n'
        '      "idiom" : "universal",\n      "platform" : "ios",\n      "size" : "1024x1024"\n'
        "    }\n  ],\n  \"info\" : { \"author\" : \"xcode\", \"version\" : 1 }\n}\n"
    )

    # The launch screen mark, transparent so it sits on the Cream colour set.
    for scale, size in ((1, 96), (2, 192), (3, 288)):
        suffix = "" if scale == 1 else f"@{scale}x"
        mark(size).save(IMAGESET / f"launch-mark{suffix}.png")
    (IMAGESET / "Contents.json").write_text(
        '{\n  "images" : [\n'
        '    { "filename" : "launch-mark.png", "idiom" : "universal", "scale" : "1x" },\n'
        '    { "filename" : "launch-mark@2x.png", "idiom" : "universal", "scale" : "2x" },\n'
        '    { "filename" : "launch-mark@3x.png", "idiom" : "universal", "scale" : "3x" }\n'
        '  ],\n  "info" : { "author" : "xcode", "version" : 1 }\n}\n'
    )
    print(f"wrote {ICONSET}/icon-1024.png and 3 launch marks")


if __name__ == "__main__":
    main()
