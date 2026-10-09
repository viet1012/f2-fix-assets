import {
  alpha,
  Box,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import GridViewRounded from '@mui/icons-material/GridViewRounded'
import RestartAltRounded from '@mui/icons-material/RestartAltRounded'
import ThreeDRotationRounded from '@mui/icons-material/ThreeDRotationRounded'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { FLOORS, LayoutId, MapArea } from '../../data/mapData'
import { tokens, zonePalette } from '../../theme/palette'
import type { Lang } from '../../types/fixedAsset'
import type { AssetLocation } from '../../types/location'
import type { RelocationTarget } from '../../types/relocation'
import { groupByLayoutZone, movers, rowFac, targetFac, type RelocationContext } from '../../utils/relocation'
import { majorZone } from '../../utils/zone'
import { AMBER, FOCUS } from './RelocationFloorMap'
import { RouteLine, type Route } from './TargetLocationSelect'

type Layout = (typeof FLOORS)[number]
type Pct = { x: number; y: number }
/** src/data/geometry3d/<layoutId>.json (scripts/make3dMaps.py --export-geometry): % of the original image. */
interface Geometry3D {
  imgW: number
  imgH: number
  walls: Array<{ x: number; y: number; w: number; h: number; angle?: number }>
  buildingOutline: Pct[]
  outlineOverride?: Pct[] | null
}

// One JSON chunk per layout, fetched when that layout is shown.
const GEOMETRY = import.meta.glob<Geometry3D>('../../data/geometry3d/*.json', { import: 'default' })
const loadGeometry = (id: LayoutId) => GEOMETRY[`../../data/geometry3d/${id}.json`]?.() ?? Promise.resolve(null)

const MAP = tokens.light // State colours, the same in both theme modes (as on the 2D maps).
/** Scene width in m (1 unit = 1 m); the depth follows imgW:imgH. */
const SCENE_W = 120
const WALL_H = 1.5
const OUTLINE_DEPTH = 0.2
const BG = { light: '#eef2f6', dark: '#0f172a' }
/** Camera elevation above the ground, degrees (OrbitControls polar angle = 90 - elevation). */
const TILT_MIN = 15
const TILT_MAX = 80
const TILT_VIEW = 50
const OPACITY = { zone: 0.55, dim: 0.3, old: 0.5, to: 0.9, ghost: 0.35 }
/** Unrelated blocks are this much lower while machines are selected. */
const DIM_HEIGHT = 0.6
const FLY_MS = 600
const MAX_BOW = 6
const BOX = { w: 1.2, h: 1, gap: 0.5, max: 60 }
/** Sub-zone labels (mode "key") only when the camera is closer than this (m). */
const SUB_LABEL_DIST = 55
/** Label visibility / overlap pass at most every LABEL_CULL_MS. */
const LABEL_CULL_MS = 100
const LABEL_PAD = 2
const PANEL_W = 300
const DISABLED = '#94a3b8'
const ZONE_H = { min: 0.6, max: 6 }

type LabelMode = 'off' | 'key' | 'all'
/** Overlap priority: to > from/old > major area > sub-zone. */
type LabelTier = 'to' | 'from' | 'major' | 'sub'
const TIER_RANK: Record<LabelTier, number> = { to: 3, from: 2, major: 1, sub: 0 }
interface LabelEntry {
  obj: CSS2DObject
  tier: LabelTier
  /** World point that must be in view (zone centre, or the label itself). */
  anchor: THREE.Vector3
  /** Measured chip size (px), 0 until it has been on screen. */
  w: number
  h: number
}

/** Height (m) of a zone block: 0.6 + 5.4·sqrt(count / max), i.e. 0.6–6 m. */
export function zoneHeight(count: number, max: number): number {
  return ZONE_H.min + (ZONE_H.max - ZONE_H.min) * Math.sqrt(max > 0 ? Math.min(1, Math.max(0, count) / max) : 0)
}

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Scene frame of a layout: % of the image -> metres, centred on the origin (x right, z = image down). */
function frameOf(layout: Layout) {
  const w = SCENE_W
  const d = (SCENE_W * layout.imgH) / layout.imgW
  return { w, d, X: (px: number) => (px / 100 - 0.5) * w, Z: (py: number) => (py / 100 - 0.5) * d }
}
type Frame = ReturnType<typeof frameOf>

/** Polygon in % -> prism from y = 0 to `depth` (shape drawn in (X, -Z), then laid flat). */
function prism(f: Frame, pts: readonly Pct[], depth: number) {
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(f.X(p.x), -f.Z(p.y))))
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  return g
}

/** Flat band along a closed polygon on the floor; `dash` = [on, off] metres. */
function ribbon(f: Frame, pts: readonly Pct[], width: number, color: string, opacity = 1, dash?: readonly [number, number]) {
  const pos: number[] = []
  const y = 0.04
  const quad = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az) || 1
    const nx = (-(bz - az) / len) * (width / 2)
    const nz = ((bx - ax) / len) * (width / 2)
    pos.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz, ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz)
  }
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length]
    const [ax, az, bx, bz] = [f.X(p.x), f.Z(p.y), f.X(q.x), f.Z(q.y)]
    if (!dash) return quad(ax, az, bx, bz)
    const len = Math.hypot(bx - ax, bz - az)
    for (let t = 0; t < len; t += dash[0] + dash[1]) {
      const t1 = Math.min(len, t + dash[0])
      quad(ax + ((bx - ax) * t) / len, az + ((bz - az) * t) / len, ax + ((bx - ax) * t1) / len, az + ((bz - az) * t1) / len)
    }
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: false }))
}

