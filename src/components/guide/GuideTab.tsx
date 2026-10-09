import { Box, Button, ButtonBase, Card, Chip, Stack, Typography } from '@mui/material'
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined'
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded'
import { useState } from 'react'
import { GUIDE_DATA, S_PATROL_URL } from '../../data/guideData'
import type { AppTab, Lang } from '../../types/fixedAsset'
import { density } from '../../theme/density'
import GuideLightbox, { type LightboxItem, type LightboxState } from './GuideLightbox'
import GuideSection from './GuideSection'
import RelocationGuide from './RelocationGuide'

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

const SECTIONS = ['relocation', 'examples', 'gallery', 'apps'] as const
type SectionId = (typeof SECTIONS)[number]
const sectionDomId = (s: SectionId) => `guide-${s}`

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
  const [lightbox, setLightbox] = useState<LightboxState | null>(null)
  const [open, setOpen] = useState<Record<SectionId, boolean>>({ relocation: true, examples: true, gallery: true, apps: true })
  const toggle = (s: SectionId) => (v: boolean) => setOpen((o) => ({ ...o, [s]: v }))
  const openAt = (items: LightboxItem[], item: LightboxItem) => () => setLightbox({ items, index: Math.max(0, items.indexOf(item)) })

  const titles: Record<SectionId, string> = {
    relocation: vi ? 'Hướng dẫn di dời máy' : 'Machine relocation guide',
    examples: vi ? 'Ví dụ theo loại tài sản' : 'Examples by asset type',
    gallery: 'Gallery',
    apps: 'Apps',
  }
  const tocLabels: Record<SectionId, string> = { ...titles, relocation: vi ? 'Di dời máy' : 'Machine relocation' }

  const jump = (s: SectionId) => {
    setOpen((o) => ({ ...o, [s]: true }))
    document.getElementById(sectionDomId(s))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
          {SECTIONS.map((s, i) => (
            <Chip key={s} size="small" variant="outlined" clickable onClick={() => jump(s)} label={`${i + 1}. ${tocLabels[s]}`} sx={{ fontWeight: 600 }} />
          ))}
        </Stack>
      </Box>

      <GuideSection
        id={sectionDomId('relocation')} step={1} title={titles.relocation}
        description={vi ? 'Chọn máy → chọn vị trí đích → xem Trước/Sau → gửi yêu cầu' : 'Select machines → choose destination → review Before/After → submit'}
        expanded={open.relocation} onToggle={toggle('relocation')}
      >
        <RelocationGuide lang={lang} onNavigate={onNavigate && (() => onNavigate('relocation'))} />
      </GuideSection>

      <GuideSection id={sectionDomId('examples')} step={2} title={titles.examples} description="FULL · MODEL · QR" expanded={open.examples} onToggle={toggle('examples')}>
        <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {catGroup.map(({ key, label, shots }) => (
            <Box key={key} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1, bgcolor: 'action.hover' }}>
              <Typography variant="caption" component="h4" sx={{ display: 'block', fontWeight: 700, mb: 0.75, color: 'text.primary' }}>{label}</Typography>
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
      </GuideSection>

      <GuideSection id={sectionDomId('gallery')} step={3} title={titles.gallery} expanded={open.gallery} onToggle={toggle('gallery')}>
        <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          {galleryItems.map((item) => <Thumb key={item.src} item={item} onOpen={openAt(galleryItems, item)} />)}
        </Box>
      </GuideSection>

      <GuideSection id={sectionDomId('apps')} step={4} title={titles.apps} expanded={open.apps} onToggle={toggle('apps')}>
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
      </GuideSection>

      <GuideLightbox state={lightbox} onChange={setLightbox} lang={lang} />
    </Stack>
  )
}
