import { alpha, Box, ButtonBase, Card, Skeleton, Tooltip, Typography } from '@mui/material'
import type { Theme } from '@mui/material'
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import FactoryOutlined from '@mui/icons-material/FactoryOutlined'
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined'
import PaidOutlined from '@mui/icons-material/PaidOutlined'
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined'
import { memo, useMemo, type ReactElement, type ReactNode } from 'react'
import type { FixedAsset, Lang } from '../../types/fixedAsset'
import { formatMoney } from '../../utils/fixedAsset'

interface Props {
  rows: FixedAsset[]
  totalRows: number
  /** Rows flagged by issueKinds (same count as the FI Issues tab "Total flagged"). */
  flaggedCount: number
  lang: Lang
  loading?: boolean
  /** When set, the "Need attention" metric is a button (e.g. opens the FI Issues tab). */
  onOpenIssues?: () => void
}

type Tone = 'primary' | 'warning' | 'success' | 'neutral'

const toneColor = (theme: Theme, tone: Tone) => (tone === 'neutral' ? theme.palette.text.secondary : theme.palette[tone].main)

interface MetricProps {
  icon: ReactElement
  label: string
  value: ReactNode
  /** Small text after the value, on the same line. */
  hint?: string
  tooltip?: string
  tone?: Tone
  /** Colours the value with the tone (e.g. warning count). */
  toneValue?: boolean
  loading: boolean
  onClick?: () => void
}

/** One metric cell (~44px): tinted 28px icon, 10px overline label, 16px tabular value (+ optional hint). */
function Metric({ icon, label, value, hint, tooltip, tone = 'neutral', toneValue = false, loading, onClick }: MetricProps) {
  const body = (
    <>
      <Box
        aria-hidden
        sx={(theme) => {
          const c = toneColor(theme, tone)
          return { width: 28, height: 28, flexShrink: 0, borderRadius: '8px', display: 'grid', placeItems: 'center', color: c, bgcolor: alpha(c, theme.palette.mode === 'dark' ? 0.18 : 0.1), '& svg': { fontSize: 16 } }
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
        <Typography component="div" noWrap sx={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary', lineHeight: 1.3 }}>
          {label}
        </Typography>
        {loading ? (
          <Skeleton variant="text" width="60%" sx={{ fontSize: 16 }} />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, minWidth: 0, whiteSpace: 'nowrap' }}>
            <Typography
              component="span"
              data-testid="metric-value"
              sx={(theme) => ({ fontSize: 16, fontWeight: 700, lineHeight: 1.25, fontVariantNumeric: 'tabular-nums', color: toneValue ? toneColor(theme, tone) : 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis' })}
            >
              {value}
            </Typography>
            {hint && (
              <Typography component="span" data-testid="metric-hint" sx={{ fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                {hint}
              </Typography>
            )}
          </Box>
        )}
      </Box>
      {onClick && <ChevronRightRounded aria-hidden fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} />}
    </>
  )
  const cellSx = (theme: Theme) => ({
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    gap: 1.25,
    minWidth: 0,
    px: 1.5,
    py: '6px',
    borderRadius: '8px',
    // Vertical rule between metrics on lg only (one row of 5).
    [theme.breakpoints.up('lg')]: {
      '&:not(:first-of-type)::before': { content: '""', position: 'absolute', left: 0, top: 8, bottom: 8, width: '1px', bgcolor: 'divider' },
    },
  })
  const cell = onClick ? (
    <ButtonBase
      onClick={onClick}
      sx={(theme) => ({
        ...cellSx(theme),
        justifyContent: 'flex-start',
        width: '100%',
        transition: 'background-color 160ms ease',
        '&:hover': { bgcolor: 'action.hover' },
        '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: -2 },
      })}
    >
      {body}
    </ButtonBase>
  ) : (
    <Box sx={cellSx}>{body}</Box>
  )
  // describeChild: the tooltip describes the metric, it does not replace its name.
  return tooltip ? <Tooltip title={tooltip} describeChild>{cell}</Tooltip> : cell
}

function SummaryCardsImpl({ rows, totalRows, flaggedCount, lang, loading = false, onOpenIssues }: Props) {
  const vi = lang === 'vi'
  const stats = useMemo(() => ({
    totalValue: rows.reduce((s, r) => s + Number(r.cost || 0), 0),
    factories: new Set(rows.map((r) => r.factory).filter(Boolean)).size,
    groups: new Set(rows.map((r) => r.group).filter(Boolean)).size,
  }), [rows])
  const isFiltered = rows.length !== totalRows

  return (
    <Card
      component="section"
      variant="outlined"
      aria-label={vi ? 'Chỉ số tổng quan' : 'Key metrics'}
      sx={{
        px: 0.75,
        py: '2px',
        borderRadius: '12px',
        display: 'grid',
        gap: 0.25,
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' },
      }}
    >
      <Metric
        loading={loading}
        icon={<Inventory2Outlined />}
        tone="primary"
        label={vi ? 'Tổng tài sản' : 'Total assets'}
        value={rows.length.toLocaleString()}
        hint={isFiltered ? `/ ${totalRows.toLocaleString()}` : undefined}
        tooltip={isFiltered ? `${vi ? 'Đã lọc từ' : 'Filtered from'} ${totalRows.toLocaleString()} ${vi ? 'tài sản' : 'assets'}` : undefined}
      />
      <Metric loading={loading} icon={<PaidOutlined />} label={vi ? 'Tổng giá trị' : 'Total value'} value={formatMoney(stats.totalValue)} tooltip="History Cost" />
      <Metric loading={loading} icon={<FactoryOutlined />} label="Factory" value={stats.factories.toLocaleString()} />
      <Metric loading={loading} icon={<AccountTreeOutlined />} label={vi ? 'Bộ phận' : 'Groups'} value={stats.groups.toLocaleString()} />
      <Metric
        loading={loading}
        icon={<ReportProblemOutlined />}
        tone={flaggedCount > 0 ? 'warning' : 'success'}
        toneValue={flaggedCount > 0}
        label={vi ? 'Cần xử lý (FI)' : 'Need attention (FI)'}
        value={flaggedCount.toLocaleString()}
        tooltip={vi ? 'Not yet / chưa có ảnh' : 'Not yet / no photo'}
        onClick={onOpenIssues}
      />
    </Card>
  )
}

export const SummaryCards = memo(SummaryCardsImpl)
