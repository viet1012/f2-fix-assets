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

--export-geometry: instead of the images, write src/data/geometry3d/<layoutId>.json for a real 3D view, from the same
masks (images untouched). Coordinates are % of the ORIGINAL image (same system as mapData; the Mold drawing is not
rotated, the FE rotates it), rounded to 2 decimals:
  walls           = (a) structure vectorised into axis-aligned rectangles: per direction, runs >= --wall-min px on
                    consecutive rows/columns with the same extent are merged; thickness padded to >= 2px;
                    (b) outer walls drawn as BANDS: stippled strips (density of tiny dots) and the gap between two
                    parallel wall lines, split into straight pieces; a piece is kept when its minAreaRect is >= BAND_RATIO
                    times longer than wide, >= BAND_MIN_LEN px long and BAND_MIN..BAND_MAX px wide (near-square hatching: parking, stairs, is
                    dropped). A slanted band carries `angle` (degrees, image px, clockwise): {x, y, w, h} is then the
                    unrotated box around the same centre, to be turned by `angle` about its centre AFTER conversion to px.
  buildingOutline = bounding box of the major-area polygons (src/data/mapAreas.ts, read by regex) grown by
                    OUTLINE_PAD % of its size per side, clamped to 0..100; `outlineOverride` (null, or [{x, y}])
                    replaces it when set. Walls are then filtered: centre outside the outline -> dropped; band walls
                    are kept only within EDGE_TOL of the outline's size from its edge; structure walls inside stay.
  machines, columns = always [] (kept for compatibility: machines are not built from the image).
--preview DIR also draws each JSON over its original image (DIR/<layoutId>-geometry.png) to check it by eye.

Usage: python scripts/make3dMaps.py [--depth 2] [--shadow 0.10] [--wall-len 25] [--min-thick 2] [--max-density 0.35] [--floor epoxy] [--floor-min 6000]
       [--machine-min 60] [--machine-max 2000] [--door-gap 9] [--only floor1-press]
       [--export-geometry [--wall-min 8] [--preview DIR]]
