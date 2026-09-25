# F2 Fixed Asset FE - React + TypeScript

Frontend migrated from the legacy single-file `public/index.html` to React + TypeScript + Vite.

## Stack

- React
- TypeScript
- Vite
- MUI (Material UI) + Emotion — theme in `src/theme/`
- Chart.js + react-chartjs-2
- Native Fetch API

## API compatibility

The frontend intentionally keeps the current Node API contract so it can run immediately against the existing backend and later be pointed to Spring Boot without UI rewrites:

- `GET /api/assets`
- `POST /api/upload`
- `POST /api/upload-from-url`

Set `VITE_API_BASE_URL` when FE and BE are hosted on different origins. During local development, Vite proxies `/api` to `http://localhost:4011`.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Main structure

```text
src/
  api/fixedAssetApi.ts        # all fetch calls (unchanged contract)
  components/
    common/                   # SectionCard, StatCard, Empty/Loading/Error states
    charts/chartTheme.ts      # Chart.js registration + theme-aware colors
    dashboard/                # Header, UploadBar (import panel), SummaryCards, DashboardTabs
    filters/FilterBar.tsx
    overview/ map/ issues/ table/ forecast/ guide/
  data/legacyData.ts          # floor-map + guide images (base64), zone coordinates
  hooks/                      # useFixedAssets, useAssetFilters, useThemeMode, useLanguage
  layout/AppLayout.tsx        # ThemeProvider + page shell
  theme/                      # appTheme.ts, palette.ts (light/dark)
  types/fixedAsset.ts
  utils/fixedAsset.ts         # filtering, aggregation, issue rules
  App.tsx
  main.tsx
```

The Map and Guide tabs are lazy-loaded so the large image data is only downloaded when those tabs are opened.

`legacyData.ts` contains the original embedded floor-map and guide image data so those screens are not discarded during the React migration.
"# f2-fix-assets" 
