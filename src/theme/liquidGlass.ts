import { alpha, type Theme } from '@mui/material'
import type { CSSObject } from '@mui/material/styles'

/**
 * Liquid Glass-inspired material for the CONTROL layer only (header, tab bars, filters, capsule buttons,
 * map overlays). Content surfaces (cards, charts, tables, map image, panels) stay opaque and never use these.
 *
 * Anatomy of the material:
 * 1. translucent tinted body (vertical gradient + soft top-left sheen)
 * 2. backdrop blur + saturation (the "lens"), only on floating surfaces
 * 3. layered inner highlights (bright top edge, faint bottom edge, very slight bottom-right shade)
 * 4. refraction rim: a 1px gradient ring (bright top-left -> clear -> faint bottom-right), drawn with a
 *    masked ::before so it never covers text
 * 5. soft ambient shadow for separation from the solid content layer
 *
 * NOTE: these objects are consumed by MUI `sx`, where bare numbers on spacing keys are multiplied by
 * theme.spacing (8px) and `borderRadius` by theme.shape.borderRadius. Every length here is a px string.
 */

/** Concentric corner radii in px. Inner = outer - padding. */
export const glassRadius = {
  /** Outer floating bar (header, tab bar). */
  bar: 18,
  /** Items inside a bar with 4px padding: 18 - 4. */
  barItem: 14,
  /** Form controls. */
  control: 12,
  /** Small rectangular buttons. */
  inner: 10,
  /** True capsule: segmented controls, round icon lenses, chips, legend. */
  capsule: 999,
} as const

/** Convert a px number to a string so MUI `sx` does not scale it by theme spacing/shape. */
export const px = (n: number) => `${n}px`

/** Sticky header height: 6px inset top/bottom + 44px floating glass bar. The tab bar sticks right below it. */
export const HEADER_HEIGHT = 56

const glassTokens = {
  light: {
    top: 'rgba(255, 255, 255, 0.62)',
    bottom: 'rgba(255, 255, 255, 0.36)',
    sheen: 'rgba(255, 255, 255, 0.30)',
    solid: 'rgba(255, 255, 255, 0.97)',
    border: 'rgba(255, 255, 255, 0.55)',
    // Hairline outside the white rim so the edge still separates from a light page.
    hairline: 'rgba(15, 23, 42, 0.07)',
    highlight: 'rgba(255, 255, 255, 0.72)',
    lowlight: 'rgba(255, 255, 255, 0.12)',
    shade: 'rgba(15, 23, 42, 0.035)',
    rimStrong: 'rgba(255, 255, 255, 0.95)',
    rimSoft: 'rgba(255, 255, 255, 0.28)',
    shadow: '0 6px 20px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.06)',
    // Inner lens (selected tab / segment / hovered control): brighter, sits inside another glass surface.
    lensTop: 'rgba(255, 255, 255, 0.96)',
    lensBottom: 'rgba(255, 255, 255, 0.64)',
    lensShadow: '0 1px 2px rgba(15, 23, 42, 0.10), 0 3px 10px rgba(15, 23, 42, 0.08)',
    // Controls resting on an opaque card (no blur).
    restTop: 'rgba(255, 255, 255, 0.9)',
    restBottom: 'rgba(241, 245, 249, 0.7)',
    restBorder: 'rgba(15, 23, 42, 0.10)',
    popover: 'rgba(255, 255, 255, 0.86)',
    hoverTint: 'rgba(15, 23, 42, 0.05)',
  },
  dark: {
    top: 'rgba(28, 32, 42, 0.72)',
    bottom: 'rgba(18, 22, 30, 0.52)',
    sheen: 'rgba(255, 255, 255, 0.06)',
    solid: 'rgba(20, 26, 38, 0.97)',
    border: 'rgba(255, 255, 255, 0.12)',
    hairline: 'rgba(0, 0, 0, 0.35)',
    highlight: 'rgba(255, 255, 255, 0.10)',
    lowlight: 'rgba(255, 255, 255, 0.03)',
    shade: 'rgba(0, 0, 0, 0.18)',
    rimStrong: 'rgba(255, 255, 255, 0.26)',
    rimSoft: 'rgba(255, 255, 255, 0.06)',
    shadow: '0 8px 24px rgba(0, 0, 0, 0.38), 0 1px 2px rgba(0, 0, 0, 0.30)',
    lensTop: 'rgba(255, 255, 255, 0.20)',
    lensBottom: 'rgba(255, 255, 255, 0.07)',
    lensShadow: '0 1px 2px rgba(0, 0, 0, 0.40), 0 3px 10px rgba(0, 0, 0, 0.28)',
    restTop: 'rgba(255, 255, 255, 0.075)',
    restBottom: 'rgba(255, 255, 255, 0.03)',
    restBorder: 'rgba(255, 255, 255, 0.10)',
    popover: 'rgba(24, 28, 38, 0.88)',
    hoverTint: 'rgba(255, 255, 255, 0.07)',
  },
} as const