function bboxOf(pts: readonly Pct[]) {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

/** CSS2D chip; `center` = which point of the chip sits on the anchor (0.5, 1 = above it). */
function chip(text: string, style: Partial<CSSStyleDeclaration>, font: string, center: [number, number] = [0.5, 0.5]) {
  const el = document.createElement('div')
  el.textContent = text
  Object.assign(el.style, {
    font: `700 12px/1.25 ${font}`,
    padding: '2px 8px',
    borderRadius: '6px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    boxShadow: '0 1px 3px rgba(15,23,42,.25)',
    ...style,
  })
  const obj = new CSS2DObject(el)
  obj.center.set(center[0], center[1])
  return obj
}

function applyRotation(group: THREE.Object3D, layout: Layout) {
  // Mold: the drawing is shown turned clockwise (rotationDeg); seen from above that is negative about +y.
  if ('rotationDeg' in layout) group.rotation.y = -(layout.rotationDeg * Math.PI) / 180
}

/** CSS2DRenderer keeps a label's element until that label itself is removed: detach and drop every one under `root`. */
function disposeLabels(root: THREE.Object3D) {
  const found: CSS2DObject[] = []
  root.traverse((o) => {
    if (o instanceof CSS2DObject) found.push(o)
  })
  for (const o of found) {
    o.removeFromParent()
    o.element.remove()
  }
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    mesh.geometry?.dispose()
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const mat of mats) {
      ;(mat as THREE.MeshStandardMaterial).map?.dispose()
      mat.dispose()
    }
  })
}

/** Floor (drawing), building slab and walls of one layout. */
function buildBase(layout: Layout, geo: Geometry3D | null, onTexture: () => void) {
  const f = frameOf(layout)
  const group = new THREE.Group()
  const texture = new THREE.TextureLoader().load(layout.imageData3d ?? layout.imageData, onTexture)
  texture.colorSpace = THREE.SRGBColorSpace
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.d), new THREE.MeshStandardMaterial({ map: texture }))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.01
  floor.receiveShadow = true
  group.add(floor)

  const outline = geo?.outlineOverride?.length ? geo.outlineOverride : geo?.buildingOutline
  if (outline && outline.length >= 3) {
    const base = new THREE.Mesh(prism(f, outline, OUTLINE_DEPTH), new THREE.MeshStandardMaterial({ color: '#e2e8f0' }))
    base.position.y = -OUTLINE_DEPTH
    base.receiveShadow = true
    group.add(base)
  }
  if (geo?.walls.length) {
    const walls = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: '#cbd5e1', transparent: true, opacity: 0.7 }),
      geo.walls.length,
    )
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    geo.walls.forEach((r, i) => {
      // `angle` is clockwise in image px (z down), i.e. negative about +y; the scale is uniform, so it carries over.
      q.setFromAxisAngle(up, -((r.angle ?? 0) * Math.PI) / 180)
      const pos = new THREE.Vector3(f.X(r.x + r.w / 2), WALL_H / 2, f.Z(r.y + r.h / 2))
      walls.setMatrixAt(i, m.compose(pos, q, new THREE.Vector3((r.w / 100) * f.w, WALL_H, (r.h / 100) * f.d)))
    })
    walls.castShadow = true
    walls.receiveShadow = true
    group.add(walls)
  }
  applyRotation(group, layout)
  return group
}

/** Raised arc from `a` to `b`: white casing tube under a coloured tube, cone head, moving dots. */
function buildArc(a: THREE.Vector3, b: THREE.Vector3, color: string, animate: boolean) {
  const group = new THREE.Group()
  const bow = Math.min(MAX_BOW, a.distanceTo(b) * 0.3)
  const mid = a.clone().add(b).multiplyScalar(0.5)
  mid.y = Math.max(a.y, b.y) + bow
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b)
  const segs = 48
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.38, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' })))
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.22, 8), new THREE.MeshStandardMaterial({ color })))
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.8, 16), new THREE.MeshStandardMaterial({ color }))
  head.position.copy(curve.getPoint(0.97))
  head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangent(0.97).normalize())
  group.add(head)
  const tick: ((now: number) => void) | null = animate
    ? (() => {
        const dots = [0, 1, 2].map(() => {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }))
          group.add(dot)
          return dot
        })
        return (now: number) => dots.forEach((dot, k) => dot.position.copy(curve.getPoint(((now / 1800 + k / 3) % 1) * 0.94)))
      })()
    : null
  return { group, tick }
}

interface Engine {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  renderer: THREE.WebGLRenderer
  sun: THREE.DirectionalLight
  base: THREE.Group | null
  overlay: THREE.Group | null
  /** Per-frame animations of the overlay (glow ring, arc dots). */
  animators: Array<(now: number) => void>
  /** Labels of the overlay (one per zone code); visibility set by the cull pass. */
  labels: LabelEntry[]
  labelMode: LabelMode
  /** Re-run the label pass on the next frame (new labels / mode). */
  invalidateLabels: () => void
  /** Hover / click targets: zone blocks and machine boxes. */
  picks: THREE.Object3D[]
  blocks: Map<string, THREE.Mesh>
  /** World points framed by the camera (old + destination zones, edge pills). */
  focus: THREE.Vector3[]
  requestRender: () => void
  fly: (pos: THREE.Vector3, target: THREE.Vector3) => void
}

type PickData = { kind: 'zone'; code: string; tip: string; pickable: boolean } | { kind: 'machine'; tip: string }

export interface Relocation3DViewProps {
  lang: Lang
  open: boolean
  onClose: () => void
  layouts: readonly Layout[]
  initialLayoutId: LayoutId
  /** Asset count per zone code (GET /api/locations). */
  zoneCount: ReadonlyMap<string, number>
  /** Selected machines. */
  rows: readonly AssetLocation[]
  target: RelocationTarget | null
  ctx: RelocationContext
  /** Route line of the destination card (null = nothing moves yet). */
  route: Route | null
  routeColors: { from: string; to: string }
  /** "Toà B / 1F" of a layout for a building (API fac). */
  placeOf: (id: LayoutId, fac: string | null) => string
  /** Header place of the layout shown. */
  layoutPlace: (id: LayoutId) => string
  isPickable: (id: LayoutId, code: string) => boolean
  /** Same handler as the After map. */
  onPickZone: (target: RelocationTarget) => void
}

