import { Box, Button, ButtonBase, Card, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined'
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded'
import { useState, type ReactNode } from 'react'
import {
  GUIDE_DATA, GUIDE_PARTS, GUIDE_SECTIONS, S_PATROL_URL,
  type GuideBlock, type GuidePartId, type GuideSectionId, type L10n,
} from '../../data/guideData'
import type { AppTab, Lang } from '../../types/fixedAsset'
import { density } from '../../theme/density'
import GuideLightbox, { type LightboxItem, type LightboxState } from './GuideLightbox'
import GuideSection from './GuideSection'
import RelocationGuide from './RelocationGuide'
import { requestTour } from '../common/GuidedTour'

const cats = [
  ['vehicles', 'Vehicles'], ['buildings', 'Buildings'], ['equipment_building', 'Equipment / Building'], ['copier', 'Copier'], ['laptop', 'Laptop'], ['machinery', 'Machinery'], ['tools_equipment', 'Tools / Equipment'], ['upgrade', 'Upgrade'], ['software', 'Software'],
] as const
const KINDS = ['full', 'model', 'qr'] as const

function imageSrc(key?: string) {
  if (!key) return ''
  // Values are bundled asset URLs (src/assets/guide), usable directly as <img src>.
  return (GUIDE_DATA.images as Record<string, string>)[key] ?? ''
}

// Lightbox groups: ←/→ walk through the group an image was opened from.
const catGroup = cats.map(([key, label]) => {
  const item = (GUIDE_DATA.byCat as Record<string, Partial<Record<(typeof KINDS)[number], string>>>)[key] || {}
  return { key, label, shots: KINDS.filter((k) => item[k]).map((k) => ({ kind: k, src: imageSrc(item[k]), alt: `${label} – ${k.toUpperCase()}` })) }
})
const catItems: LightboxItem[] = catGroup.flatMap((c) => c.shots)
const galleryItems: LightboxItem[] = GUIDE_DATA.gallery.map((key, i) => ({ src: imageSrc(key), alt: `Gallery ${i + 1}` }))
const S_PATROL_ICON = `${import.meta.env.BASE_URL}favicon.png`

type SectionId = GuideSectionId
const sectionDomId = (s: SectionId) => `guide-${s}`

/** Titled sub-part inside a merged section. */
function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ '& + &': { mt: 2, pt: 1.5, borderTop: 1, borderColor: 'divider' } }}>
      <Typography variant="subtitle2" component="h4" sx={{ fontWeight: 700, color: 'primary.main', mb: 1 }}>{title}</Typography>
      {children}
    </Box>
  )
}

/** Renders `**bold**` spans from the legacy guide text. */
function Rich({ text }: { text: string }) {
  return <>{text.split(/\*\*(.+?)\*\*/).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))}</>
}

function ExtraBlocks({ blocks, lang }: { blocks: GuideBlock[]; lang: Lang }) {
  const tr = (t: L10n) => (lang === 'vi' ? t.vi : t.en)
  return (
    <Stack spacing={1}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading':
            return <Typography key={i} variant="subtitle2" component="h4" sx={{ fontWeight: 700 }}>{tr(b.text)}</Typography>
          case 'text':
            return <Typography key={i} variant="body2" color="text.secondary"><Rich text={tr(b.text)} /></Typography>
          case 'mono':
            return (
              <Box key={i} sx={{ fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', px: 1.25, py: 0.75, borderRadius: 1.5, border: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
                {tr(b.text)}
              </Box>
            )
          case 'list':
            return (
              <Box key={i} component="ul" sx={{ m: 0, pl: 2.5 }}>
                {b.items.map((it, j) => <Typography key={j} component="li" variant="body2" color="text.secondary" sx={{ mb: 0.25 }}><Rich text={tr(it)} /></Typography>)}
              </Box>
            )
          case 'table':
            return (
              <TableContainer key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>{b.head.map((h, j) => <TableCell key={j} sx={{ fontWeight: 600, bgcolor: 'action.hover' }}>{tr(h)}</TableCell>)}</TableRow>
                  </TableHead>
                  <TableBody>
                    {b.rows.map((r, j) => <TableRow key={j}>{r.map((c, k) => <TableCell key={k}>{c}</TableCell>)}</TableRow>)}
                  </TableBody>
                </Table>
              </TableContainer>
            )
        }
      })}
    </Stack>
  )
}

function Thumb({ item, square, onOpen }: { item: LightboxItem; square?: boolean; onOpen: () => void }) {
  return (
    <ButtonBase
      onClick={onOpen}
      aria-label={item.alt}
      sx={{ display: 'block', width: '100%', borderRadius: 1.5, overflow: 'hidden', border: 1, borderColor: 'divider', cursor: 'zoom-in', '&:hover img': { transform: 'scale(1.04)' } }}
    >
      <Box component="img" src={item.src} alt={item.alt} loading="lazy" sx={{ display: 'block', width: '100%', aspectRatio: square ? '1 / 1' : '4 / 3', objectFit: 'cover', transition: 'transform .2s' }} />
    </ButtonBase>
  )
}