const BLUR = 'blur(20px) saturate(175%)'
const POPOVER_BLUR = 'blur(24px) saturate(180%)'
const REDUCED_TRANSPARENCY = '@media (prefers-reduced-transparency: reduce)'
const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)'
const NO_BACKDROP_SUPPORT = '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))'
const TRANSITION = 'background .18s ease, background-color .18s ease, box-shadow .18s ease, color .18s ease, border-color .18s ease, transform .18s ease'

function g(theme: Theme) {
  return glassTokens[theme.palette.mode]
}

/** Keyboard focus: outline + soft halo, both visible on glass and not relying on shadow alone. */
function focusRing(theme: Theme): CSSObject {
  const t = g(theme)
  return {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: px(-2),
    boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.22)}, inset 0 1px 0 ${t.highlight}`,
  }
}

/** Refraction rim: 1px gradient ring inside the border. The host must be positioned. */
function rim(theme: Theme, strength: 'normal' | 'lens' = 'normal'): CSSObject {
  const t = g(theme)
  const strong = strength === 'lens' ? t.rimStrong : alpha(t.rimStrong, theme.palette.mode === 'dark' ? 0.22 : 0.8)
  return {
    content: '""',
    position: 'absolute',
    inset: 0,
    borderRadius: 'inherit',
    padding: px(1),
    pointerEvents: 'none',
    background: `linear-gradient(135deg, ${strong}, transparent 38%, transparent 62%, ${t.rimSoft})`,
    WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
    WebkitMaskComposite: 'xor',
    mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
    maskComposite: 'exclude',
  }
}

function body(theme: Theme): string {
  const t = g(theme)
  return `radial-gradient(140% 100% at 0% 0%, ${t.sheen}, transparent 55%), linear-gradient(180deg, ${t.top}, ${t.bottom})`
}

function layeredShadow(theme: Theme): string {
  const t = g(theme)
  return `inset 0 1px 0 ${t.highlight}, inset 0 -1px 0 ${t.lowlight}, inset -1px -1px 0 ${t.shade}, 0 0 0 1px ${t.hairline}, ${t.shadow}`
}

/**
 * Floating lens material (with backdrop blur). For surfaces that float over the page or content:
 * header, tab bars, filter fields, map overlays. The host must be positioned (relative/absolute/sticky).
 */
export function glassFloating(theme: Theme, radius: number = glassRadius.bar): CSSObject {
  const t = g(theme)
  return {
    background: body(theme),
    backdropFilter: BLUR,
    WebkitBackdropFilter: BLUR,
    border: `1px solid ${t.border}`,
    borderRadius: px(radius),
    boxShadow: layeredShadow(theme),
    '&::before': rim(theme),
    [REDUCED_TRANSPARENCY]: { backdropFilter: 'none', WebkitBackdropFilter: 'none', background: t.solid },
    // Without a working blur, translucency only hurts legibility: fall back to solid.
    [NO_BACKDROP_SUPPORT]: { background: t.solid },
  }
}

/** Brighter inner lens: selected tab/segment thumb, hover state of lens buttons. */
export function glassLens(theme: Theme): CSSObject {
  const t = g(theme)
  return {
    background: `linear-gradient(180deg, ${t.lensTop}, ${t.lensBottom})`,
    boxShadow: `inset 0 1px 0 ${t.highlight}, inset 0 -1px 0 ${t.lowlight}, ${t.lensShadow}`,
    [REDUCED_TRANSPARENCY]: { background: theme.palette.background.paper },
  }
}

/** Glass look without blur, for small controls resting on an opaque card (pagination select, etc.). */
export function glassInset(theme: Theme, radius: number = glassRadius.control): CSSObject {
  const t = g(theme)
  return {
    background: `linear-gradient(180deg, ${t.restTop}, ${t.restBottom})`,
    border: `1px solid ${t.restBorder}`,
    borderRadius: px(radius),
    boxShadow: `inset 0 1px 0 ${t.highlight}, 0 1px 2px ${alpha('#0f172a', theme.palette.mode === 'dark' ? 0.3 : 0.05)}`,
    [REDUCED_TRANSPARENCY]: { background: theme.palette.background.paper },
  }
}

/** Compact secondary button (Columns, Reset, Load...): 32px, glass body + rim, slight hover lift. */
export function glassButton(theme: Theme): CSSObject {
  const t = g(theme)
  return {
    position: 'relative',
    minHeight: px(32),
    paddingBlock: px(4),
    paddingInline: px(12),
    borderRadius: px(glassRadius.inner),
    color: theme.palette.text.primary,
    background: `linear-gradient(180deg, ${t.restTop}, ${t.restBottom})`,
    border: `1px solid ${t.restBorder}`,
    boxShadow: `inset 0 1px 0 ${t.highlight}, inset -1px -1px 0 ${t.shade}, 0 1px 2px ${alpha('#0f172a', theme.palette.mode === 'dark' ? 0.3 : 0.06)}`,
    transition: TRANSITION,
    '&::before': rim(theme),
    '&:hover': { ...glassLens(theme), borderColor: alpha(theme.palette.primary.main, 0.3), transform: 'translateY(-1px)' },
    '&:active': { transform: 'none', boxShadow: `inset 0 1px 2px ${alpha('#000', theme.palette.mode === 'dark' ? 0.4 : 0.1)}` },
    '&.Mui-disabled': { opacity: 0.55, color: theme.palette.text.disabled, transform: 'none' },
    '&.Mui-focusVisible, &:focus-visible': focusRing(theme),
    [REDUCED_TRANSPARENCY]: { background: theme.palette.background.paper },
    [REDUCED_MOTION]: { transition: 'none', '&:hover': { transform: 'none' } },
  }
}

/** Primary CTA: accent-tinted glass (stays essentially opaque for contrast). */
export function glassTinted(theme: Theme): CSSObject {
  const p = theme.palette.primary
  return {
    position: 'relative',
    color: p.contrastText,
    borderRadius: px(glassRadius.inner),
    minHeight: px(32),
    paddingBlock: px(4),
    paddingInline: px(12),
    background: `radial-gradient(120% 90% at 0% 0%, ${alpha('#fff', 0.22)}, transparent 55%), linear-gradient(180deg, ${alpha(p.main, 0.96)}, ${alpha(p.dark, 0.96)})`,
    boxShadow: `inset 0 1px 0 ${alpha('#fff', 0.38)}, inset 0 -1px 0 ${alpha('#000', 0.14)}, 0 2px 8px ${alpha(p.main, 0.26)}`,
    transition: TRANSITION,
    '&:hover': { background: `linear-gradient(180deg, ${p.main}, ${p.dark})`, transform: 'translateY(-1px)' },
    '&:active': { transform: 'none' },
    '&.Mui-disabled': { background: theme.palette.action.disabledBackground, boxShadow: 'none', color: theme.palette.text.disabled },
    '&.Mui-focusVisible, &:focus-visible': { ...focusRing(theme), outlineColor: theme.palette.text.primary, outlineOffset: px(2) },
    [REDUCED_MOTION]: { transition: 'none', '&:hover': { transform: 'none' } },
  }
}

/** Round glass lens icon button (refresh, theme, zone close, pagination). */
export function glassIconButton(theme: Theme, size = 36): CSSObject {
  const t = g(theme)
  return {
    position: 'relative',
    width: px(size),
    height: px(size),
    padding: 0,
    borderRadius: px(glassRadius.capsule),
    color: theme.palette.text.secondary,
    background: `linear-gradient(180deg, ${alpha(t.lensTop, theme.palette.mode === 'dark' ? 0.6 : 0.55)}, ${alpha(t.lensBottom, 0.35)})`,
    border: `1px solid ${t.border}`,
    boxShadow: `inset 0 1px 0 ${t.highlight}, inset -1px -1px 0 ${t.shade}, 0 0 0 1px ${t.hairline}, 0 1px 3px ${alpha('#0f172a', theme.palette.mode === 'dark' ? 0.35 : 0.08)}`,
    transition: TRANSITION,
    '&::before': rim(theme, 'lens'),
    '&:hover': { ...glassLens(theme), color: theme.palette.text.primary, transform: 'translateY(-1px)' },
    '&:active': { transform: 'none' },
    '&.Mui-disabled': { opacity: 0.5, transform: 'none' },
    '&.Mui-focusVisible, &:focus-visible': focusRing(theme),
    [REDUCED_TRANSPARENCY]: { background: theme.palette.background.paper },
    [REDUCED_MOTION]: { transition: 'none', '&:hover': { transform: 'none' } },
  }
}

/**
 * Segmented control (ToggleButtonGroup): a glass capsule with a brighter lens thumb that slides
 * to the selected segment. Segments are equal width; pass the selected index and segment count.
 */
export function glassSegmented(theme: Theme, selectedIndex: number, count: number, height = 36): CSSObject {
  const t = g(theme)
  const pad = 3
  return {
    position: 'relative',
    display: 'inline-grid',
    gridTemplateColumns: `repeat(${count}, 1fr)`,
    padding: px(pad),
    height: px(height),
    borderRadius: px(glassRadius.capsule),
    background: `linear-gradient(180deg, ${alpha(t.top, 0.5)}, ${alpha(t.bottom, 0.4)})`,
    border: `1px solid ${t.border}`,
    boxShadow: `inset 0 1px 2px ${alpha('#0f172a', theme.palette.mode === 'dark' ? 0.35 : 0.08)}, inset 0 -1px 0 ${t.lowlight}, 0 0 0 1px ${t.hairline}`,
    // Sliding lens thumb.
    '&::after': {
      ...glassLens(theme),
      content: '""',
      position: 'absolute',
      top: px(pad),
      bottom: px(pad),
      left: px(pad),
      width: `calc((100% - ${pad * 2}px) / ${count})`,
      borderRadius: px(glassRadius.capsule),
      transform: `translateX(${selectedIndex * 100}%)`,
      transition: 'transform .22s cubic-bezier(.3,.7,.4,1)',
      pointerEvents: 'none',
    },
    '& .MuiToggleButtonGroup-grouped, & .MuiToggleButton-root': {
      position: 'relative',
      zIndex: 1,
      border: 0,
      margin: 0,
      borderRadius: `${px(glassRadius.capsule)} !important`,
      height: '100%',
      minWidth: px(34),
      paddingBlock: 0,
      paddingInline: px(10),
      lineHeight: 1,
      fontSize: '0.75rem',
      color: theme.palette.text.secondary,
      background: 'transparent',
      transition: 'color .18s ease',
      '&:hover': { backgroundColor: 'transparent', color: theme.palette.text.primary },
      '&.Mui-selected, &.Mui-selected:hover': { background: 'transparent', color: theme.palette.primary.main },
      '&.Mui-focusVisible, &:focus-visible': focusRing(theme),
    },
    [REDUCED_TRANSPARENCY]: { background: theme.palette.background.paper },
    [REDUCED_MOTION]: { '&::after': { transition: 'none' } },
  }
}

/**
 * Tabs as a floating glass bar. MUI's own indicator becomes the selected lens capsule, so it slides
 * between tabs; the tab labels sit above it.
 */
export function glassTabs(theme: Theme): CSSObject {
  return {
    ...glassFloating(theme),
    position: 'relative',
    padding: px(4),
    minHeight: 0,
    '& .MuiTabs-scroller': { position: 'relative' },
    '& .MuiTabs-flexContainer': { gap: px(2) },
    '& .MuiTabs-scrollButtons': { width: px(28), borderRadius: px(glassRadius.barItem) },
    '& .MuiTabs-indicator': {
      ...glassLens(theme),
      top: 0,
      bottom: 0,
      height: '100%',
      borderRadius: px(glassRadius.barItem),
      zIndex: 0,
      '&::before': rim(theme, 'lens'),
    },
    '& .MuiTab-root, & .MuiTab-root.MuiTab-labelIcon': {
      position: 'relative',
      zIndex: 1,
      minHeight: px(34),
      height: px(34),
      paddingBlock: 0,
      paddingInline: px(12),
      minWidth: 0,
      borderRadius: px(glassRadius.barItem),
      fontSize: '0.8125rem',
      color: alpha(theme.palette.text.secondary, 0.92),
      transition: 'color .18s ease, background-color .18s ease',
      '& .MuiTab-icon': { marginRight: px(6), marginBottom: 0, fontSize: px(18), opacity: 0.85 },
      '&:hover': { backgroundColor: g(theme).hoverTint, color: theme.palette.text.primary },
      '&.Mui-selected': { color: theme.palette.primary.main, '& .MuiTab-icon': { opacity: 1 } },
      '&.Mui-selected:hover': { backgroundColor: 'transparent' },
      '&.Mui-focusVisible': focusRing(theme),
    },
    [REDUCED_MOTION]: { '& .MuiTabs-indicator': { transition: 'none' } },
  }
}

/** Popover material (Autocomplete list, menus): floating glass, but denser tint for reading lists. */
export function glassPopover(theme: Theme): CSSObject {
  const t = g(theme)
  return {
    marginTop: px(4),
    background: t.popover,
    backdropFilter: POPOVER_BLUR,
    WebkitBackdropFilter: POPOVER_BLUR,
    border: `1px solid ${t.border}`,
    borderRadius: px(glassRadius.control),
    boxShadow: `inset 0 1px 0 ${t.highlight}, 0 0 0 1px ${t.hairline}, 0 12px 32px ${alpha('#0f172a', theme.palette.mode === 'dark' ? 0.5 : 0.14)}`,
    [REDUCED_TRANSPARENCY]: { backdropFilter: 'none', WebkitBackdropFilter: 'none', background: theme.palette.background.paper },
    [NO_BACKDROP_SUPPORT]: { background: theme.palette.background.paper },
  }
}

/* ------------------------------------------------------------------------------------------------
 * Compact glass form controls: every search field and select/Autocomplete (filter bar, Map PIC,
 * FI Issues toolbar) plus the reset button. 36px controls, 14px corners.
 * ---------------------------------------------------------------------------------------------- */

/** Height shared by search, dropdowns and the reset button so the row aligns exactly. */
export const FILTER_CONTROL_HEIGHT = 36

const filterTokens = {
  light: {
    top: 'rgba(255, 255, 255, 0.72)',
    bottom: 'rgba(255, 255, 255, 0.48)',
    searchTop: 'rgba(255, 255, 255, 0.84)',
    searchBottom: 'rgba(255, 255, 255, 0.58)',
    hoverTop: 'rgba(255, 255, 255, 0.84)',
    hoverBottom: 'rgba(255, 255, 255, 0.62)',
    focusTop: 'rgba(255, 255, 255, 0.92)',
    focusBottom: 'rgba(255, 255, 255, 0.70)',
    border: 'rgba(148, 163, 184, 0.20)',
    hoverBorder: 'rgba(59, 130, 246, 0.28)',
    focusBorder: 'rgba(37, 99, 235, 0.55)',
    focusHalo: 'rgba(37, 99, 235, 0.10)',
    highlight: 'rgba(255, 255, 255, 0.72)',
    hoverHighlight: 'rgba(255, 255, 255, 0.78)',
    focusHighlight: 'rgba(255, 255, 255, 0.80)',
    bottomEdge: 'rgba(15, 23, 42, 0.04)',
    shadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
    hoverShadow: '0 3px 10px rgba(15, 23, 42, 0.07)',
    focusShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
    iconHover: 'rgba(15, 23, 42, 0.06)',
    accentTint: 'rgba(37, 99, 235, 0.07)',
  },
  dark: {
    top: 'rgba(30, 35, 45, 0.78)',
    bottom: 'rgba(20, 24, 32, 0.58)',
    searchTop: 'rgba(36, 42, 54, 0.84)',
    searchBottom: 'rgba(24, 29, 38, 0.64)',
    hoverTop: 'rgba(38, 44, 56, 0.84)',
    hoverBottom: 'rgba(26, 31, 41, 0.66)',
    focusTop: 'rgba(40, 47, 60, 0.90)',
    focusBottom: 'rgba(28, 33, 44, 0.72)',
    border: 'rgba(255, 255, 255, 0.10)',
    hoverBorder: 'rgba(96, 165, 250, 0.32)',
    focusBorder: 'rgba(96, 165, 250, 0.62)',
    focusHalo: 'rgba(96, 165, 250, 0.16)',
    highlight: 'rgba(255, 255, 255, 0.08)',
    hoverHighlight: 'rgba(255, 255, 255, 0.10)',
    focusHighlight: 'rgba(255, 255, 255, 0.12)',
    bottomEdge: 'rgba(0, 0, 0, 0.25)',
    shadow: '0 2px 8px rgba(0, 0, 0, 0.28)',
    hoverShadow: '0 3px 10px rgba(0, 0, 0, 0.34)',
    focusShadow: '0 4px 12px rgba(0, 0, 0, 0.38)',
    iconHover: 'rgba(255, 255, 255, 0.08)',
    accentTint: 'rgba(96, 165, 250, 0.12)',
  },
} as const

const FILTER_BLUR = 'blur(16px) saturate(160%)'
const FILTER_RADIUS = 14

function f(theme: Theme) {
  return filterTokens[theme.palette.mode]
}

/** Small muted icon button inside a field (dropdown chevron, clear). */
function fieldIconButton(theme: Theme): CSSObject {
  return {
    padding: px(3),
    borderRadius: px(8),
    color: alpha(theme.palette.text.secondary, 0.8),
    '& .MuiSvgIcon-root': { fontSize: px(18) },
    '&:hover': { backgroundColor: f(theme).iconHover, color: theme.palette.text.primary },
    '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: px(-1) },
  }
}

/**
 * Container style for the filter grid: styles every OutlinedInput (search + Autocomplete dropdowns)
 * inside it as a compact glass control, and replaces the stock MUI outline/label/arrow look.
 */
export function glassFilterControls(theme: Theme): CSSObject {
  const t = f(theme)
  const h = px(FILTER_CONTROL_HEIGHT)
  return {
    '& .MuiOutlinedInput-root': {
      height: h,
      borderRadius: px(FILTER_RADIUS),
      fontSize: '0.8125rem',
      color: theme.palette.text.primary,
      background: `linear-gradient(180deg, ${t.top}, ${t.bottom})`,
      backdropFilter: FILTER_BLUR,
      WebkitBackdropFilter: FILTER_BLUR,
      boxShadow: `inset 0 1px 0 ${t.highlight}, inset 0 -1px 0 ${t.bottomEdge}, ${t.shadow}`,
      transition: 'background .16s ease, box-shadow .16s ease',
      '& .MuiOutlinedInput-notchedOutline': { borderWidth: px(1), borderColor: t.border, transition: 'border-color .16s ease' },
      '& .MuiOutlinedInput-input': {
        paddingBlock: 0,
        fontWeight: 500,
        '&::placeholder': { color: theme.palette.text.secondary, opacity: 0.72, fontWeight: 400 },
      },
      '&:hover': {
        background: `linear-gradient(180deg, ${t.hoverTop}, ${t.hoverBottom})`,
        boxShadow: `inset 0 1px 0 ${t.hoverHighlight}, inset 0 -1px 0 ${t.bottomEdge}, ${t.hoverShadow}`,
      },
      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: t.hoverBorder },
      // Focused = polished lens: brighter body, accent border, soft halo. Replaces MUI's 2px outline.
      '&.Mui-focused': {
        background: `linear-gradient(180deg, ${t.focusTop}, ${t.focusBottom})`,
        boxShadow: `0 0 0 3px ${t.focusHalo}, inset 0 1px 0 ${t.focusHighlight}, ${t.focusShadow}`,
      },
      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: px(1), borderColor: t.focusBorder },
      '& .MuiInputAdornment-root .MuiIconButton-root': fieldIconButton(theme),
      [REDUCED_TRANSPARENCY]: { backdropFilter: 'none', WebkitBackdropFilter: 'none', background: theme.palette.background.paper },
      [NO_BACKDROP_SUPPORT]: { background: theme.palette.background.paper },
      [REDUCED_MOTION]: { transition: 'none' },
    },
    // Autocomplete: MUI's small-size paddings assume 40px; zero the vertical padding so 36px centres cleanly.
    '& .MuiAutocomplete-inputRoot.MuiOutlinedInput-root.MuiInputBase-sizeSmall': {
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: px(6),
      '& .MuiAutocomplete-input': { paddingTop: 0, paddingBottom: 0, paddingLeft: px(8) },
    },
    '& .MuiAutocomplete-endAdornment': {
      right: px(6),
      top: '50%',
      transform: 'translateY(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: px(1),
    },
    '& .MuiAutocomplete-popupIndicator, & .MuiAutocomplete-clearIndicator': { ...fieldIconButton(theme), marginRight: 0 },
    // Compact labels: centred in 36px at rest, standard floating position when shrunk.
    '& .MuiInputLabel-root': { fontSize: '0.8125rem', color: theme.palette.text.secondary },
    '& .MuiInputLabel-root.MuiInputLabel-sizeSmall:not(.MuiInputLabel-shrink)': { transform: 'translate(14px, 9px) scale(1)' },
    // Keep MUI's 0.75 scale + normal weight so the label width matches the outline notch exactly.
    '& .MuiInputLabel-root.MuiInputLabel-shrink': { transform: 'translate(14px, -8px) scale(0.75)' },
    '& .MuiInputLabel-root.Mui-focused': { color: theme.palette.primary.main },
  }
}

/** Search field: same material, slightly brighter and more prominent than the dropdowns. */
export function glassFilterSearch(theme: Theme): CSSObject {
  const t = f(theme)
  return {
    '& .MuiOutlinedInput-root.MuiInputBase-adornedStart': {
      paddingLeft: px(10),
      background: `linear-gradient(180deg, ${t.searchTop}, ${t.searchBottom})`,
      '&:hover': { background: `linear-gradient(180deg, ${t.focusTop}, ${t.hoverBottom})` },
      '&.Mui-focused': { background: `linear-gradient(180deg, ${t.focusTop}, ${t.focusBottom})` },
      [REDUCED_TRANSPARENCY]: { background: theme.palette.background.paper },
    },
    '& .MuiInputAdornment-positionStart': {
      marginRight: px(6),
      '& .MuiSvgIcon-root': { fontSize: px(18), color: theme.palette.text.secondary },
    },
    '& .MuiOutlinedInput-root.Mui-focused .MuiInputAdornment-positionStart .MuiSvgIcon-root': { color: theme.palette.primary.main },
  }
}

/** "Reset filters": compact ghost glass button, same height as the fields. */
export function glassFilterReset(theme: Theme): CSSObject {
  const t = f(theme)
  return {
    height: px(FILTER_CONTROL_HEIGHT),
    minHeight: 0,
    paddingBlock: 0,
    paddingInline: px(12),
    borderRadius: px(FILTER_RADIUS),
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: theme.palette.text.primary,
    border: `1px solid ${t.border}`,
    background: `linear-gradient(180deg, ${t.top}, ${t.bottom})`,
    boxShadow: `inset 0 1px 0 ${t.highlight}, inset 0 -1px 0 ${t.bottomEdge}, ${t.shadow}`,
    transition: 'background .16s ease, box-shadow .16s ease, border-color .16s ease, color .16s ease',
    '& .MuiButton-startIcon': { marginRight: px(6), '& .MuiSvgIcon-root': { fontSize: px(17) } },
    '&:hover': {
      color: theme.palette.primary.main,
      borderColor: t.hoverBorder,
      background: `linear-gradient(180deg, ${t.accentTint}, ${t.accentTint}), linear-gradient(180deg, ${t.hoverTop}, ${t.hoverBottom})`,
      boxShadow: `inset 0 1px 0 ${t.hoverHighlight}, inset 0 -1px 0 ${t.bottomEdge}, ${t.hoverShadow}`,
    },
    // Disabled: ghost — no fill, no shadow, softened border, still the same shape.
    '&.Mui-disabled': {
      color: theme.palette.text.disabled,
      background: 'transparent',
      borderColor: alpha(t.border, 0.5),
      boxShadow: 'none',
      opacity: 0.7,
    },
    '&.Mui-focusVisible, &:focus-visible': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: px(1),
      boxShadow: `0 0 0 3px ${t.focusHalo}, inset 0 1px 0 ${t.focusHighlight}`,
    },
    [REDUCED_TRANSPARENCY]: { background: theme.palette.background.paper },
    [REDUCED_MOTION]: { transition: 'none' },
  }
}