/** Legend swatch (as on the 2D toolbar). */
function Swatch({ color, fill = 0.28, dashed = false, label }: { color: string; fill?: number; dashed?: boolean; label: string }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      <Box aria-hidden sx={{ width: 16, height: 12, borderRadius: '3px', flexShrink: 0, bgcolor: alpha(color, fill), border: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }} />
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Stack>
  )
}

/** 3D view of a layout: drawing as floor, walls, leaf zones raised by asset count, the move as pins / arcs. Lazy chunk. */
export default function Relocation3DView(props: Relocation3DViewProps) {
  const { lang, open, onClose, layouts, initialLayoutId, zoneCount, rows, target, ctx, route, routeColors, layoutPlace } = props
  const vi = lang === 'vi'
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const font = String(theme.typography.fontFamily)
  const [layoutId, setLayoutId] = useState<LayoutId>(initialLayoutId)
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'nowebgl'>(() => (hasWebGL() ? 'loading' : 'nowebgl'))
  const [engineId, setEngineId] = useState(0)
  const [panelOpen, setPanelOpen] = useState(true)
  const [relatedOnly, setRelatedOnly] = useState(false)
  const [labelMode, setLabelMode] = useState<LabelMode>('key')
  const [hoverZone, setHoverZone] = useState<string | null>(null)
  const engineRef = useRef<Engine | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  // Latest parent callbacks (new functions every render) without rebuilding the scene for them.
  const live = useRef(props)
  live.current = props
  const layout = layouts.find((l) => l.id === layoutId) ?? layouts[0]
  const countText = (n: number) => `${n} ${vi ? 'máy' : n === 1 ? 'machine' : 'machines'}`
  const moving = target ? movers(rows, target, ctx) : rows
  const routeKey = `${layout.id}|${target ? `${target.layoutId}:${target.zone}` : ''}|${rows.map((r) => r.code).join(',')}`

  // Renderer, camera, controls, lights and the frame loop: once per dialog.
  useEffect(() => {
    if (!host || status === 'nowebgl') return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      setStatus('nowebgl')
      return
    }
    let disposed = false
    let frame = 0
    let flight: { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; start: number } | null = null
    const reduced = reducedMotion()
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.style.display = 'block'
    // StrictMode / remount: never stack a second canvas or label layer on leftovers.
    host.querySelectorAll(':scope > [data-reloc3d-layer]').forEach((el) => el.remove())
    renderer.domElement.dataset.reloc3dLayer = 'canvas'
    host.appendChild(renderer.domElement)
    const labels = new CSS2DRenderer()
    labels.domElement.dataset.reloc3dLayer = 'labels'
    Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' })
    host.appendChild(labels.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.minPolarAngle = ((90 - TILT_MAX) * Math.PI) / 180
    controls.maxPolarAngle = ((90 - TILT_MIN) * Math.PI) / 180
    controls.minDistance = 5
    controls.maxDistance = SCENE_W * 3

    const world = new THREE.Vector3()
    const view = new THREE.Vector3()
    let lastCull = -Infinity
    let labelsDirty = true
    /** Mode / distance gate, in-view test, then greedy overlap removal by tier (screen bboxes). */
    const cullLabels = () => {
      camera.updateMatrixWorld()
      const W = renderer.domElement.clientWidth
      const H = renderer.domElement.clientHeight
      const mode = engine.labelMode
      const cand: Array<{ e: LabelEntry; x: number; y: number; dist: number }> = []
      for (const e of engine.labels) {
        e.obj.visible = false
        if (mode === 'off') continue
        const dist = camera.position.distanceTo(e.anchor)
        if (e.tier === 'sub' && mode === 'key' && dist >= SUB_LABEL_DIST) continue
        view.copy(e.anchor).applyMatrix4(camera.matrixWorldInverse)
        if (view.z >= 0) continue // behind the camera
        view.applyMatrix4(camera.projectionMatrix)
        if (Math.abs(view.x) > 1 || Math.abs(view.y) > 1 || view.z > 1) continue
        e.obj.getWorldPosition(world).project(camera)
        cand.push({ e, x: ((world.x + 1) / 2) * W, y: ((1 - world.y) / 2) * H, dist })
      }
      cand.sort((a, b) => TIER_RANK[b.e.tier] - TIER_RANK[a.e.tier] || a.dist - b.dist)
      const taken: Array<[number, number, number, number]> = []
      for (const { e, x, y } of cand) {
        if (!e.w && e.obj.element.offsetWidth) {
          e.w = e.obj.element.offsetWidth
          e.h = e.obj.element.offsetHeight
        }
        const w = e.w || (e.obj.element.textContent?.length ?? 0) * 7 + 16
        const h = e.h || 18
        const x0 = x - e.obj.center.x * w - LABEL_PAD
        const y0 = y - e.obj.center.y * h - LABEL_PAD
        const x1 = x0 + w + 2 * LABEL_PAD
        const y1 = y0 + h + 2 * LABEL_PAD
        if (taken.some(([a0, b0, a1, b1]) => x0 < a1 && x1 > a0 && y0 < b1 && y1 > b0)) continue
        taken.push([x0, y0, x1, y1])
        e.obj.visible = true
      }
    }
    const tick = (now: number) => {
      frame = 0
      if (disposed) return
      if (flight) {
        const k = Math.min(1, (now - flight.start) / FLY_MS)
        const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2
        camera.position.lerpVectors(flight.p0, flight.p1, e)
        controls.target.lerpVectors(flight.t0, flight.t1, e)
        controls.update()
        if (k >= 1) flight = null
      }
      if (!reduced) engine.animators.forEach((a) => a(now))
      // Throttled label pass; while one is pending the loop keeps running so the last camera pose is culled too.
      labelsDirty = now - lastCull < LABEL_CULL_MS
      if (!labelsDirty) {
        cullLabels()
        lastCull = now
      }
      renderer.render(scene, camera)
      labels.render(scene, camera)
      if (labelsDirty || flight || (!reduced && engine.animators.length)) requestRender()
    }
    const requestRender = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(tick)
    }
    const fly = (p1: THREE.Vector3, t1: THREE.Vector3) => {
      if (reduced) {
        flight = null
        camera.position.copy(p1)
        controls.target.copy(t1)
        controls.update()
        return requestRender()
      }
      flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1, t1, start: performance.now() }
      requestRender()
    }
    const resize = () => {
      const { clientWidth: cw, clientHeight: ch } = host
      if (!cw || !ch) return
      renderer.setSize(cw, ch)
      labels.setSize(cw, ch)
      camera.aspect = cw / ch
      camera.updateProjectionMatrix()
      requestRender()
    }
    const cancelFlight = () => (flight = null)
    controls.addEventListener('change', requestRender)
    controls.addEventListener('start', cancelFlight)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    ro?.observe(host)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.2))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    scene.add(sun, sun.target)

    // Hover tooltip, highlight and click-to-pick on zone blocks / machine boxes.
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let hovered: THREE.Mesh | null = null
    let down: { x: number; y: number } | null = null
    const hitAt = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      return (ray.intersectObjects(engine.picks.filter((o) => o.visible), false)[0]?.object as THREE.Mesh | undefined) ?? null
    }
    const setHovered = (mesh: THREE.Mesh | null) => {
      if (mesh === hovered) return
      for (const m of [hovered, mesh]) {
        const mat = m?.material as THREE.MeshStandardMaterial | undefined
        if (mat?.emissive) mat.emissive.setScalar(m === mesh ? 0.25 : 0)
      }
      hovered = mesh
      requestRender()
    }
    const onMove = (e: PointerEvent) => {
      const mesh = e.buttons ? null : hitAt(e)
      setHovered(mesh)
      const data = mesh?.userData as PickData | undefined
      const tip = tipRef.current
      renderer.domElement.style.cursor = data?.kind === 'zone' && data.pickable ? 'pointer' : ''
      if (!tip) return
      if (!data) return void (tip.style.display = 'none')
      const r = host.getBoundingClientRect()
      tip.textContent = data.tip
      Object.assign(tip.style, { display: 'block', left: `${e.clientX - r.left + 14}px`, top: `${e.clientY - r.top + 14}px` })
    }
    const onLeave = () => {
      setHovered(null)
      if (tipRef.current) tipRef.current.style.display = 'none'
    }
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY })
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return
      down = null
      const data = hitAt(e)?.userData as PickData | undefined
      if (data?.kind === 'zone' && data.pickable) live.current.onPickZone({ layoutId: engine.layoutId, zone: data.code })
    }
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerleave', onLeave)
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    const invalidateLabels = () => {
      lastCull = -Infinity
      requestRender()
    }
    const engine: Engine & { layoutId: LayoutId } = {
      scene, camera, controls, renderer, sun, base: null, overlay: null, animators: [], labels: [], labelMode: 'key', invalidateLabels,
      picks: [], blocks: new Map(), focus: [], requestRender, fly, layoutId: initialLayoutId,
    }
    engineRef.current = engine
    resize()
    setEngineId((n) => n + 1)

    return () => {
      disposed = true
      if (frame) cancelAnimationFrame(frame)
      engineRef.current = null
      ro?.disconnect()
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      controls.removeEventListener('change', requestRender)
      controls.removeEventListener('start', cancelFlight)
      controls.dispose()
      disposeLabels(scene)
      disposeTree(scene)
      scene.clear()
      renderer.dispose()
      renderer.domElement.remove()
      labels.domElement.remove()
    }
    // initialLayoutId only seeds engine.layoutId (kept current by the base effect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, status === 'nowebgl'])

  // Background follows the theme.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.scene.background = new THREE.Color(dark ? BG.dark : BG.light)
    engine.requestRender()
  }, [engineId, dark])

  // Floor, slab and walls of the layout shown.
  useEffect(() => {
    const engine = engineRef.current as (Engine & { layoutId: LayoutId }) | null
    if (!engine) return
    let cancelled = false
    engine.layoutId = layout.id
    const f = frameOf(layout)
    const r = Math.max(f.w, f.d)
    engine.sun.position.set(-r * 0.4, r * 0.8, r * 0.5)
    Object.assign(engine.sun.shadow.camera, { left: -r * 0.7, right: r * 0.7, top: r * 0.7, bottom: -r * 0.7, near: 1, far: r * 3 })
    engine.sun.shadow.camera.updateProjectionMatrix()
    void loadGeometry(layout.id)
      .catch(() => null)
      .then((geo) => {
        if (cancelled || engineRef.current !== engine) return
        engine.base = buildBase(layout, geo, engine.requestRender)
        engine.scene.add(engine.base)
        setStatus('ready')
        engine.requestRender()
      })
    return () => {
      cancelled = true
      if (engine.base) {
        engine.scene.remove(engine.base)
        disposeTree(engine.base)
        engine.base = null
      }
    }
  }, [engineId, layout])

  // Zones, pins, machines, arcs and labels: rebuilt when the move or the panel options change.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    const { isPickable, placeOf } = live.current
    const f = frameOf(layout)
    // Never stack overlays: drop any previous layoutGroup (and its label elements) first.
    for (const old of engine.scene.children.filter((o) => o.name === 'layoutGroup')) {
      disposeLabels(old)
      engine.scene.remove(old)
      disposeTree(old)
    }
    const group = new THREE.Group()
    group.name = 'layoutGroup'
    applyRotation(group, layout)
    const animators: Engine['animators'] = []
    /** One label per key (zone code); a higher tier replaces a lower one. Anchors are local until the group is placed. */
    const labelMap = new Map<string, LabelEntry>()
    const addLabel = (key: string, tier: LabelTier, obj: CSS2DObject, anchor: THREE.Vector3 = obj.position.clone()) => {
      const prev = labelMap.get(key)
      if (prev && TIER_RANK[prev.tier] >= TIER_RANK[tier]) return
      if (prev) {
        prev.obj.removeFromParent()
        prev.obj.element.remove()
      }
      group.add(obj)
      labelMap.set(key, { obj, tier, anchor, w: 0, h: 0 })
    }
    const picks: THREE.Object3D[] = []
    const blocks = new Map<string, THREE.Mesh>()
    const focusLocal: THREE.Vector3[] = []
    const animate = !reducedMotion()

    // Same states as the After map: to / old / dim, from the shared relocation helpers.
    const groups = groupByLayoutZone(rows, ctx)
    const here = groups.get(layout.id) ?? new Map<string, AssetLocation[]>()
    const placed = new Map([...here].map(([z, rs]) => [z, rs.filter((r) => r.matchLevel !== 'NONE')] as const).filter(([, rs]) => rs.length))
    const toZone = target?.layoutId === layout.id ? target.zone : null
    const movingRows = target ? movers(rows, target, ctx) : []
    const toRows = movingRows.length ? movingRows : rows
    const focusMode = rows.length > 0 || !!toZone

    const areas: MapArea[] = [...layout.areas, ...layout.subAreas]
    const leaves = areas.filter((a) => !areas.some((b) => b.code.startsWith(`${a.code}-`)))
    const majors = layout.areas.map((a) => a.code)
    const colorOf = (code: string) => zonePalette[Math.max(0, majors.indexOf(majorZone(code))) % zonePalette.length]
    const shapeOf = (code: string) => areas.find((a) => a.code === code)
    const centerOf = (code: string): THREE.Vector3 | null => {
      const s = shapeOf(code)
      if (s) {
        const b = bboxOf(s.points)
        return new THREE.Vector3(f.X((b.x0 + b.x1) / 2), 0, f.Z((b.y0 + b.y1) / 2))
      }
      const z = layout.zones.find((m) => m.code === code)
      return z ? new THREE.Vector3(f.X(z.x), 0, f.Z(z.y)) : null
    }
    const related = new Set([...placed.keys(), ...(toZone ? [toZone] : [])])
    const parents = new Set([...related].map(majorZone).filter((m) => !related.has(m)))
    const isRelated = (code: string) => related.has(code) || related.has(majorZone(code))
    const max = Math.max(0, ...leaves.map((a) => zoneCount.get(a.code) ?? 0))
    const heights = new Map<string, number>()

    for (const a of leaves) {
      const count = zoneCount.get(a.code) ?? 0
      const isTo = a.code === toZone
      const isOld = !isTo && placed.has(a.code)
      const rel = isRelated(a.code)
      if (relatedOnly && !rel) continue
      const pickable = isPickable(layout.id, a.code)
      const dim = focusMode && !isTo && !isOld
      const h = Math.max(ZONE_H.min, zoneHeight(count, max) * (dim ? DIM_HEIGHT : 1))
      heights.set(a.code, h)
      const color = isTo ? MAP.relocTo : isOld ? AMBER.base : pickable ? colorOf(a.code) : DISABLED
      const opacity = isTo ? OPACITY.to : isOld ? OPACITY.old : dim ? OPACITY.dim : OPACITY.zone
      // The prism spans y = 0..h (centre h/2): it stands on the floor, just above the drawing.
      const block = new THREE.Mesh(prism(f, a.points, h), new THREE.MeshStandardMaterial({ color, transparent: true, opacity, depthWrite: false }))
      block.position.y = 0.02
      block.castShadow = !dim
      const action = !pickable
        ? vi ? 'Không có trong danh mục vị trí (API), không chọn được' : 'Not in the location list (API), cannot be picked'
        : isTo ? (vi ? 'Đích đã chọn' : 'Selected destination') : vi ? 'Click để chọn làm đích' : 'Click to set as destination'
      block.userData = { kind: 'zone', code: a.code, pickable, tip: `${a.code} · ${countText(count)} · ${action}` } satisfies PickData
      group.add(block)
      picks.push(block)
      blocks.set(a.code, block)
      // Sub-zone chip (a major area without sub-zones gets the major chip below instead).
      if (!isTo && !isOld && !majors.includes(a.code)) {
        const b = bboxOf(a.points)
        const label = chip(`${a.code} · ${count}`, { background: 'rgba(255,255,255,.92)', color: colorOf(a.code), border: `1px solid ${colorOf(a.code)}`, fontSize: '11px', fontWeight: '600', padding: '1px 6px' }, font)
        label.position.set(f.X((b.x0 + b.x1) / 2), h + 0.3, f.Z((b.y0 + b.y1) / 2))
        addLabel(a.code, 'sub', label)
      }
    }

    // Floor outlines: old zones dashed amber; major areas holding a related zone bold in their colour.
    for (const code of placed.keys()) {
      const s = code === toZone ? undefined : shapeOf(code)
      if (s) group.add(ribbon(f, s.points, 0.35, AMBER.base, 1, [1.2, 0.8]))
    }
    for (const code of parents) {
      const s = shapeOf(code)
      if (s) group.add(ribbon(f, s.points, 0.6, colorOf(code), 0.9))
    }
    // Major-area labels on the floor, bottom-right corner, in the area colour; shown while the area centre is in view.
    for (const a of layout.areas) {
      if (relatedOnly && !isRelated(a.code) && !parents.has(a.code)) continue
      const b = bboxOf(a.points)
      const label = chip(a.code, { background: colorOf(a.code), color: '#ffffff', fontSize: '11px', padding: '1px 6px' }, font, [1, 1])
      label.position.set(f.X(b.x1) - 0.5, 0.1, f.Z(b.y1) - 0.5)
      addLabel(a.code, 'major', label, new THREE.Vector3(f.X((b.x0 + b.x1) / 2), 0.1, f.Z((b.y0 + b.y1) / 2)))
    }

    // Destination: soft pulsing ring on the floor.
    const toCenter = toZone ? centerOf(toZone) : null
    if (toZone && toCenter) {
      const s = shapeOf(toZone)
      const b = s ? bboxOf(s.points) : null
      const radius = b ? Math.max(((b.x1 - b.x0) / 100) * f.w, ((b.y1 - b.y0) / 100) * f.d) / 2 + 1.2 : 4
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.9, 64), new THREE.MeshBasicMaterial({ color: MAP.relocTo, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }))
      ring.rotation.x = -Math.PI / 2
      ring.position.set(toCenter.x, 0.05, toCenter.z)
      group.add(ring)
      animators.push((now) => {
        const k = (Math.sin(now / 450) + 1) / 2
        ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.4 * k
        ring.scale.setScalar(1 + 0.06 * k)
      })
      focusLocal.push(toCenter.clone())
    }

    // Pins with captions (as the 2D chips) and the machine boxes (a count symbol, not real positions).
    const topOf = (code: string) => heights.get(code) ?? 0.3
    const pin = (code: string, tier: LabelTier, at: THREE.Vector3, color: string, text: string, style: Partial<CSSStyleDeclaration>) => {
      const top = at.y + 2.4
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 8), new THREE.MeshStandardMaterial({ color }))
      stem.position.set(at.x, at.y + 1.2, at.z)
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshStandardMaterial({ color }))
      head.position.set(at.x, top, at.z)
      head.castShadow = true
      const label = chip(text, style, font, [0.5, 1.25])
      label.position.set(at.x, top + 0.5, at.z)
      group.add(stem, head)
      addLabel(code, tier, label, new THREE.Vector3(at.x, at.y, at.z))
    }
    const boxGrid = (list: readonly AssetLocation[], at: THREE.Vector3, color: string, opacity: number) => {
      const n = Math.min(list.length, BOX.max)
      const cols = Math.ceil(Math.sqrt(n))
      const step = BOX.w + BOX.gap
      const geom = new THREE.BoxGeometry(BOX.w, BOX.h, BOX.w)
      list.slice(0, n).forEach((r, i) => {
        const c = i % cols
        const row = Math.floor(i / cols)
        const box = new THREE.Mesh(i ? geom.clone() : geom, new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity }))
        box.position.set(at.x + (c - (cols - 1) / 2) * step, BOX.h / 2 + 0.03, at.z + (row - (Math.ceil(n / cols) - 1) / 2) * step)
        box.castShadow = opacity >= 1
        box.userData = { kind: 'machine', tip: [r.code, r.name].filter(Boolean).join(' · ') } satisfies PickData
        group.add(box)
        picks.push(box)
      })
    }
    const arcTo = (from: THREE.Vector3, to: THREE.Vector3, color: string) => {
      const arc = buildArc(from, to, color, animate)
      group.add(arc.group)
      if (arc.tick) animators.push(arc.tick)
    }
    const oldStyle = { background: AMBER.paper, color: AMBER.ink, border: `1.5px dashed ${AMBER.base}` }
    const toEnd = toZone && toCenter ? new THREE.Vector3(toCenter.x, topOf(toZone) + 0.4, toCenter.z) : null
    for (const [code, rs] of placed) {
      if (code === toZone) continue
      const c = centerOf(code)
      if (!c) continue
      const label = `${rs.length > 1 ? `${rs[0].code} +${rs.length - 1}` : rs[0].code} (${vi ? 'cũ' : 'old'})`
      pin(code, 'from', new THREE.Vector3(c.x, topOf(code), c.z), AMBER.base, label, oldStyle)
      boxGrid(target ? rs.filter((r) => movingRows.includes(r)) : rs, c, AMBER.base, 1)
      if (toEnd) arcTo(new THREE.Vector3(c.x, topOf(code) + 0.4, c.z), toEnd, MAP.relocTo)
      focusLocal.push(c)
    }
    if (toZone && toCenter && toRows.length) {
      pin(toZone, 'to', new THREE.Vector3(toCenter.x, topOf(toZone), toCenter.z), MAP.relocTo, `${toZone} · ${toRows.length === 1 ? toRows[0].code : countText(toRows.length)}`, { background: MAP.relocTo, color: '#ffffff' })
      boxGrid(toRows, toCenter, MAP.relocTo, OPACITY.ghost)
    }

    // Machines from other layouts: purple arcs from the left edge, with the 2D pill text.
    const pillStyle = { background: MAP.relocCross, color: '#ffffff', borderRadius: '999px' }
    if (toEnd) {
      const sources = [...groups].flatMap(([id, byZone]) => {
        if (id === null || id === layout.id) return []
        const rs = [...byZone.values()].flat()
        const from = layouts.find((l) => l.id === id)
        return from ? [{ id, text: `◂ ${vi ? 'Từ' : 'From'} ${placeOf(id, rowFac(rs[0], ctx))} / ${[...byZone.keys()].join(', ')} (${rs.length})` }] : []
      })
      sources.forEach((s, i) => {
        const start = new THREE.Vector3(-f.w / 2 - 2, 0.4, Math.max(-f.d / 2, Math.min(f.d / 2, toEnd.z + (i - (sources.length - 1) / 2) * 7)))
        const label = chip(s.text, pillStyle, font, [1, 0.5])
        label.position.copy(start)
        addLabel(`from:${s.id}`, 'from', label)
        arcTo(start, toEnd, MAP.relocCross)
        focusLocal.push(start)
      })
    }
    // Destination on another layout: purple arcs to the right edge + "Sang ... ▸" pill.
    if (target && target.layoutId !== layout.id && placed.size) {
      const olds = [...placed.keys()].map((z) => [z, centerOf(z)] as const).filter((e): e is readonly [string, THREE.Vector3] => !!e[1])
      if (olds.length) {
        const z = olds.reduce((s, [, c]) => s + c.z, 0) / olds.length
        const end = new THREE.Vector3(f.w / 2 + 2, 0.4, z)
        const label = chip(`${vi ? 'Sang' : 'To'} ${placeOf(target.layoutId, targetFac(target, ctx))} / ${target.zone} ▸`, pillStyle, font, [0, 0.5])
        label.position.copy(end)
        addLabel(`to:${target.layoutId}:${target.zone}`, 'to', label)
        for (const [code, c] of olds) arcTo(new THREE.Vector3(c.x, topOf(code) + 0.4, c.z), end, MAP.relocCross)
        focusLocal.push(end)
      }
    }

    engine.scene.add(group)
    group.updateMatrixWorld(true)
    const labels = [...labelMap.values()]
    for (const l of labels) {
      group.localToWorld(l.anchor)
      l.obj.visible = false // until the first label pass
    }
    Object.assign(engine, { overlay: group, animators, labels, picks, blocks, focus: focusLocal.map((p) => group.localToWorld(p.clone())) })
    engine.invalidateLabels()
    return () => {
      disposeLabels(group)
      engine.scene.remove(group)
      disposeTree(group)
      Object.assign(engine, { overlay: null, animators: [], labels: [], picks: [], blocks: new Map(), focus: [] })
    }
    // countText / vi / font follow lang and theme; isPickable / placeOf are read from `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineId, layout, rows, target, ctx, zoneCount, relatedOnly, lang, font])

  // Label mode: only the label pass changes, the scene stays.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.labelMode = labelMode
    engine.invalidateLabels()
  }, [engineId, labelMode])

  /** Camera framing the move (or the whole layout), `elevation` degrees above the ground. */
  const frameView = (elevation = TILT_VIEW) => {
    const engine = engineRef.current
    if (!engine) return
    const f = frameOf(layout)
    const pts = engine.focus.length
      ? engine.focus
      : [new THREE.Vector3(-f.w / 2, 0, -f.d / 2), new THREE.Vector3(f.w / 2, 0, f.d / 2)]
    const box = new THREE.Box3().setFromPoints(pts)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const radius = Math.max(12, Math.hypot(size.x, size.z) / 2 + 6)
    const fov = (engine.camera.fov * Math.PI) / 180
    const dist = (radius / Math.sin(fov / 2)) / Math.min(1, engine.camera.aspect)
    const pos = new THREE.Vector3().setFromSphericalCoords(dist, ((90 - elevation) * Math.PI) / 180, 0).add(center)
    engine.fly(pos, center)
  }
  /** Same target and distance, new elevation (keeps the azimuth). */
  const tiltTo = (elevation: number) => {
    const engine = engineRef.current
    if (!engine) return
    const { camera, controls } = engine
    const dist = camera.position.distanceTo(controls.target)
    const pos = new THREE.Vector3().setFromSphericalCoords(dist, ((90 - elevation) * Math.PI) / 180, controls.getAzimuthalAngle()).add(controls.target)
    engine.fly(pos, controls.target.clone())
  }

  // Open / route change: fly to the old + destination zones (declared after the overlay effect, so its focus is set).
  const frameRef = useRef(frameView)
  frameRef.current = frameView
  useEffect(() => {
    frameRef.current()
  }, [engineId, routeKey])

  // Row hover in the panel: the machine's zone lights up.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !hoverZone) return
    const lit = [...engine.blocks].filter(([code]) => code === hoverZone || majorZone(code) === hoverZone).map(([, m]) => m.material as THREE.MeshStandardMaterial)
    const before = lit.map((m) => m.opacity)
    lit.forEach((m) => {
      m.emissive.setScalar(0.35)
      m.opacity = Math.max(m.opacity, 0.85)
    })
    engine.requestRender()
    return () => {
      lit.forEach((m, i) => {
        m.emissive.setScalar(0)
        m.opacity = before[i]
      })
      engine.requestRender()
    }
  }, [engineId, hoverZone, layout, rows, target, relatedOnly])

  const camButtons = [
    { key: 'top', icon: <GridViewRounded fontSize="small" />, label: vi ? 'Nhìn từ trên' : 'Top view', run: () => tiltTo(TILT_MAX) },
    { key: 'tilt', icon: <ThreeDRotationRounded fontSize="small" />, label: vi ? 'Nhìn nghiêng' : 'Tilted view', run: () => tiltTo(TILT_VIEW) },
    { key: 'reset', icon: <RestartAltRounded fontSize="small" />, label: vi ? 'Đặt lại góc nhìn' : 'Reset view', run: () => frameView() },
  ]

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      slotProps={{ paper: { sx: { width: '90vw', height: '85vh', maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' } } }}
      aria-labelledby="reloc-3d-title"
    >
      <DialogTitle id="reloc-3d-title" component="div" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 1, pr: 1 }}>
        <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }} noWrap>
            {vi ? 'Xem 3D' : '3D view'} · {layoutPlace(layout.id)}
          </Typography>
          {route && <RouteLine lang={lang} route={route} fromColor={routeColors.from} toColor={routeColors.to} testId="reloc-3d" />}
        </Stack>
        <IconButton size="small" onClick={onClose} aria-label={vi ? 'Đóng' : 'Close'}>
          <CloseRounded fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Stack direction="row" sx={{ alignItems: 'center', px: 2, gap: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={layout.id} onChange={(_, id: LayoutId) => setLayoutId(id)} variant="scrollable" sx={{ flex: 1, minWidth: 0, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}>
          {layouts.map((l) => (
            <Tab key={l.id} value={l.id} label={l.title} />
          ))}
        </Tabs>
        <Stack direction="row" role="group" aria-label={vi ? 'Góc nhìn' : 'Camera'}>
          {camButtons.map((b) => (
            <Tooltip key={b.key} title={b.label}>
              <span>
                <IconButton size="small" aria-label={b.label} onClick={b.run} disabled={status !== 'ready'} data-testid={`reloc-3d-cam-${b.key}`}>
                  {b.icon}
                </IconButton>
              </span>
            </Tooltip>
          ))}
          <Tooltip title={panelOpen ? (vi ? 'Thu gọn bảng' : 'Collapse panel') : vi ? 'Mở bảng' : 'Expand panel'}>
            <IconButton size="small" aria-label={vi ? 'Bảng thông tin' : 'Info panel'} aria-expanded={panelOpen} onClick={() => setPanelOpen((v) => !v)}>
              {panelOpen ? <ChevronRightRounded fontSize="small" /> : <ChevronLeftRounded fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden', flex: 1, minHeight: 0 }}>
        <Box sx={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden', bgcolor: dark ? BG.dark : BG.light }}>
          {status === 'nowebgl' ? (
            <Stack data-testid="reloc-3d-nowebgl" role="alert" sx={{ height: '100%', alignItems: 'center', justifyContent: 'center', p: 3 }}>
              <Typography color="text.secondary">
                {vi ? 'Trình duyệt hoặc máy này không hỗ trợ WebGL nên không hiển thị được chế độ 3D.' : 'This browser or device does not support WebGL, so the 3D view cannot be shown.'}
              </Typography>
            </Stack>
          ) : (
            <>
              <Box ref={setHost} data-testid="reloc-3d-canvas" sx={{ position: 'absolute', inset: 0 }} />
              <Box
                ref={tipRef}
                role="tooltip"
                sx={{ position: 'absolute', display: 'none', pointerEvents: 'none', zIndex: 2, maxWidth: 320, px: 1, py: 0.5, borderRadius: 1, fontSize: 12, color: '#ffffff', bgcolor: 'rgba(15,23,42,.92)' }}
              />
              {status === 'loading' && (
                <Typography role="status" color="text.secondary" sx={{ position: 'absolute', top: 12, left: 16 }}>
                  {vi ? 'Đang dựng mô hình 3D...' : 'Building the 3D model...'}
                </Typography>
              )}
            </>
          )}
        </Box>
        {panelOpen && (
          <Stack spacing={1.5} data-testid="reloc-3d-panel" sx={{ width: PANEL_W, flexShrink: 0, borderLeft: 1, borderColor: 'divider', p: 1.5, overflowY: 'auto', bgcolor: 'background.paper' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {vi ? 'Máy di dời' : 'Machines moving'} ({moving.length})
            </Typography>
            {moving.length ? (
              <Table size="small" sx={{ tableLayout: 'fixed', '& td, & th': { px: 0.5, py: 0.375, fontSize: 12 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 76 }}>{vi ? 'Mã' : 'Code'}</TableCell>
                    <TableCell>{vi ? 'Tên' : 'Name'}</TableCell>
                    <TableCell sx={{ width: 96 }}>{vi ? 'Từ → Đến' : 'From → To'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {moving.map((r) => (
                    <TableRow key={r.code} hover onMouseEnter={() => setHoverZone(r.currentZone)} onMouseLeave={() => setHoverZone(null)}>
                      <TableCell sx={{ fontWeight: 600 }}>
                        <Typography variant="inherit" noWrap>{r.code}</Typography>
                      </TableCell>
                      <TableCell>
                        <Tooltip title={r.name ?? ''} placement="left">
                          <Typography variant="inherit" noWrap>{r.name ?? '-'}</Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Typography variant="inherit" noWrap>
                          {r.currentZone ?? '-'} → {target?.zone ?? '-'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Typography variant="body2" color="text.secondary">{vi ? 'Chưa chọn máy.' : 'No machine selected.'}</Typography>
            )}
            <Stack>
              <FormControlLabel
                control={<Checkbox size="small" checked={relatedOnly} onChange={(e) => setRelatedOnly(e.target.checked)} />}
                label={<Typography variant="body2">{vi ? 'Chỉ zone liên quan' : 'Related zones only'}</Typography>}
              />
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
                <Typography variant="body2" id="reloc-3d-labels">{vi ? 'Hiện nhãn' : 'Show labels'}</Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={labelMode}
                  onChange={(_, v: LabelMode | null) => v && setLabelMode(v)}
                  aria-labelledby="reloc-3d-labels"
                  sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1, fontSize: 12, textTransform: 'none' } }}
                >
                  <ToggleButton value="off">{vi ? 'Tắt' : 'Off'}</ToggleButton>
                  <ToggleButton value="key">{vi ? 'Chính' : 'Key'}</ToggleButton>
                  <ToggleButton value="all">{vi ? 'Tất cả' : 'All'}</ToggleButton>
                </ToggleButtonGroup>
              </Stack>
            </Stack>
            <Stack spacing={0.75} aria-label={vi ? 'Chú giải' : 'Legend'}>
              <Swatch color={FOCUS.from.color} fill={1} label={vi ? 'Vị trí hiện tại' : 'Current location'} />
              <Swatch color={FOCUS.old.color} fill={FOCUS.old.fill} dashed label={vi ? 'Vị trí cũ' : 'Old location'} />
              <Swatch color={MAP.relocTo} label={vi ? 'Vị trí mới' : 'New location'} />
              <Swatch color={MAP.relocCross} label={vi ? 'Từ/Sang toà khác' : 'From/To another building'} />
              <Typography variant="caption" color="text.secondary">
                {vi ? 'Chiều cao khối = số máy trong zone' : 'Block height = machines in the zone'}
              </Typography>
            </Stack>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  )
}
