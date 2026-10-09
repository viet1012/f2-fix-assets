import { alpha, Box, Button, Stack, Typography, useTheme } from '@mui/material'
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded'
import HelpOutline from '@mui/icons-material/HelpOutlineOutlined'
import EastRounded from '@mui/icons-material/EastRounded'
import ViewInArRounded from '@mui/icons-material/ViewInArRounded'
import type { ReactNode } from 'react'
import type { Lang } from '../../types/fixedAsset'
import { tokens } from '../../theme/palette'
import { StepNum } from './GuideSection'

// Solid state colours carry white text, so (like RelocationTab) they stay the same in both modes;
// soft fills / text use the current mode's tokens.
const SOLID = tokens.light

type Tone = 'from' | 'to' | 'cross' | 'neutral'

function useTone() {
  const theme = useTheme()
  const t = tokens[theme.palette.mode]
  const solid = { from: SOLID.relocFrom, to: SOLID.relocTo, cross: SOLID.relocCross, neutral: t.textMuted }
  const ink = { from: t.relocFrom, to: t.relocTo, cross: t.relocCross, neutral: t.textSecondary }
  return { solid, ink }
}

/** Small pill, the demo's `.chip` / `.badge`. */
function Pill({ tone = 'neutral', solid, dashed, children }: { tone?: Tone; solid?: boolean; dashed?: boolean; children: ReactNode }) {
  const c = useTone()
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: 10, whiteSpace: 'nowrap',
        fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.5,
        ...(solid
          ? { bgcolor: c.solid[tone], color: '#fff' }
          : { bgcolor: dashed ? 'transparent' : alpha(c.solid[tone], 0.16), color: c.ink[tone], border: dashed ? `1.5px dashed ${c.ink[tone]}` : '1.5px solid transparent' }),
      }}
    >
      {children}
    </Box>
  )
}

/** Fake form field: label + value box. */
function Field({ label, children, grow }: { label: string; children: ReactNode; grow?: boolean }) {
  return (
    <Box sx={{ minWidth: 0, flex: grow ? 1 : undefined }}>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.3, mb: 0.25 }}>{label}</Typography>
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper', px: 1, py: 0.5, minHeight: 30, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', fontSize: '0.8125rem' }}>
        {children}
      </Box>
    </Box>
  )
}

/** Tiny floor plan: a row of zones, one of which may be marked from / old / to. */
function MiniPlan({ title, marks, border }: { title: string; marks: Record<number, 'from' | 'old' | 'to'>; border?: Tone }) {
  const c = useTone()
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ fontWeight: 600, mb: 0.25 }}>{title}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5, p: 0.5, borderRadius: 1.5, bgcolor: 'background.paper', border: border ? `2px solid ${c.solid[border]}` : 1, borderColor: border ? undefined : 'divider' }}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const m = marks[i]
          const color = m === 'to' ? c.solid.to : m ? c.solid.from : undefined
          return (
            <Box
              key={i}
              sx={{
                height: 18, borderRadius: 0.75,
                bgcolor: m === 'from' || m === 'to' ? alpha(color!, 0.55) : 'action.hover',
                border: m ? `2px ${m === 'old' ? 'dashed' : 'solid'} ${color}` : 1,
                borderColor: m ? undefined : 'divider',
              }}
            />
          )
        })}
      </Box>
    </Box>
  )
}

function Illustration({ children }: { children: ReactNode }) {
  return (
    <Box aria-hidden sx={{ mt: 'auto', p: 1.25, borderRadius: 1.5, bgcolor: 'action.hover', border: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 1 }}>
      {children}
    </Box>
  )
}

