import { Accordion, AccordionDetails, AccordionSummary, Box, Stack, Typography } from '@mui/material'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import type { ReactNode } from 'react'

/** Round step number, as in the demo's "① Select machines" headings. */
export function StepNum({ n, color, size = 26 }: { n: number; color?: string; size?: number }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: size, height: size, flexShrink: 0, borderRadius: '50%', display: 'inline-grid', placeItems: 'center',
        fontSize: size >= 26 ? '0.8125rem' : '0.75rem', fontWeight: 700,
        bgcolor: color ?? 'primary.main', color: color ? '#fff' : 'primary.contrastText',
      }}
    >
      {n}
    </Box>
  )
}

interface Props {
  id: string
  step: number
  title: string
  description?: string
  expanded: boolean
  onToggle: (open: boolean) => void
  children: ReactNode
}

/** One collapsible guide card: numbered title + short subtitle, coloured top edge like the demo's step cards. */
export default function GuideSection({ id, step, title, description, expanded, onToggle, children }: Props) {
  return (
    <Accordion
      id={id}
      expanded={expanded}
      onChange={(_, open) => onToggle(open)}
      disableGutters
      variant="outlined"
      sx={{ borderRadius: 2, borderTop: 4, borderTopColor: 'primary.main', overflow: 'hidden', scrollMarginTop: 64, '&::before': { display: 'none' } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreRounded />} sx={{ px: 2, minHeight: 52 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
          <StepNum n={step} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, lineHeight: 1.3 }}>{title}</Typography>
            {description && <Typography variant="caption" color="text.secondary" component="div">{description}</Typography>}
          </Box>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 2, pb: 2, pt: 0.5 }}>{children}</AccordionDetails>
    </Accordion>
  )
}
