import { Box } from '@mui/material'
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined'
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import CategoryOutlined from '@mui/icons-material/CategoryOutlined'
import DomainOutlined from '@mui/icons-material/DomainOutlined'
import FactoryOutlined from '@mui/icons-material/FactoryOutlined'
import LayersOutlined from '@mui/icons-material/LayersOutlined'
import PaidOutlined from '@mui/icons-material/PaidOutlined'
import PersonSearchOutlined from '@mui/icons-material/PersonSearchOutlined'
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined'
import { memo, useMemo, type ComponentProps } from 'react'
import type { FixedAsset, Lang } from '../../types/fixedAsset'
import { ChartCard } from './ChartCard'
import { isMeaningless } from './chartData'
import { density } from '../../theme/density'

type Pairs = Array<[string, number]>
type Field = 'factory' | 'div' | 'kind' | 'group' | 'floor' | 'pic' | 'pic_approved'

/** Count + value (History Cost) per label, in first-seen order (as the legacy page did). */
function tally(rows: FixedAsset[], field: Field, skipNA = false) {
  const counts: Record<string, number> = {}
  const values: Record<string, number> = {}
  for (const r of rows) {
    const raw = r[field]
    if (skipNA && (!raw || raw === 'N/A')) continue
    const k = String(raw ?? 'N/A')
    counts[k] = (counts[k] ?? 0) + 1
    values[k] = (values[k] ?? 0) + Number(r.cost || 0)
  }
  return { counts, values }
}

/** Top N labels by count; the rest merged into one "Others" bar (count and value). */
function topNWithOthers({ counts, values }: ReturnType<typeof tally>, n: number, othersLabel: string) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const top: Pairs = sorted.slice(0, n)
  const rest = sorted.slice(n)
  const valueMap: Record<string, number> = {}
  for (const [k] of top) valueMap[k] = values[k] ?? 0
  if (rest.length) {
    top.push([othersLabel, rest.reduce((a, [, v]) => a + v, 0)])
    valueMap[othersLabel] = rest.reduce((a, [k]) => a + (values[k] ?? 0), 0)
  }
  return { pairs: top, valueMap }
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})/

function OverviewTabImpl({ rows, lang }: { rows: FixedAsset[]; lang: Lang }) {
  const vi = lang === 'vi'
  const others = vi ? 'Khác' : 'Others'

  const c = useMemo(() => {
    const fac = tally(rows, 'factory')
    const div = tally(rows, 'div')
    const kind = tally(rows, 'kind')
    const floor = tally(rows, 'floor')
    const years: Record<number, number> = {}
    for (const r of rows) {
      const m = YMD.exec(String(r.dateStart ?? ''))
      if (m) years[Number(m[1])] = (years[Number(m[1])] ?? 0) + 1
    }
    return {
      factory: { pairs: Object.entries(fac.counts), valueMap: fac.values },
      div: { pairs: Object.entries(div.counts), valueMap: div.values },
      kind: Object.entries(kind.counts),
      pic: topNWithOthers(tally(rows, 'pic', true), 10, others),
      group: topNWithOthers(tally(rows, 'group'), 12, others),
      floor: Object.entries(floor.counts),
      approved: topNWithOthers(tally(rows, 'pic_approved', true), 10, others),
      valueByKind: Object.entries(kind.values).sort((a, b) => b[1] - a[1]),
      years: Object.keys(years).map(Number).sort((a, b) => a - b).map((y): [string, number] => [String(y), years[y]]),
    }
  }, [rows, others])

  const common = {
    labels: { qty: vi ? 'Số lượng' : 'Quantity', value: vi ? 'Giá trị' : 'Value', download: vi ? 'Tải ảnh PNG' : 'Download PNG' },
    othersLabel: others,
    emptyLabel: vi ? 'Chưa có dữ liệu cho trường này' : 'No data for this field yet',
  }

  // Same order, chart types and titles as the legacy #panelOverview grid; cards without meaningful data go last.
  const cards: Array<ComponentProps<typeof ChartCard>> = [
    { ...common, icon: <FactoryOutlined />, title: vi ? 'Theo Factory (Fac)' : 'By Factory (Fac)', type: 'horizontal-bar', categorical: true, values: c.factory.pairs, valueMap: c.factory.valueMap, fileName: 'theo_factory' },
    { ...common, icon: <DomainOutlined />, title: vi ? 'Theo Div' : 'By Div', type: 'horizontal-bar', values: c.div.pairs, valueMap: c.div.valueMap, fileName: 'theo_div' },
    { ...common, icon: <CategoryOutlined />, title: vi ? 'Theo Loại tài sản' : 'By Asset type', type: 'doughnut', values: c.kind, fileName: 'theo_loai_tai_san' },
    { ...common, icon: <PersonSearchOutlined />, title: vi ? 'Theo PIC Checked' : 'By PIC Checked', type: 'horizontal-bar', values: c.pic.pairs, valueMap: c.pic.valueMap, fileName: 'theo_pic_checked' },
    { ...common, icon: <AccountTreeOutlined />, title: vi ? 'Theo Bộ phận (Group)' : 'By Department (Group)', type: 'horizontal-bar', values: c.group.pairs, valueMap: c.group.valueMap, fileName: 'theo_bo_phan' },
    { ...common, icon: <LayersOutlined />, title: vi ? 'Theo Floor' : 'By Floor', type: 'doughnut', values: c.floor, fileName: 'theo_floor' },
    { ...common, icon: <VerifiedUserOutlined />, title: vi ? 'Theo PIC Approved' : 'By PIC Approved', type: 'horizontal-bar', values: c.approved.pairs, valueMap: c.approved.valueMap, fileName: 'theo_pic_approved' },
    { ...common, icon: <PaidOutlined />, title: vi ? 'Giá trị theo Loại tài sản' : 'Value by Asset type', type: 'horizontal-bar', categorical: true, money: true, values: c.valueByKind, fileName: 'gia_tri_theo_loai' },
    { ...common, icon: <CalendarMonthOutlined />, title: vi ? 'Theo năm đưa vào sử dụng' : 'By year put into use', type: 'bar', values: c.years, fileName: 'theo_nam_su_dung' },
  ]
  const ordered = [...cards.filter((p) => !isMeaningless(p.values)), ...cards.filter((p) => isMeaningless(p.values))]

  return (
    <Box sx={{ display: 'grid', gap: density.gap, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
      {ordered.map((p) => <ChartCard key={p.fileName} {...p} />)}
    </Box>
  )
}

export const OverviewTab = memo(OverviewTabImpl)
