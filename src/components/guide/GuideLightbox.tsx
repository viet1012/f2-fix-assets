import { Box, Dialog, IconButton, Typography } from '@mui/material'
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import type { KeyboardEvent } from 'react'
import type { Lang } from '../../types/fixedAsset'

export interface LightboxItem { src: string; alt: string }
export interface LightboxState { items: LightboxItem[]; index: number }

const navSx = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', bgcolor: 'background.paper', boxShadow: 2, '&:hover': { bgcolor: 'background.paper' } } as const

/** Full-size image viewer: Esc closes (Dialog), ←/→ step through the group the image was opened from. */
export default function GuideLightbox({ state, onChange, lang }: { state: LightboxState | null; onChange: (s: LightboxState | null) => void; lang: Lang }) {
  const vi = lang === 'vi'
  const count = state?.items.length ?? 0
  const item = state ? state.items[state.index] : undefined
  const go = (d: number) => state && count > 1 && onChange({ ...state, index: (state.index + d + count) % count })
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
  }

  return (
    <Dialog
      open={Boolean(item)}
      onClose={() => onChange(null)}
      onKeyDown={onKeyDown}
      maxWidth={false}
      aria-label={item?.alt}
      slotProps={{ paper: { sx: { bgcolor: 'transparent', boxShadow: 'none', m: 2, overflow: 'visible' } } }}
    >
      {item && (
        <Box sx={{ position: 'relative' }}>
          <IconButton onClick={() => onChange(null)} aria-label={vi ? 'Đóng' : 'Close'} size="small" sx={{ ...navSx, top: -14, right: -14, transform: 'none' }}>
            <CloseRounded fontSize="small" />
          </IconButton>
          {count > 1 && (
            <>
              <IconButton onClick={() => go(-1)} aria-label={vi ? 'Ảnh trước' : 'Previous image'} size="small" sx={{ ...navSx, left: 8 }}>
                <ChevronLeftRounded />
              </IconButton>
              <IconButton onClick={() => go(1)} aria-label={vi ? 'Ảnh sau' : 'Next image'} size="small" sx={{ ...navSx, right: 8 }}>
                <ChevronRightRounded />
              </IconButton>
            </>
          )}
          <Box component="img" src={item.src} alt={item.alt} sx={{ display: 'block', maxWidth: '90vw', maxHeight: '84vh', borderRadius: 2 }} />
          <Typography variant="caption" component="div" sx={{ mt: 1, textAlign: 'center', color: 'common.white', fontWeight: 600, textShadow: '0 1px 2px rgba(0,0,0,.6)' }}>
            {item.alt}{count > 1 && ` · ${state!.index + 1}/${count}`}
          </Typography>
        </Box>
      )}
    </Dialog>
  )
}
