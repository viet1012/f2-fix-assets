import { Box } from '@mui/material'
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined'
import FactoryOutlined from '@mui/icons-material/FactoryOutlined'
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined'
import PaidOutlined from '@mui/icons-material/PaidOutlined'
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined'
import { memo, useMemo } from 'react'
import type { FixedAsset, Lang } from '../../types/fixedAsset'
import { formatMoney } from '../../utils/fixedAsset'
import { StatCard } from '../common/StatCard'
import { density } from '../../theme/density'

interface Props {
  rows: FixedAsset[]
  totalRows: number
  /** Rows flagged by issueKinds (same count as the FI Issues tab "Total flagged"). */
  flaggedCount: number
  lang: Lang
  loading?: boolean
}

function SummaryCardsImpl({ rows, totalRows, flaggedCount, lang, loading = false }: Props) {
  const vi = lang === 'vi'
  const stats = useMemo(() => ({
    totalValue: rows.reduce((s, r) => s + Number(r.cost || 0), 0),
    factories: new Set(rows.map((r) => r.factory).filter(Boolean)).size,
    groups: new Set(rows.map((r) => r.group).filter(Boolean)).size,
  }), [rows])
  const isFiltered = rows.length !== totalRows

  return (
    <Box
      component="section"
      aria-label={vi ? 'Chỉ số tổng quan' : 'Key metrics'}
      sx={{ display: 'grid', gap: density.gap, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' } }}
    >
      <StatCard
        loading={loading}
        icon={<Inventory2Outlined />}
        tone="primary"
        label={vi ? 'Tổng tài sản' : 'Total assets'}
        value={rows.length.toLocaleString()}
        secondary={isFiltered ? `${vi ? 'Đã lọc từ' : 'Filtered from'} ${totalRows.toLocaleString()} FI` : 'FI'}
      />
      <StatCard loading={loading} icon={<PaidOutlined />} label={vi ? 'Tổng giá trị' : 'Total value'} value={formatMoney(stats.totalValue)} secondary="History Cost" />
      <StatCard loading={loading} icon={<FactoryOutlined />} label="Factory" value={stats.factories} secondary="Fac" />
      <StatCard loading={loading} icon={<AccountTreeOutlined />} label={vi ? 'Bộ phận' : 'Groups'} value={stats.groups} secondary="Group" />
      <StatCard
        loading={loading}
        icon={<ReportProblemOutlined />}
        tone={flaggedCount > 0 ? 'warning' : 'success'}
        label={vi ? 'Cần xử lý (FI)' : 'Need attention (FI)'}
        value={flaggedCount.toLocaleString()}
        secondary={vi ? 'Not yet / chưa có ảnh' : 'Not yet / no photo'}
      />
    </Box>
  )
}

export const SummaryCards = memo(SummaryCardsImpl)
