import {
  Accordion, AccordionDetails, AccordionSummary, Avatar, Box, ButtonBase, Card, Dialog, IconButton, Stack, Typography,
} from '@mui/material'
import CloseRounded from '@mui/icons-material/CloseRounded'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined'
import { useState, type ReactNode } from 'react'
import { GUIDE_DATA } from '../../data/guideData'
import type { Lang } from '../../types/fixedAsset'
import { density } from '../../theme/density'

const cats = [
  ['vehicles', 'Vehicles'], ['buildings', 'Buildings'], ['equipment_building', 'Equipment / Building'], ['copier', 'Copier'], ['laptop', 'Laptop'], ['machinery', 'Machinery'], ['tools_equipment', 'Tools / Equipment'], ['upgrade', 'Upgrade'], ['software', 'Software'],
] as const

function imageSrc(key?: string) {
  if (!key) return ''
  // Values are bundled asset URLs (src/assets/guide), usable directly as <img src>.
  return (GUIDE_DATA.images as Record<string, string>)[key] ?? ''
}

interface Lightbox { src: string; alt: string }

function Thumb({ src, alt, height, caption, onOpen }: { src: string; alt: string; height: number; caption?: string; onOpen: (l: Lightbox) => void }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <ButtonBase
        onClick={() => onOpen({ src, alt })}
        aria-label={alt}
        sx={{ display: 'block', width: '100%', borderRadius: 1.5, overflow: 'hidden', border: 1, borderColor: 'divider', cursor: 'zoom-in', '&:hover img': { transform: 'scale(1.03)' } }}
      >
        <Box component="img" src={src} alt={alt} loading="lazy" sx={{ display: 'block', width: '100%', height, objectFit: 'cover', transition: 'transform .2s' }} />
      </ButtonBase>
      {caption && <Typography variant="caption" color="text.secondary" component="div" sx={{ textAlign: 'center', mt: 0.5, fontWeight: 600, letterSpacing: '0.04em' }}>{caption}</Typography>}
    </Box>
  )
}

function Section({ step, title, description, children }: { step: number; title: string; description?: string; children: ReactNode }) {
  return (
    <Accordion defaultExpanded disableGutters variant="outlined" sx={{ borderRadius: 2, '&::before': { display: 'none' }, overflow: 'hidden' }}>
      <AccordionSummary expandIcon={<ExpandMoreRounded />} sx={{ px: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Avatar sx={{ width: 26, height: 26, fontSize: '0.8125rem', fontWeight: 700, bgcolor: 'primary.main', color: 'primary.contrastText' }}>{step}</Avatar>
          <Box>
            <Typography variant="subtitle1" component="h3">{title}</Typography>
            {description && <Typography variant="caption" color="text.secondary">{description}</Typography>}
          </Box>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 2, pb: 2, pt: 0 }}>{children}</AccordionDetails>
    </Accordion>
  )
}

export default function GuideTab({ lang }: { lang: Lang }) {
  const vi = lang === 'vi'
  const [lightbox, setLightbox] = useState<Lightbox | null>(null)

  return (
    <Stack spacing={density.gap}>
      <Card sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Box aria-hidden sx={{ width: 44, height: 44, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'action.selected', color: 'primary.main', flexShrink: 0 }}>
            <MenuBookOutlined />
          </Box>
          <Box>
            <Typography variant="h2" component="h2">{vi ? 'Hướng dẫn chụp ảnh & dán QR' : 'Photo & QR guide'}</Typography>
            <Typography variant="body2" color="text.secondary">
              {vi ? 'Dữ liệu hướng dẫn được giữ nguyên từ source HTML cũ và chuyển sang module TypeScript.' : 'Guide images are preserved from the legacy HTML and moved into a TypeScript module.'}
            </Typography>
          </Box>
        </Stack>
      </Card>

      <Section step={1} title={vi ? 'Ví dụ theo loại tài sản' : 'Examples by asset type'} description="FULL · MODEL · QR">
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {cats.map(([key, label]) => {
            const item = (GUIDE_DATA.byCat as Record<string, Record<string, string>>)[key] || {}
            return (
              <Box key={key} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.25, bgcolor: 'action.hover' }}>
                <Typography variant="subtitle2" component="h4" sx={{ mb: 1 }}>{label}</Typography>
                <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                  {['full', 'model', 'qr'].map((kind) => item[kind]
                    ? <Thumb key={kind} src={imageSrc(item[kind])} alt={`${label} – ${kind.toUpperCase()}`} height={84} caption={kind.toUpperCase()} onOpen={setLightbox} />
                    : null)}
                </Box>
              </Box>
            )
          })}
        </Box>
      </Section>

      <Section step={2} title="Gallery">
        <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          {GUIDE_DATA.gallery.map((key, i) => <Thumb key={key} src={imageSrc(key)} alt={`Gallery ${i + 1}`} height={110} onOpen={setLightbox} />)}
        </Box>
      </Section>

      <Section step={3} title="Apps">
        <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {Object.entries(GUIDE_DATA.appIcons).map(([name, key]) => (
            <ButtonBase
              key={name}
              onClick={() => setLightbox({ src: imageSrc(key), alt: name })}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.25, border: 1, borderColor: 'divider', borderRadius: 2, p: 1, pr: 2, bgcolor: 'action.hover', cursor: 'zoom-in' }}
            >
              <Box component="img" src={imageSrc(key)} alt="" sx={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 1.5 }} />
              <Typography variant="subtitle2">{name}</Typography>
            </ButtonBase>
          ))}
        </Stack>
      </Section>

      <Dialog
        open={Boolean(lightbox)}
        onClose={() => setLightbox(null)}
        maxWidth={false}
        aria-label={lightbox?.alt}
        slotProps={{ paper: { sx: { bgcolor: 'transparent', boxShadow: 'none', m: 2, overflow: 'visible' } } }}
      >
        {lightbox && (
          <Box sx={{ position: 'relative' }}>
            <IconButton
              onClick={() => setLightbox(null)}
              aria-label={vi ? 'Đóng' : 'Close'}
              sx={{ position: 'absolute', top: -14, right: -14, bgcolor: 'background.paper', boxShadow: 2, '&:hover': { bgcolor: 'background.paper' } }}
              size="small"
            >
              <CloseRounded fontSize="small" />
            </IconButton>
            <Box component="img" src={lightbox.src} alt={lightbox.alt} onClick={() => setLightbox(null)} sx={{ display: 'block', maxWidth: '90vw', maxHeight: '88vh', borderRadius: 2, cursor: 'zoom-out' }} />
          </Box>
        )}
      </Dialog>
    </Stack>
  )
}
