"""Build "3D look" (straight top-down, walls slightly raised) variants of the floor layout images.

Input:  src/assets/maps/*.png (originals, never modified)
Output: src/assets/maps/<name>-3d.png, same width/height as the original.

Only the long straight strokes (walls, zone borders) are raised; everything else (text, machines, small
symbols) is drawn flat at its original thickness, on top, so it stays as readable as the original.

  mask      = dark strokes of the original (threshold, no dilation)
  structure = opening of mask with a 1 x L and an L x 1 line (L = --wall-len), united,
              then only segments at least --min-thick px thick (when that keeps anything),
              minus dense areas (hatching, stripes; local density >= --max-density) which stay flat
  detail    = everything else, painted with the original tone (alpha from the gray level)
  regions   = connected areas of "not stroke" (after a 3x3 closing used only to separate them):
              outside the buildings (edge-reachable with doors <= --door-gap sealed) = outdoor #e4ead9; > --floor-min px = shop floor (--floor epoxy/concrete);
              --machine-min..--machine-max px (60..2000) and solidity >= 0.5 = machine #d3dbe5 (+1px shadow); rest unpainted
  paint     = floor #f8fafc -> regions -> shadow (structure shifted DEPTH+1, blur 2px, black 0.10)
              -> side faces (structure shifted k = DEPTH..1, #94a3b8 far .. #cbd5e1 near)
              -> structure top #334155 -> detail #475569 (flat, on top)

The extrusion falls down-right ON SCREEN: drawings shown rotated (ROTATION) use the matching image offset.

Usage: python scripts/make3dMaps.py [--depth 2] [--shadow 0.10] [--wall-len 25] [--min-thick 2] [--max-density 0.35] [--floor epoxy] [--floor-min 6000]
       [--machine-min 60] [--machine-max 2000] [--door-gap 9] [--only floor1-press]
"""
from __future__ import annotations

import argparse
import io
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter

MAPS = Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'maps'
THRESHOLD = 160  # gray < THRESHOLD = stroke
FLOOR = (0xF8, 0xFA, 0xFC)
SIDE_NEAR = (0xCB, 0xD5, 0xE1)
SIDE_FAR = (0x94, 0xA3, 0xB8)
TOP = (0x33, 0x41, 0x55)
DETAIL = (0x47, 0x55, 0x69)
SHADOW_BLUR = 2
# Realistic, pale region colours (all saturation <= 20% so the zone overlay stays the strongest colour).
OUTDOOR = (0xE4, 0xEA, 0xD9)
FLOOR_PALETTES = {'epoxy': (0xE6, 0xEB, 0xE6), 'concrete': (0xEC, 0xE8, 0xE2)}
MACHINE = (0xD3, 0xDB, 0xE5)
MACHINE_SHADOW = 0.12
MIN_SOLIDITY = 0.5
MAX_SATURATION = 0.20
MAX_DEPTH = 3
DENSITY_WINDOW = 9
# Detail tone: gray >= INK_WHITE is paper, <= INK_BLACK is full DETAIL colour, linear in between.
INK_WHITE = 235
INK_BLACK = 70
MAX_GROWTH = 1.6
# Screen rotation of each drawing (FLOORS[].rotationDeg in src/data/mapData.ts); default 0.
ROTATION = {'floor1-mold': 90}
# Image-space step per unit of depth so the extrusion/shadow fall down-right ON SCREEN after the rotation.
# 90deg clockwise maps image (dx, dy) to screen (-dy, dx): screen (+k, +k) needs image (+k, -k).
EXTRUDE_DIR = {0: (1, 1), 90: (1, -1), 180: (-1, -1), 270: (-1, 1)}


def shifted(mask: np.ndarray, dx: int, dy: int) -> np.ndarray:
    """mask moved by (dx, dy) px, same size, empty where it moved in from."""
    h, w = mask.shape
    out = np.zeros_like(mask)
    ys, yd = (slice(0, h - dy), slice(dy, h)) if dy >= 0 else (slice(-dy, h), slice(0, h + dy))
    xs, xd = (slice(0, w - dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w + dx))
    out[yd, xd] = mask[ys, xs]
    return out


def _window_sum(mask: np.ndarray, length: int, axis: int) -> np.ndarray:
    """Sum of `mask` over a centred window of `length` along `axis` (zero outside the image)."""
    a = np.moveaxis(mask.astype(np.int32), axis, -1)
    before = length // 2
    padded = np.pad(a, [(0, 0)] * (a.ndim - 1) + [(before + 1, length - before - 1)])
    c = np.cumsum(padded, axis=-1)
    s = c[..., length:] - c[..., :-length]
    return np.moveaxis(s, -1, axis)


def open_line(mask: np.ndarray, length: int, axis: int) -> np.ndarray:
    """Morphological opening with a straight line of `length` px along `axis` (1 = horizontal, 0 = vertical)."""
    if length <= 1:
        return mask.copy()
    eroded = _window_sum(mask, length, axis) == length
    # Dilation with the reflected window: a pixel is kept when some full-length run covers it.
    flipped = np.flip(eroded, axis)
    return np.flip(_window_sum(flipped, length, axis) > 0, axis) if length % 2 == 0 else _window_sum(eroded, length, axis) > 0


