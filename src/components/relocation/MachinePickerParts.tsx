import { Box, Button, Chip, ListSubheader, Paper, Stack, Typography, type PaperProps } from '@mui/material'
import CheckBoxOutlineBlankRounded from '@mui/icons-material/CheckBoxOutlineBlankRounded'
import CheckBoxRounded from '@mui/icons-material/CheckBoxRounded'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import { createContext, memo, useContext, type HTMLAttributes, type Key, type ReactNode } from 'react'

/** Lower-case, strip Vietnamese diacritics (đ → d) so "may tien" matches "Máy tiện". */
export const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()

/** Search words: split on whitespace, folded. */
export const searchTokens = (input: string) => fold(input).split(/\s+/).filter(Boolean)

/** Every token must appear somewhere in `folded` (AND). `folded` must already be `fold()`ed: this runs per option per keystroke. */
export const matchesAll = (folded: string, tokens: readonly string[]) => tokens.every((t) => folded.includes(t))

/** `text` with every occurrence of any token in <strong>, matched on folded text but shown with the original characters. */
export function Highlight({ text, tokens }: { text: string; tokens: readonly string[] }) {
  if (!tokens.length || !text) return <>{text}</>
  // Folded string + map from each folded char back to its original index.
  let folded = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const f = fold(text[i])
    folded += f
    for (let k = 0; k < f.length; k++) map.push(i)
  }
  const marks = new Array<boolean>(text.length).fill(false)
  for (const t of tokens) {
    for (let from = folded.indexOf(t); from !== -1; from = folded.indexOf(t, from + 1)) {
      for (let j = map[from]; j <= map[from + t.length - 1]; j++) marks[j] = true
    }
  }
  const parts: { s: string; on: boolean }[] = []
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1]
    if (last && last.on === marks[i]) last.s += text[i]
    else parts.push({ s: text[i], on: marks[i] })
  }
  return <>{parts.map((p, i) => (p.on ? <Box key={i} component="mark" sx={{ bgcolor: 'transparent', color: 'inherit', fontWeight: 800, textDecoration: 'underline' }}>{p.s}</Box> : <span key={i}>{p.s}</span>))}</>
}

/** Building quick filter: "Tất cả (N) / Toà A (n) / …". `value` null = all. */
export function FacChips({ facs, value, total, onChange, allLabel, label }: {
  facs: readonly { fac: string; label: string; count: number }[]
  value: string | null
  total: number
  onChange: (fac: string | null) => void
  allLabel: string
  label: string
}) {
  const chip = (key: string | null, text: string, count: number) => (
    <Chip
      key={key ?? '*'}
      size="small"
      label={`${text} (${count})`}
      color={value === key ? 'primary' : 'default'}
      variant={value === key ? 'filled' : 'outlined'}
      aria-pressed={value === key}
      disabled={key !== null && !count}
      onClick={() => onChange(key)}
    />
  )
  return (
    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }} role="group" aria-label={label}>
      {chip(null, allLabel, total)}
      {facs.map((f) => chip(f.fac, f.label, f.count))}
    </Stack>
  )
}

/** Rows rendered per open group before "Xem thêm". */
export const GROUP_PAGE = 30

/** Row content, memoized on primitives (MUI hands a new `liProps` object on every render, so the <li> itself is not memoized). */
const MachineOptionContent = memo(function MachineOptionContent({ code, name, zone, checked, tokens }: { code: string; name: string | null; zone: string | null; checked: boolean; tokens: readonly string[] }) {
  const Icon = checked ? CheckBoxRounded : CheckBoxOutlineBlankRounded
  return (
    <>
      <Icon fontSize="small" color={checked ? 'primary' : 'action'} aria-hidden data-checked={checked} sx={{ flexShrink: 0 }} />
      <Box component="strong" sx={{ flexShrink: 0 }}><Highlight text={code} tokens={tokens} /></Box>
      <Typography variant="body2" color="text.secondary" noWrap title={name ?? undefined} sx={{ minWidth: 0, flex: 1 }}>
        <Highlight text={name ?? ''} tokens={tokens} />
      </Typography>
      {zone && <Chip size="small" label={zone} variant="outlined" sx={{ ml: 'auto', height: 20, fontSize: 11, flexShrink: 0 }} />}
    </>
  )
})

/** One dropdown row: check icon · bold code · name (ellipsis + native title) · zone chip on the right. */
export const MachineOption = memo(function MachineOption({ liKey, liProps, code, name, zone, checked, tokens }: {
  liKey: Key
  liProps: HTMLAttributes<HTMLLIElement>
  code: string
  name: string | null
  zone: string | null
  checked: boolean
  tokens: readonly string[]
}) {
  return (
    <li key={liKey} {...liProps} style={{ ...liProps.style, gap: 8 }}>
      <MachineOptionContent code={code} name={name} zone={zone} checked={checked} tokens={tokens} />
    </li>
  )
})

/**
 * Group "Toà A · A2-3 (12)": sticky, click to collapse, with a select/deselect-all-in-zone button.
 * Collapsed: header only (children are not rendered). Open: the caller passes at most `shown` rows; "Xem thêm N máy" asks for more.
 */
export function MachineGroup({ group, count, collapsed, allSelected, shown, onToggle, onSelectAll, onShowMore, selectLabel, deselectLabel, moreLabel, children }: {
  group: string
  count: number
  collapsed: boolean
  allSelected: boolean
  /** Rows currently rendered in this group. */
  shown: number
  onToggle: () => void
  onSelectAll: () => void
  onShowMore: () => void
  selectLabel: string
  deselectLabel: string
  moreLabel: (n: number) => string
  children: ReactNode
}) {
  const more = Math.min(GROUP_PAGE, count - shown)
  return (
    <li>
      <ListSubheader
        component="div"
        role="button"
        tabIndex={-1}
        aria-expanded={!collapsed}
        data-group={group}
        onClick={onToggle}
        sx={{ top: -8, zIndex: 1, display: 'flex', alignItems: 'center', gap: 0.5, lineHeight: '32px', cursor: 'pointer', userSelect: 'none', fontWeight: 700 }}
      >
        <ExpandMoreRounded fontSize="small" sx={{ transition: 'transform .15s', transform: collapsed ? 'rotate(-90deg)' : 'none' }} />
        <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{`${group} (${count})`}</Box>
        <Button
          size="small"
          sx={{ py: 0, minWidth: 0, fontSize: 12, textTransform: 'none', flexShrink: 0 }}
          onClick={(e) => {
            e.stopPropagation()
            onSelectAll()
          }}
        >
          {allSelected ? deselectLabel : selectLabel}
        </Button>
      </ListSubheader>
      {!collapsed && (
        <Box component="ul" sx={{ p: 0 }}>
          {children}
          {more > 0 && (
            <li>
              <Button size="small" fullWidth sx={{ textTransform: 'none', justifyContent: 'flex-start', pl: 2 }} onClick={onShowMore}>
                {moreLabel(more)}
              </Button>
            </li>
          )}
        </Box>
      )}
    </li>
  )
}

/** Content shown at the top of the popup (above the listbox), e.g. "Hiển thị X / Y máy". */
export const PopupHeaderContext = createContext<ReactNode>(null)

/** Autocomplete paper slot that prepends the PopupHeaderContext content. Defined once so the popup is not remounted on each render. */
export function PickerPaper({ children, ...props }: PaperProps) {
  const header = useContext(PopupHeaderContext)
  return (
    <Paper {...props}>
      {header}
      {children}
    </Paper>
  )
}