export default function GuideTab({ lang, onNavigate }: { lang: Lang; onNavigate?: (tab: AppTab) => void }) {
  const vi = lang === 'vi'
  const tr = (t: L10n) => (vi ? t.vi : t.en)
  const [lightbox, setLightbox] = useState<LightboxState | null>(null)
  // Only the first section starts expanded.
  const [open, setOpen] = useState<Record<SectionId, boolean>>(() => Object.fromEntries(GUIDE_SECTIONS.map((s, i) => [s.id, i === 0])) as Record<SectionId, boolean>)
  const toggle = (s: SectionId) => (v: boolean) => setOpen((o) => ({ ...o, [s]: v }))
  const openAt = (items: LightboxItem[], item: LightboxItem) => () => setLightbox({ items, index: Math.max(0, items.indexOf(item)) })

  const jump = (s: SectionId) => {
    setOpen((o) => ({ ...o, [s]: true }))
    document.getElementById(sectionDomId(s))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const part = (id: GuidePartId) => (
    <Part title={tr(GUIDE_PARTS[id].title)}>
      <ExtraBlocks blocks={GUIDE_PARTS[id].blocks} lang={lang} />
    </Part>
  )

  const body: Record<SectionId, ReactNode> = {
    responsibility: part('pic'),
    apps: (
      <>
        <Part title="S-Patrol">
          <Stack
            direction="row" spacing={1.5} useFlexGap
            sx={{ alignItems: 'center', flexWrap: 'wrap', maxWidth: 560, border: 1, borderColor: 'divider', borderRadius: 2, p: 1.25, bgcolor: 'action.hover' }}
          >
            <Box component="img" src={S_PATROL_ICON} alt="" sx={{ width: 40, height: 40, flexShrink: 0, objectFit: 'contain', p: 0.5, borderRadius: 1.5, bgcolor: '#fff', border: 1, borderColor: 'divider' }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" component="h4" sx={{ fontWeight: 700 }}>S-Patrol</Typography>
              <Typography variant="caption" color="text.secondary" component="div" noWrap>
                {vi ? 'Tài khoản S-Patrol dùng để đăng nhập hệ thống này.' : 'Your S-Patrol account is used to sign in to this system.'}
              </Typography>
            </Box>
            {S_PATROL_URL && (
              <Button variant="outlined" size="small" endIcon={<OpenInNewRounded />} href={S_PATROL_URL} target="_blank" rel="noopener noreferrer">
                {vi ? 'Mở S-Patrol' : 'Open S-Patrol'}
              </Button>
            )}
          </Stack>
        </Part>
      </>
    ),
    photos: (
      <>
        <Part title={vi ? 'Ví dụ theo loại tài sản' : 'Examples by asset type'}>
          <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {catGroup.map(({ key, label, shots }) => (
              <Box key={key} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1, bgcolor: 'action.hover' }}>
                <Typography variant="caption" component="h5" sx={{ display: 'block', fontWeight: 700, mb: 0.75, color: 'text.primary' }}>{label}</Typography>
                <Box sx={{ display: 'grid', gap: 0.75, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                  {shots.map((shot) => (
                    <Stack key={shot.kind} spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
                      <Thumb item={shot} square onOpen={openAt(catItems, shot)} />
                      <Chip label={shot.kind.toUpperCase()} size="small" sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.04em', '& .MuiChip-label': { px: 0.75 } }} />
                    </Stack>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        </Part>
        {part('naming')}
      </>
    ),
    qr: (
      <>
        {part('qrPosition')}
        <Part title="Gallery">
          <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {galleryItems.map((item) => <Thumb key={item.src} item={item} onOpen={openAt(galleryItems, item)} />)}
          </Box>
        </Part>
        {part('glue')}
      </>
    ),
    relocation: (
      <RelocationGuide
        lang={lang}
        onNavigate={onNavigate && (() => onNavigate('relocation'))}
        onTour={onNavigate && (() => {
          onNavigate('relocation')
          requestTour('relocation')
        })}
      />
    ),
    appendix: <ExtraBlocks blocks={GUIDE_PARTS.upload.blocks} lang={lang} />,
  }

  return (
    <Stack spacing={density.gap}>
      <Card sx={{ p: 1 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Box aria-hidden sx={{ width: 30, height: 30, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'action.selected', color: 'primary.main', flexShrink: 0 }}>
            <MenuBookOutlined />
          </Box>
          <Typography variant="h2" component="h2">{vi ? 'Hướng dẫn' : 'Guide'}</Typography>
        </Stack>
      </Card>

      <Box
        component="nav"
        aria-label={vi ? 'Mục lục' : 'Contents'}
        sx={{ position: 'sticky', top: 0, zIndex: 2, py: 0.75, px: 1, borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: 'background.paper', boxShadow: 1 }}
      >
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          {GUIDE_SECTIONS.map((s, i) => (
            <Chip key={s.id} size="small" variant="outlined" clickable onClick={() => jump(s.id)} label={`${i + 1}. ${tr(s.title)}`} sx={{ fontWeight: 600 }} />
          ))}
        </Stack>
      </Box>

      {GUIDE_SECTIONS.map((s, i) => (
        <GuideSection
          key={s.id} id={sectionDomId(s.id)} step={i + 1} title={tr(s.title)} description={tr(s.purpose)}
          expanded={open[s.id]} onToggle={toggle(s.id)}
        >
          {body[s.id]}
        </GuideSection>
      ))}

      <GuideLightbox state={lightbox} onChange={setLightbox} lang={lang} />
    </Stack>
  )
}