def density_of(mask: np.ndarray, size: int) -> np.ndarray:
    """Share of stroke pixels in a size x size window around each pixel."""
    return _window_sum(_window_sum(mask, size, 1), size, 0) / float(size * size)


def structure_of(mask: np.ndarray, wall_len: int, min_thick: int, max_density: float) -> np.ndarray:
    horiz = open_line(mask, wall_len, axis=1)
    vert = open_line(mask, wall_len, axis=0)
    if min_thick > 1:
        # Keep segments at least `min_thick` px thick (across the segment), if any survive.
        thick_h = open_line(horiz, min_thick, axis=0)
        thick_v = open_line(vert, min_thick, axis=1)
        if (thick_h | thick_v).any():
            horiz, vert = thick_h, thick_v
    # Hatching / stripes / dense racks: raising them fills the gaps with side faces, so they stay flat (detail).
    return (horiz | vert) & (density_of(mask, DENSITY_WINDOW) < max_density)


def saturation(c: tuple[int, int, int]) -> float:
    hi, lo = max(c), min(c)
    return 0.0 if hi == 0 else (hi - lo) / hi


def exterior_of(mask: np.ndarray, door_gap: int) -> np.ndarray:
    """Outside the buildings: reachable from the image edge once gaps up to `door_gap` px (doors) are sealed."""
    k = max(3, door_gap | 1)
    sealed = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((k, k), np.uint8)) > 0
    n, labels, stats, _ = cv2.connectedComponentsWithStats((~sealed).astype(np.uint8), connectivity=4)
    h, w = mask.shape
    x, y, bw, bh = (stats[:, i] for i in range(4))
    edge = (x == 0) | (y == 0) | (x + bw >= w) | (y + bh >= h)
    edge[0] = False
    # Grow back over the sealed band so outdoor reaches the building walls.
    out = cv2.dilate(edge[labels].astype(np.uint8), np.ones((k, k), np.uint8)) > 0
    return out & ~mask


def regions_of(mask: np.ndarray, dense: np.ndarray, floor_min: int, machine_min: int, machine_max: int, door_gap: int) -> dict[str, np.ndarray]:
    """Enclosed areas of the drawing: outdoor (touches the edge), shop floor (large) and machines (small, compact).

    Areas are the connected components of "not stroke" after a 3x3 closing (only to seal 1px gaps; never drawn).
    Areas lying mostly in dense hatching are left alone; outdoor = exterior_of (doors sealed). Each area is grown 1px back over the sealed gaps.
    """
    h, w = mask.shape
    closed = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)) > 0
    n, labels, stats, _ = cv2.connectedComponentsWithStats((~closed).astype(np.uint8), connectivity=4)
    x, y, bw, bh, area = (stats[:, i] for i in range(5))
    edge = (x == 0) | (y == 0) | (x + bw >= w) | (y + bh >= h)
    solidity = area / np.maximum(bw * bh, 1)
    dense_share = np.bincount(labels.ravel(), weights=dense.ravel().astype(np.float64), minlength=n) / np.maximum(area, 1)
    kind = np.zeros(n, np.uint8)  # 0 keep background, 1 outdoor/floor (split below), 2 floor, 3 machine
    # Edge-touching areas run through open doors into the buildings: outdoor vs shop floor is decided per pixel.
    kind[edge | (area > floor_min)] = 2
    kind[~edge & (area >= machine_min) & (area <= machine_max) & (solidity >= MIN_SOLIDITY)] = 3
    kind[dense_share > 0.5] = 0
    kind[0] = 0  # label 0 = the strokes themselves
    per_pixel = kind[labels]
    # Grow each area 1px over the closed gaps (not over real strokes).
    grown = cv2.dilate(per_pixel, np.ones((3, 3), np.uint8))
    per_pixel = np.where((per_pixel == 0) & closed & ~mask, grown, per_pixel)
    big = per_pixel == 2
    outdoor = big & exterior_of(mask, door_gap)
    return {'outdoor': outdoor, 'floor': big & ~outdoor, 'machine': per_pixel == 3}


def paint(canvas: np.ndarray, color: tuple[int, int, int], alpha: np.ndarray) -> None:
    a = alpha.astype(np.float32)[..., None]
    canvas[:] = canvas * (1 - a) + np.array(color, np.float32) * a


def lerp(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(a + (b - a) * t) for a, b in zip(c1, c2))  # type: ignore[return-value]