const TEXT = {
  vi: {
    steps: [
      {
        title: 'Chọn máy',
        bullets: [
          'Gõ hoặc dán mã máy (nhiều mã cách nhau bằng dấu phẩy).',
          'Lọc theo toà để thu hẹp danh sách.',
          'Chọn cả zone để thêm toàn bộ máy trong zone đó.',
          'Hoặc click zone trên sơ đồ Trước.',
        ],
      },
      {
        title: 'Chọn vị trí đích',
        bullets: [
          'Chọn lần lượt Toà → Tầng/Khu → Zone.',
          'Hoặc click zone trên sơ đồ Sau.',
          'Badge cho biết kiểu di dời: Cùng tầng, Đổi tầng hoặc Đổi toà.',
        ],
      },
      {
        title: 'Xem Trước / Sau',
        bullets: [
          'Amber: vị trí hiện tại; viền đứt: vị trí cũ sau khi chuyển.',
          'Xanh lá: vị trí mới.',
          'Tím: chuyển từ/sang toà hoặc tầng khác.',
          'Bấm "Xem 3D" để xem mô hình 3D.',
        ],
      },
      {
        title: 'Nhập thông tin và gửi',
        bullets: [
          'Nhập ngày dự kiến, ngày hoàn thành và lý do di dời.',
          'Sau khi gửi, hệ thống tạo mã yêu cầu (vd. R0001).',
          'Bản vẽ PNG và file Excel được lưu kèm yêu cầu.',
        ],
      },
    ],
    machine: 'Mã máy', building: 'Toà', floor: 'Tầng/Khu', zone: 'Zone', wholeZone: 'Cả zone', before: 'Trước', after: 'Sau',
    same: 'Cùng tầng', floorChange: 'Đổi tầng', buildingChange: 'Đổi toà',
    current: 'Hiện tại', old: 'Vị trí cũ', next: 'Vị trí mới', view3d: 'Xem 3D',
    start: 'Ngày dự kiến', end: 'Ngày hoàn thành', reason: 'Lý do', reasonValue: 'Gom máy mài về một line',
    saved: 'Đã lưu', go: 'Đi tới Di dời máy', tour: 'Xem hướng dẫn tương tác',
  },
  en: {
    steps: [
      {
        title: 'Select machines',
        bullets: [
          'Type or paste machine codes (separate multiple codes with commas).',
          'Filter by building to narrow the list.',
          'Pick a whole zone to add every machine in it.',
          'Or click a zone on the Before layout.',
        ],
      },
      {
        title: 'Select the destination',
        bullets: [
          'Choose Building → Floor/Area → Zone.',
          'Or click a zone on the After layout.',
          'The badge shows the move type: Same floor, Floor change or Building change.',
        ],
      },
      {
        title: 'Review Before / After',
        bullets: [
          'Amber: current location; dashed outline: old location after the move.',
          'Green: new location.',
          'Purple: moving from/to another building or floor.',
          'Press "View 3D" for the 3D model.',
        ],
      },
      {
        title: 'Enter details and submit',
        bullets: [
          'Enter the planned move date, completion date and reason.',
          'After submitting, the system assigns a request ID (e.g. R0001).',
          'A PNG drawing and an Excel file are saved with the request.',
        ],
      },
    ],
    machine: 'Machine code', building: 'Building', floor: 'Floor/Area', zone: 'Zone', wholeZone: 'Whole zone', before: 'Before', after: 'After',
    same: 'Same floor', floorChange: 'Floor change', buildingChange: 'Building change',
    current: 'Current', old: 'Old location', next: 'New location', view3d: 'View 3D',
    start: 'Planned date', end: 'Completion date', reason: 'Reason', reasonValue: 'Group grinders into one line',
    saved: 'Saved', go: 'Go to Machine relocation', tour: 'Start the interactive tour',
  },
} as const

const STEP_TONE: Tone[] = ['from', 'to', 'cross', 'neutral']

