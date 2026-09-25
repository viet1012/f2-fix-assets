export interface FixedAsset {
  code: string
  name: string
  group: string
  floor: string | null
  position: string | null
  cost: number
  maker: string
  pic: string | null
  pic_approved: string
  status: string | null
  kind: string | null
  div: string | null
  factory: string | null
  depYears: number | null
  dateStart: string | null
  photoEval: string | null
  hasPhoto: boolean
}

export interface FixedAssetFilters {
  groups: string[]
  checked: string[]
  approved: string[]
  div: string[]
  factory: string[]
  floor: string[]
  kind: string[]
  status: string[]
}

export interface LastImport {
  id?: number
  source_name: string
  sheet_name: string
  row_count: number
  imported_at?: string
}

export interface AssetsResponse {
  tableData: FixedAsset[]
  filters: FixedAssetFilters
  lastImport: LastImport | null
}

export interface UploadResponse {
  ok: boolean
  sheetName: string
  rowCount: number
  importId: number
  sourceName: string
}

export interface DashboardFilters {
  text: string
  factory: string
  div: string
  kind: string
  group: string
  checked: string
  approved: string
  floor: string
  status: string
}

export type AppTab = 'overview' | 'table' | 'map' | 'issues' | 'forecast' | 'guide'
export type Lang = 'vi' | 'en'