def make_3d(src: Path, depth: int, shadow: float, wall_len: int, min_thick: int, max_density: float,
            floor_color: tuple[int, int, int], floor_min: int, machine_min: int, machine_max: int, door_gap: int) -> Image.Image:
    ux, uy = EXTRUDE_DIR[ROTATION.get(src.stem, 0) % 360]
    original = Image.open(src)
    rgba = original.convert('RGBA')
    flat = Image.new('RGBA', rgba.size, (255, 255, 255, 255))
    flat.alpha_composite(rgba)
    gray = np.asarray(flat.convert('L')).astype(np.float32)
    mask = gray < THRESHOLD

    structure = structure_of(mask, wall_len, min_thick, max_density)
    # Detail keeps the original tone (light grey hatching stays light), at its original thickness.
    detail = np.clip((INK_WHITE - gray) / (INK_WHITE - INK_BLACK), 0, 1) * ~structure

    h, w = mask.shape
    canvas = np.empty((h, w, 3), np.float32)
    canvas[:] = FLOOR

    # Regions first (under walls and detail): outdoor, shop floor, machines with a 1px drop shadow.
    dense = density_of(mask, DENSITY_WINDOW) >= max_density
    reg = regions_of(mask, dense, floor_min, machine_min, machine_max, door_gap)
    paint(canvas, OUTDOOR, reg['outdoor'])
    paint(canvas, floor_color, reg['floor'])
    paint(canvas, (0, 0, 0), (shifted(reg['machine'], ux, uy) & ~reg['machine']).astype(np.float32) * MACHINE_SHADOW)
    paint(canvas, MACHINE, reg['machine'])

    sh = Image.fromarray(shifted(structure, ux * (depth + 1), uy * (depth + 1)).astype(np.uint8) * 255).filter(ImageFilter.GaussianBlur(SHADOW_BLUR))
    paint(canvas, (0, 0, 0), np.asarray(sh, np.float32) / 255 * shadow)

    # Side faces: farthest (darkest) first, nearest (lightest) on top.
    for k in range(depth, 0, -1):
        t = (k - 1) / max(depth - 1, 1)
        paint(canvas, lerp(SIDE_NEAR, SIDE_FAR, t), shifted(structure, ux * k, uy * k))

    paint(canvas, TOP, structure)
    paint(canvas, DETAIL, detail)
    out = Image.fromarray(np.clip(canvas + 0.5, 0, 255).astype(np.uint8), 'RGB')
    assert out.size == original.size, (src.name, out.size, original.size)
    return out


def encode(img: Image.Image, colors: int | None) -> bytes:
    buf = io.BytesIO()
    (img.quantize(colors=colors, method=Image.Quantize.MEDIANCUT) if colors else img).save(buf, 'PNG', optimize=True)
    return buf.getvalue()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--depth', type=int, default=2, help=f'extrusion depth in px, 1-{MAX_DEPTH} (default 2)')
    ap.add_argument('--shadow', type=float, default=0.10, help='shadow opacity 0-1 (default 0.10)')
    ap.add_argument('--wall-len', type=int, default=25, help='min length (px) of a straight stroke to count as a wall (default 25)')
    ap.add_argument('--min-thick', type=int, default=2, help='min thickness (px) of a wall; 1 = keep thin lines too (default 2)')
    ap.add_argument('--max-density', type=float, default=0.35, help=f'strokes in areas denser than this ({DENSITY_WINDOW}x{DENSITY_WINDOW} window) stay flat (default 0.35)')
    ap.add_argument('--floor', choices=sorted(FLOOR_PALETTES), default='epoxy', help='shop floor colour (default epoxy)')
    ap.add_argument('--floor-min', type=int, default=6000, help='enclosed area (px) above which it is shop floor (default 6000)')
    ap.add_argument('--machine-min', type=int, default=60, help='smallest enclosed area (px) painted as a machine (default 60)')
    ap.add_argument('--machine-max', type=int, default=2000, help='largest enclosed area (px) painted as a machine (default 2000)')
    ap.add_argument('--door-gap', type=int, default=9, help='openings up to this many px (doors) do not let outdoor into a building (default 9)')
    ap.add_argument('--only', help='process one image, by name without extension (e.g. floor1-press)')
    args = ap.parse_args()
    depth = max(1, min(MAX_DEPTH, args.depth))
    for c in (OUTDOOR, MACHINE, *FLOOR_PALETTES.values(), FLOOR):
        assert saturation(c) <= MAX_SATURATION, c

    sources = sorted(p for p in MAPS.glob('*.png') if not p.stem.endswith('-3d'))
    if args.only:
        sources = [p for p in sources if p.stem == args.only]
        if not sources:
            raise SystemExit(f'no image named {args.only!r} in {MAPS}')

    for src in sources:
        img = make_3d(src, depth, args.shadow, args.wall_len, args.min_thick, args.max_density,
                      FLOOR_PALETTES[args.floor], args.floor_min, args.machine_min, args.machine_max, args.door_gap)
        limit = src.stat().st_size * MAX_GROWTH
        # Smallest palette that still looks smooth; fall back to fewer colours if over the size budget.
        data = b''
        for colors in (64, 32, 16):
            data = encode(img, colors)
            if len(data) <= limit:
                break
        dst = src.with_name(f'{src.stem}-3d.png')
        dst.write_bytes(data)
        with Image.open(dst) as check:
            assert check.size == img.size
        ratio = len(data) / src.stat().st_size
        flag = '' if ratio <= MAX_GROWTH else '  (over 1.6x)'
        print(f'{dst.name}: {img.width}x{img.height}, {len(data) / 1024:.1f} KB ({ratio:.2f}x of {src.stat().st_size / 1024:.1f} KB){flag}')


if __name__ == '__main__':
    main()
