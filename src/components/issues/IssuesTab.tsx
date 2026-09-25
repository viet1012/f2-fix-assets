import {
  Alert, Autocomplete, Box, Chip, FormControlLabel, InputAdornment, LinearProgress, List, ListItemButton, Stack, Switch,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlined'
import GroupsOutlined from '@mui/icons-material/GroupsOutlined'
import HideImageOutlined from '@mui/icons-material/HideImageOutlined'
import HourglassEmptyOutlined from '@mui/icons-material/HourglassEmptyOutlined'
import PersonSearchOutlined from '@mui/icons-material/PersonSearchOutlined'
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined'
import SearchRounded from '@mui/icons-material/SearchRounded'
import { useMemo, useState } from 'react'
import type { FixedAsset, Lang } from '../../types/fixedAsset'
import { issueKinds, uniq } from '../../utils/fixedAsset'
import { SectionCard } from '../common/SectionCard'
import { StatCard } from '../common/StatCard'
import { EmptyState } from '../common/States'
import { density } from '../../theme/density'

const ROW_LIMIT = 300

function IssueChip({ kind, vi }: { kind: 'not_yet' | 'no_photo'; vi: boolean }) {
  return kind === 'not_yet'
    ? <Chip size="small" color="warning" variant="outlined" icon={<HourglassEmptyOutlined />} label="Not yet" />
    : <Chip size="small" color="error" variant="outlined" icon={<HideImageOutlined />} label={vi ? 'Chưa có ảnh' : 'No photo'} />
}

export function IssuesTab({ rows, lang }: { rows: FixedAsset[]; lang: Lang }) {
  const vi = lang === 'vi'
  const [notYet, setNotYet] = useState(true)
  const [noPhoto, setNoPhoto] = useState(true)
  const [search, setSearch] = useState('')
  const [pic, setPic] = useState('')
  const all = useMemo(() => rows.filter((r) => issueKinds(r).length > 0), [rows])
  const pics = useMemo(() => uniq(all.map((r) => r.pic)), [all])
  const counts = useMemo(() => ({
    notYet: all.filter((r) => issueKinds(r).includes('not_yet')).length,
    noPhoto: all.filter((r) => issueKinds(r).includes('no_photo')).length,
  }), [all])
  const filtered = useMemo(() => all.filter((r) => {
    const issues = issueKinds(r)
    if ((!notYet || !issues.includes('not_yet')) && (!noPhoto || !issues.includes('no_photo'))) return false
    if (pic && r.pic !== pic) return false
    const q = search.trim().toLowerCase()
    if (q && !`${r.code} ${r.name}`.toLowerCase().includes(q)) return false
    return true
  }), [all, notYet, noPhoto, pic, search])
  const top = useMemo(
    () => Object.entries(filtered.reduce<Record<string, number>>((a, r) => { const key = String(r.pic); a[key] = (a[key] ?? 0) + 1; return a }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10),
    [filtered],
  )
  const topMax = top[0]?.[1] ?? 0

  return (
    <Stack spacing={density.gap}>
      <Alert severity="warning" icon={<ReportProblemOutlined />}>
        {vi ? 'Danh sách Fixed Asset có Đánh giá hình = Not yet hoặc chưa có ảnh/label xác nhận.' : 'Fixed Assets with Photo evaluation = Not yet or missing confirmation photo/label.'}
      </Alert>

      <Box sx={{ display: 'grid', gap: density.gap, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } }}>
        <StatCard icon={<ReportProblemOutlined />} tone={all.length ? 'warning' : 'success'} label={vi ? 'Tổng có vấn đề' : 'Total flagged'} value={all.length.toLocaleString()} secondary={`/ ${rows.length.toLocaleString()}`} />
        <StatCard icon={<HourglassEmptyOutlined />} tone="warning" label="Not yet" value={counts.notYet.toLocaleString()} />
        <StatCard icon={<HideImageOutlined />} tone="error" label={vi ? 'Chưa có ảnh' : 'No photo'} value={counts.noPhoto.toLocaleString()} />
        <StatCard icon={<GroupsOutlined />} label="PIC" value={pics.length.toLocaleString()} />
      </Box>

      <Box sx={{ display: 'grid', gap: density.gap, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: '300px minmax(0, 1fr)' }, alignItems: 'start' }}>
        <SectionCard icon={<PersonSearchOutlined />} title="Top PIC" description={vi ? 'Nhấn để lọc theo PIC' : 'Click to filter by PIC'} flush>
          {top.length === 0 ? (
            <EmptyState compact title={vi ? 'Không có dữ liệu' : 'No data'} />
          ) : (
            <List dense disablePadding>
              {top.map(([p, n]) => (
                <ListItemButton key={p} selected={pic === p} onClick={() => setPic(p)} sx={{ display: 'block', py: 0.75 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                    <Typography variant="body2" noWrap title={p}>{p}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{n}</Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={topMax ? (n / topMax) * 100 : 0} color="warning" sx={{ mt: 0.5, height: 4 }} />
                </ListItemButton>
              ))}
            </List>
          )}
        </SectionCard>

        <SectionCard
          flush
          title={vi ? 'Danh sách cần xử lý' : 'Assets to resolve'}
          actions={<Typography variant="caption" color="text.secondary">{Math.min(filtered.length, ROW_LIMIT)} / {filtered.length}</Typography>}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ p: 1.5, alignItems: { md: 'center' }, borderBottom: 1, borderColor: 'divider' }}>
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
              <FormControlLabel control={<Switch size="small" color="warning" checked={notYet} onChange={(e) => setNotYet(e.target.checked)} />} label={<Typography variant="body2">Not yet</Typography>} />
              <FormControlLabel control={<Switch size="small" color="error" checked={noPhoto} onChange={(e) => setNoPhoto(e.target.checked)} />} label={<Typography variant="body2">{vi ? 'Chưa có ảnh/label' : 'No photo/label'}</Typography>} />
            </Stack>
            <TextField
              fullWidth
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={vi ? 'Tìm mã / tên tài sản...' : 'Search code / asset name...'}
              slotProps={{ htmlInput: { 'aria-label': vi ? 'Tìm mã / tên tài sản' : 'Search code / asset name' }, input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> } }}
            />
            <Autocomplete
              options={pics}
              value={pic || null}
              onChange={(_, next) => setPic(next ?? '')}
              isOptionEqualToValue={(opt, val) => opt === val}
              autoHighlight
              sx={{ width: { xs: '100%', md: 240 }, flexShrink: 0 }}
              noOptionsText={vi ? 'Không có giá trị' : 'No options'}
              renderInput={(params) => <TextField {...params} label="PIC" placeholder={vi ? 'Tất cả PIC' : 'All PIC'} />}
            />
          </Stack>
          {filtered.length === 0 ? (
            <EmptyState
              icon={all.length === 0 ? <CheckCircleOutline color="success" /> : undefined}
              title={all.length === 0 ? (vi ? 'Không có tài sản cần xử lý' : 'No flagged assets') : (vi ? 'Không có kết quả phù hợp' : 'No matching assets')}
              description={all.length === 0 ? undefined : (vi ? 'Thử thay đổi điều kiện lọc.' : 'Try adjusting the issue filters.')}
            />
          ) : (
            <TableContainer sx={{ maxHeight: 620 }}>
              <Table stickyHeader size="small" sx={{ minWidth: 900 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>{vi ? 'Mã máy' : 'Code'}</TableCell>
                    <TableCell>{vi ? 'Tên tài sản' : 'Name'}</TableCell>
                    <TableCell>Group</TableCell>
                    <TableCell>Floor</TableCell>
                    <TableCell>{vi ? 'Vị trí' : 'Position'}</TableCell>
                    <TableCell>PIC</TableCell>
                    <TableCell>{vi ? 'Vấn đề' : 'Issue'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.slice(0, ROW_LIMIT).map((r) => (
                    <TableRow hover key={r.code}>
                      <TableCell sx={{ fontWeight: 700, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{r.code}</TableCell>
                      <TableCell sx={{ minWidth: 220 }}>{r.name}</TableCell>
                      <TableCell>{r.group}</TableCell>
                      <TableCell>{r.floor}</TableCell>
                      <TableCell>{r.position}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.pic}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5}>{issueKinds(r).map((k) => <IssueChip key={k} kind={k} vi={vi} />)}</Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </SectionCard>
      </Box>
    </Stack>
  )
}