/** onTour: opens the relocation tab and starts its interactive tour. */
export default function RelocationGuide({ lang, onNavigate, onTour }: { lang: Lang; onNavigate?: () => void; onTour?: () => void }) {
  const tx = TEXT[lang]
  const c = useTone()
  const theme = useTheme()

  const illustrations: ReactNode[] = [
    <Illustration key="1">
      <Field label={tx.machine}>
        <Pill tone="from">A-1039</Pill><Pill tone="from">A-1040</Pill>
        <Typography component="span" variant="caption" color="text.disabled">A-10…</Typography>
      </Field>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <Pill>{tx.building}: F2</Pill>
        <Pill tone="from" solid>{tx.wholeZone} B3</Pill>
      </Stack>
      <MiniPlan title={tx.before} marks={{ 2: 'from' }} />
    </Illustration>,

    <Illustration key="2">
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'flex-end' }}>
        <Field label={tx.building} grow>F2</Field>
        <EastRounded fontSize="small" sx={{ color: 'text.disabled', mb: 0.75 }} />
        <Field label={tx.floor} grow>3F</Field>
        <EastRounded fontSize="small" sx={{ color: 'text.disabled', mb: 0.75 }} />
        <Field label={tx.zone} grow><Pill tone="to">C1</Pill></Field>
      </Stack>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Pill tone="to">{tx.same}</Pill>
        <Pill tone="cross" solid>{tx.floorChange}</Pill>
        <Pill tone="cross" solid>{tx.buildingChange}</Pill>
      </Stack>
      <MiniPlan title={tx.after} marks={{ 5: 'to' }} />
    </Illustration>,

    <Illustration key="3">
      <Stack direction="row" spacing={1}>
        <MiniPlan title={tx.before} marks={{ 1: 'from' }} />
        <MiniPlan title={tx.after} marks={{ 1: 'old', 6: 'to' }} />
      </Stack>
      <MiniPlan title={`${tx.after} · ${tx.buildingChange}`} marks={{ 3: 'to' }} border="cross" />
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <Pill tone="from" solid>{tx.current}</Pill>
        <Pill tone="from" dashed>{tx.old}</Pill>
        <Pill tone="to" solid>{tx.next}</Pill>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: 1.5, border: 1, borderColor: 'primary.main', color: 'primary.main', fontSize: '0.75rem', fontWeight: 600 }}>
          <ViewInArRounded sx={{ fontSize: 14 }} />{tx.view3d}
        </Box>
      </Stack>
    </Illustration>,

    <Illustration key="4">
      <Stack direction="row" spacing={0.75}>
        <Field label={tx.start} grow>2026-10-20</Field>
        <Field label={tx.end} grow>2026-10-25</Field>
      </Stack>
      <Field label={tx.reason}><Typography component="span" variant="caption" color="text.secondary" noWrap>{tx.reasonValue}</Typography></Field>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <Box component="span" sx={{ px: 1.25, py: 0.25, borderRadius: 1.5, bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: '0.75rem', fontWeight: 700 }}>R0001</Box>
        <Typography component="span" variant="caption" color="text.secondary">{tx.saved}:</Typography>
        <Pill>PNG</Pill>
        <Pill tone="to">Excel</Pill>
      </Stack>
    </Illustration>,
  ]

  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' } }}>
        {tx.steps.map((s, i) => {
          const tone = STEP_TONE[i]
          const color = tone === 'neutral' ? theme.palette.primary.main : c.solid[tone]
          return (
            <Box
              key={s.title}
              component="section"
              aria-labelledby={`reloc-guide-step-${i + 1}`}
              sx={{ border: 1, borderColor: 'divider', borderTop: `4px solid ${color}`, borderRadius: 2, p: 1.5, bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <StepNum n={i + 1} color={color} size={24} />
                <Typography id={`reloc-guide-step-${i + 1}`} variant="subtitle2" component="h4" sx={{ fontWeight: 700 }}>{s.title}</Typography>
              </Stack>
              <Box component="ul" sx={{ m: 0, pl: 2.25, color: 'text.secondary', '& li': { fontSize: '0.8125rem', lineHeight: 1.5, mb: 0.25 } }}>
                {s.bullets.map((b) => <li key={b}>{b}</li>)}
              </Box>
              {illustrations[i]}
            </Box>
          )
        })}
      </Box>
      {(onNavigate || onTour) && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {onNavigate && <Button variant="contained" endIcon={<ArrowForwardRounded />} onClick={onNavigate}>{tx.go}</Button>}
          {onTour && <Button variant="outlined" startIcon={<HelpOutline />} onClick={onTour} data-testid="guide-reloc-tour">{tx.tour}</Button>}
        </Stack>
      )}
    </Stack>
  )
}
