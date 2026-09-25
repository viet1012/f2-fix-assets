import { alpha, Box, ButtonBase, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import FitScreenOutlined from '@mui/icons-material/FitScreenOutlined'
import RemoveRounded from '@mui/icons-material/RemoveRounded'
import { useState } from 'react'
import type { Lang } from '../../types/fixedAsset'

export interface MapZone {
  code: string
  x: number
  y: number
  count: number
}

interface Props {
  lang: Lang
  title: string
  imageData: string
  imgW: number
  imgH: number
  zones: MapZone[]
  selectedZone: string
  onSelectZone: (code: string) => void
}

const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3]
/** Base display height of the layout at 100% zoom. */
const BASE_HEIGHT = 600

export function FloorMap({ lang, title, imageData, imgW, imgH, zones, selectedZone, onSelectZone }: Props) {
  const vi = lang === 'vi'
  const [zoomIndex, setZoomIndex] = useState(0)
  const zoom = ZOOM_STEPS[zoomIndex]
  const ratio = imgW / imgH

  return (
    <Box sx={{ position: 'relative', height: '100%', minHeight: 420, display: 'flex', flexDirection: 'column' }}>
      {/* Zoom controls */}
      <Stack
        direction="row"
        sx={{ position: 'absolute', top: 12, right: 12, zIndex: 3, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1.5, boxShadow: 1 }}
      >
        <Tooltip title={vi ? 'Thu nhỏ' : 'Zoom out'}>
          <span>
            <IconButton size="small" aria-label={vi ? 'Thu nhỏ' : 'Zoom out'} disabled={zoomIndex === 0} onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}>
              <RemoveRounded fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Typography variant="caption" sx={{ alignSelf: 'center', minWidth: 40, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} aria-live="polite">
          {Math.round(zoom * 100)}%
        </Typography>
        <Tooltip title={vi ? 'Phóng to' : 'Zoom in'}>
          <span>
            <IconButton size="small" aria-label={vi ? 'Phóng to' : 'Zoom in'} disabled={zoomIndex === ZOOM_STEPS.length - 1} onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}>
              <AddRounded fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={vi ? 'Vừa khung' : 'Fit to view'}>
          <span>
            <IconButton size="small" aria-label={vi ? 'Vừa khung' : 'Fit to view'} disabled={zoomIndex === 0} onClick={() => setZoomIndex(0)}>
              <FitScreenOutlined fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {/* Scroll viewport */}
      <Box
        sx={(theme) => ({
          flex: 1,
          overflow: 'auto',
          p: 2,
          display: 'flex',
          bgcolor: theme.palette.mode === 'dark' ? alpha('#ffffff', 0.03) : '#f8fafc',
          backgroundImage: `radial-gradient(${theme.palette.divider} 1px, transparent 1px)`,
          backgroundSize: '16px 16px',
        })}
      >
        {/* Image box: marker x/y are percentages of this box, which always matches the image aspect ratio */}
        <Box
          sx={{
            position: 'relative',
            m: 'auto',
            flexShrink: 0,
            width: `calc(min(100%, ${BASE_HEIGHT * ratio}px) * ${zoom})`,
            aspectRatio: `${imgW} / ${imgH}`,
            bgcolor: '#ffffff',
            borderRadius: 1,
            boxShadow: 1,
          }}
        >
          <Box
            component="img"
            src={imageData}
            alt={title}
            draggable={false}
            sx={{ display: 'block', width: '100%', height: '100%', borderRadius: 1, userSelect: 'none' }}
          />
          {zones.map((z) => {
            const active = selectedZone === z.code
            const empty = z.count === 0
            return (
              <Tooltip key={z.code} title={`${z.code} · ${z.count.toLocaleString()} ${vi ? 'tài sản' : 'assets'}`} placement="top">
                <ButtonBase
                  onClick={() => onSelectZone(z.code)}
                  aria-label={`${z.code}: ${z.count} ${vi ? 'tài sản' : 'assets'}`}
                  aria-pressed={active}
                  sx={(theme) => ({
                    position: 'absolute',
                    left: `${z.x}%`,
                    top: `${z.y}%`,
                    transform: `translate(-50%, -50%) scale(${active ? 1.2 : 1})`,
                    minWidth: 26,
                    height: 26,
                    px: 0.5,
                    borderRadius: 13,
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: '#ffffff',
                    border: '2px solid #ffffff',
                    zIndex: active ? 2 : 1,
                    bgcolor: active ? theme.palette.error.main : empty ? alpha('#64748b', 0.7) : alpha('#2563eb', 0.92),
                    boxShadow: active ? `0 0 0 4px ${alpha(theme.palette.error.main, 0.3)}, 0 2px 6px rgba(0,0,0,.3)` : '0 1px 4px rgba(0,0,0,.3)',
                    transition: 'transform .12s, background-color .12s',
                    '&:hover': { transform: 'translate(-50%, -50%) scale(1.2)', zIndex: 3 },
                    '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
                  })}
                >
                  {z.count || '·'}
                </ButtonBase>
              </Tooltip>
            )
          })}
        </Box>
      </Box>
    </Box>
  )
}