"""
from __future__ import annotations

import argparse
import io
import json
import re
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

MAPS = Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'maps'
GEOMETRY = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'geometry3d'
# Image of each layout (FLOORS[].imageData in src/data/mapData.ts).
AREAS_TS = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'mapAreas.ts'
OUTLINE_PAD = 0.02  # buildingOutline = area bbox grown by this fraction of its size per side
EDGE_TOL = 0.03  # band walls kept only this close (fraction of the outline's size) to the outline edge
OUTLINE_OVERRIDE: dict[str, list[dict[str, float]] | None] = {}  # layoutId -> [{x, y}] replacing the bbox
LAYOUT_IDS = {'floor1-press': 'floor1', 'floor1-guide': 'floor2', 'floor1-warehouse': 'floor3', 'floor1-mold': 'floor4', 'floor2-all': 'floor5'}
GEOMETRY_MAX_BYTES = 150 * 1024
WALL_MIN_THICK = 2
# Runs on consecutive rows belong to the same wall when both ends move by at most this many px.
WALL_MERGE_TOL = 2
# Outer-wall bands. Stipple = stroke blobs of at most DOT_MAX px; a pixel is stippled when >= DOT_COUNT of them lie in
# its DOT_WINDOW px window. Two parallel wall lines at most PAIR_GAP px apart (each >= PAIR_LEN px long) fill the gap.
DOT_MAX = 6
DOT_WINDOW = 15
DOT_COUNT = 6
PAIR_GAP = 12
PAIR_LEN = 60
# Straight pieces of a bent band (L / U rings) are cut with lines of SPLIT_LEN px; only components covering less than
# SPLIT_MAX_FILL of their minAreaRect are rings (a fuller one is a hatched area: parking, stairs, and is dropped).
SPLIT_LEN = 40
SPLIT_MAX_FILL = 0.5
BAND_RATIO = 5
BAND_MIN = 4
BAND_MAX = 40
# Shorter bands are aisle / room details, not outer walls.
BAND_MIN_LEN = 100
# A band within ANGLE_SNAP degrees of horizontal / vertical is stored axis-aligned.
ANGLE_SNAP = 2
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
    horiz, vert = structure_parts(mask, wall_len, min_thick, max_density)
    return horiz | vert


def structure_parts(mask: np.ndarray, wall_len: int, min_thick: int, max_density: float) -> tuple[np.ndarray, np.ndarray]:
    """Horizontal and vertical walls of structure_of, separately."""
    horiz = open_line(mask, wall_len, axis=1)
    vert = open_line(mask, wall_len, axis=0)
    if min_thick > 1:
        # Keep segments at least `min_thick` px thick (across the segment), if any survive.
        thick_h = open_line(horiz, min_thick, axis=0)
        thick_v = open_line(vert, min_thick, axis=1)
        if (thick_h | thick_v).any():
            horiz, vert = thick_h, thick_v
    # Hatching / stripes / dense racks: raising them fills the gaps with side faces, so they stay flat (detail).
    sparse = density_of(mask, DENSITY_WINDOW) < max_density
    return horiz & sparse, vert & sparse


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


def runs_of(row: np.ndarray) -> list[tuple[int, int]]:
    """[start, end) of each run of True in a 1-D mask."""
    d = np.diff(np.concatenate(([0], row.astype(np.int8), [0])))
    return list(zip(np.flatnonzero(d == 1).tolist(), np.flatnonzero(d == -1).tolist()))


def wall_rects(walls: np.ndarray, min_len: int) -> list[tuple[int, int, int, int]]:
    """Horizontal walls -> rectangles (x, y, w, h) px: runs >= min_len merged over consecutive rows with the same extent."""
    done: list[list[int]] = []
    open_: list[list[int]] = []  # [x0, x1, y0, y1)
    for y in range(walls.shape[0]):
        nxt = []
        for x0, x1 in runs_of(walls[y]):
            if x1 - x0 < min_len:
                continue
            hit = next((r for r in open_ if abs(r[0] - x0) <= WALL_MERGE_TOL and abs(r[1] - x1) <= WALL_MERGE_TOL), None)
            if hit:
                open_.remove(hit)
                hit[0], hit[1], hit[3] = min(hit[0], x0), max(hit[1], x1), y + 1
                nxt.append(hit)
            else:
                nxt.append([x0, x1, y, y + 1])
        done.extend(open_)
        open_ = nxt
    done.extend(open_)
    out = []
    for x0, x1, y0, y1 in done:
        h = y1 - y0
        if h < WALL_MIN_THICK:  # Pad thin walls around their centre.
            y0 -= (WALL_MIN_THICK - h) // 2
            h = WALL_MIN_THICK
        out.append((x0, y0, x1 - x0, h))
    return out


def band_mask(mask: np.ndarray) -> np.ndarray:
    """Outer-wall bands: stippled strips plus the gap between two parallel long wall lines."""
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    tiny = stats[:, 4] <= DOT_MAX
    tiny[0] = False
    dots = tiny[labels]
    stipple = _window_sum(_window_sum(dots, DOT_WINDOW, 1), DOT_WINDOW, 0) >= DOT_COUNT
    band = stipple
    for axis in (1, 0):
        lines = open_line(mask, PAIR_LEN, axis)
        # Close across the lines: two parallel lines <= PAIR_GAP apart merge into one solid strip...
        kernel = np.ones((PAIR_GAP + 1, 1) if axis == 1 else (1, PAIR_GAP + 1), np.uint8)
        filled = cv2.morphologyEx(lines.astype(np.uint8), cv2.MORPH_CLOSE, kernel) > 0
        # ...and a single line (<= 2px) stays thin, so it does not survive an opening with BAND_MIN across it.
        band = band | open_line(filled, BAND_MIN, 1 - axis)
    return cv2.morphologyEx(band.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))


def band_of(points: np.ndarray) -> tuple[float, float, float, float, float] | None:
    """(cx, cy, length, width, angle of the long side in degrees) when the points form a straight band, else None."""
    (cx, cy), (a, b), ang = cv2.minAreaRect(points)
    length, width = max(a, b), min(a, b)
    if not (BAND_MIN <= width <= BAND_MAX and length >= max(BAND_RATIO * width, BAND_MIN_LEN)):
        return None
    angle = ang if a >= b else ang + 90
    angle = (angle + 90) % 180 - 90  # -90..90
    return cx, cy, length, width, angle


def band_walls(band: np.ndarray) -> list[tuple[float, float, float, float, float]]:
    """Bands -> (cx, cy, length, width, angle) px: whole components when straight, else their straight pieces."""
    out = []
    n, labels, _, _ = cv2.connectedComponentsWithStats(band, connectivity=8)
    pieces = [open_line(band > 0, SPLIT_LEN, 1), open_line(band > 0, SPLIT_LEN, 0)]
    for i in range(1, n):
        comp = labels == i
        pts = cv2.findNonZero(comp.astype(np.uint8))
        whole = band_of(pts)
        if whole:
            out.append(whole)
            continue
        (_, _), (a, b), _ = cv2.minAreaRect(pts)
        if len(pts) > SPLIT_MAX_FILL * a * b:
            continue
        for part in pieces:
            sub = (part & comp).astype(np.uint8)
            m, sub_labels, _, _ = cv2.connectedComponentsWithStats(sub, connectivity=8)
            for j in range(1, m):
                b = band_of(cv2.findNonZero((sub_labels == j).astype(np.uint8)))
                if b:
                    out.append(b)
    return out


def rect_corners(cx: float, cy: float, length: float, width: float, angle: float) -> np.ndarray:
    return cv2.boxPoints(((cx, cy), (length, width), angle))


def area_points(stem: str) -> list[tuple[float, float]]:
    """Every point of the major areas of one drawing, in % of its original image, regexed out of mapAreas.ts."""
    ts = AREAS_TS.read_text(encoding='utf-8')
    name = stem.upper().replace('-', '_') + '_AREAS'
    m = re.search(rf'export const {name}\b.*?\n\]', ts, re.S)
    if not m:
        raise SystemExit(f'{name} not found in {AREAS_TS}')
    block, num = m.group(0), r'(-?\d+(?:\.\d+)?)'
    pts = []
    for l, t, r, b in re.findall(rf"rectArea\(\s*'[^']*'\s*,\s*{num}\s*,\s*{num}\s*,\s*{num}\s*,\s*{num}\s*\)", block):
        pts += [(float(l), float(t)), (float(r), float(b))]
    for x, y, bw, bh, iw, ih in re.findall(rf"pxRectToArea\(\s*'[^']*'\s*,\s*\[{num}\s*,\s*{num}\s*,\s*{num}\s*,\s*{num}\s*\]\s*,\s*{num}\s*,\s*{num}\s*\)", block):
        x, y, bw, bh, iw, ih = map(float, (x, y, bw, bh, iw, ih))
        pts += [(x / iw * 100, y / ih * 100), ((x + bw) / iw * 100, (y + bh) / ih * 100)]
    pts += [(float(x), float(y)) for x, y in re.findall(rf'\{{\s*x:\s*{num}\s*,\s*y:\s*{num}\s*\}}', block)]
    return pts


def export_geometry(src: Path, args: argparse.Namespace) -> dict:
    """Geometry of one drawing in % of the original image (see the module doc)."""
    original = Image.open(src)
    flat = Image.new('RGBA', original.size, (255, 255, 255, 255))
    flat.alpha_composite(original.convert('RGBA'))
    gray = np.asarray(flat.convert('L')).astype(np.float32)
    mask = gray < THRESHOLD
    h, w = mask.shape
    horiz, vert = structure_parts(mask, args.wall_len, args.min_thick, args.max_density)
    layout = LAYOUT_IDS[src.stem]

    r2 = lambda v: round(float(v), 2)
    pct = lambda x, y, bw, bh: {'x': r2(x / w * 100), 'y': r2(y / h * 100), 'w': r2(bw / w * 100), 'h': r2(bh / h * 100)}
    walls = []  # (wall, is band)
    for x, y, bw, bh in wall_rects(horiz, args.wall_min) + [(x, y, ww, hh) for y, x, hh, ww in wall_rects(vert.T, args.wall_min)]:
        walls.append((pct(x, y, bw, bh), False))
    for cx, cy, length, width, angle in band_walls(band_mask(mask)):
        if abs(angle) <= ANGLE_SNAP or abs(abs(angle) - 90) <= ANGLE_SNAP:
            bw, bh = (length, width) if abs(angle) <= ANGLE_SNAP else (width, length)
            walls.append((pct(cx - bw / 2, cy - bh / 2, bw, bh), True))
        else:
            walls.append(({**pct(cx - length / 2, cy - width / 2, length, width), 'angle': r2(angle)}, True))

    override = OUTLINE_OVERRIDE.get(layout)
    if override:
        outline = [{'x': r2(p['x']), 'y': r2(p['y'])} for p in override]
    else:
        xs, ys = zip(*area_points(src.stem))
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        px, py = (x1 - x0) * OUTLINE_PAD, (y1 - y0) * OUTLINE_PAD
        x0, x1, y0, y1 = max(0, x0 - px), min(100, x1 + px), max(0, y0 - py), min(100, y1 + py)
        outline = [{'x': r2(x0), 'y': r2(y0)}, {'x': r2(x1), 'y': r2(y0)}, {'x': r2(x1), 'y': r2(y1)}, {'x': r2(x0), 'y': r2(y1)}]
    poly = np.array([[p['x'], p['y']] for p in outline], np.float32)
    ox0, oy0 = poly.min(axis=0)
    ox1, oy1 = poly.max(axis=0)
    tol_x, tol_y = (ox1 - ox0) * EDGE_TOL, (oy1 - oy0) * EDGE_TOL

    kept = []
    for r, is_band in walls:
        cx, cy = r['x'] + r['w'] / 2, r['y'] + r['h'] / 2
        if cv2.pointPolygonTest(poly, (float(cx), float(cy)), False) < 0:
            continue
        thick = min(r['w'] * w, r['h'] * h) / 100 if 'angle' not in r else min(r['w'] * w / 100, r['h'] * h / 100)
        if is_band and thick >= BAND_MIN and min(cx - ox0, ox1 - cx) > tol_x and min(cy - oy0, oy1 - cy) > tol_y:
            continue
        kept.append(r)
    print(f'{layout}: walls {len(walls)} -> {len(kept)}')
    return {
        'layoutId': layout,
        'image': src.name,
        'imgW': w,
        'imgH': h,
        'walls': kept,
        'buildingOutline': outline,
        'outlineOverride': override or None,
        'columns': [],
        'machines': [],
    }


def draw_geometry(src: Path, geo: dict, dst: Path) -> None:
    """Preview: the geometry over the faded original (outline blue, axis walls red, band walls orange)."""
    base = Image.open(src).convert('RGBA')
    bg = Image.new('RGBA', base.size, (255, 255, 255, 255))
    bg.alpha_composite(base)
    canvas = Image.blend(bg, Image.new('RGBA', base.size, (255, 255, 255, 255)), 0.45)
    over = Image.new('RGBA', base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    W, H = geo['imgW'], geo['imgH']
    if geo['buildingOutline']:
        d.polygon([(p['x'] * W / 100, p['y'] * H / 100) for p in geo['buildingOutline']], fill=(37, 99, 235, 30), outline=(37, 99, 235, 255))
    for r in geo['walls']:
        x, y, bw, bh = r['x'] * W / 100, r['y'] * H / 100, r['w'] * W / 100, r['h'] * H / 100
        pts = rect_corners(x + bw / 2, y + bh / 2, bw, bh, r.get('angle', 0)).tolist()
        band = 'angle' in r or min(bw, bh) >= BAND_MIN
        d.polygon([tuple(p) for p in pts], fill=(234, 88, 12, 170) if band else (220, 38, 38, 210))
    canvas.alpha_composite(over)
    canvas.convert('RGB').save(dst)


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
    ap.add_argument('--export-geometry', action='store_true', help=f'write {GEOMETRY.name}/<layoutId>.json instead of the -3d images')
    ap.add_argument('--wall-min', type=int, default=8, help='geometry: shortest wall segment kept, px (default 8)')
    ap.add_argument('--preview', type=Path, help='geometry: also draw each JSON over its original into this folder')
    args = ap.parse_args()
    depth = max(1, min(MAX_DEPTH, args.depth))
    for c in (OUTDOOR, MACHINE, *FLOOR_PALETTES.values(), FLOOR):
        assert saturation(c) <= MAX_SATURATION, c

    sources = sorted(p for p in MAPS.glob('*.png') if not p.stem.endswith('-3d'))
    if args.only:
        sources = [p for p in sources if p.stem == args.only]
        if not sources:
            raise SystemExit(f'no image named {args.only!r} in {MAPS}')

    if args.export_geometry:
        GEOMETRY.mkdir(parents=True, exist_ok=True)
        for src in sources:
            if src.stem not in LAYOUT_IDS:
                continue
            geo = export_geometry(src, args)
            data = json.dumps(geo, separators=(',', ':')).encode('utf-8')
            dst = GEOMETRY / f"{geo['layoutId']}.json"
            dst.write_bytes(data)
            flag = '' if len(data) <= GEOMETRY_MAX_BYTES else '  (over 150 KB)'
            bands = sum(min(r['w'] * geo['imgW'], r['h'] * geo['imgH']) / 100 >= BAND_MIN or 'angle' in r for r in geo['walls'])
            print(f"{dst.name} ({src.stem}): {len(geo['walls'])} walls ({bands} >= {BAND_MIN}px thick), outline {len(geo['buildingOutline'])} pts, {len(data) / 1024:.1f} KB{flag}")
            if args.preview:
                args.preview.mkdir(parents=True, exist_ok=True)
                draw_geometry(src, geo, args.preview / f"{geo['layoutId']}-geometry.png")
        return

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
