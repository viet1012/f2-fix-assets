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

The browser always calls `/api` on the page's own origin: login uses a session cookie, which is only sent same-origin. During local development, Vite proxies `/api` to `VITE_PROXY_TARGET` (default `http://localhost:8080`). `VITE_API_BASE_URL` is ignored in dev and should stay empty for builds (a value on another origin logs "API khác origin: cookie đăng nhập sẽ không hoạt động" and login will not work).

## Run

```bash
npm install
npm run dev
```

### Chạy dev với BE trên server

Không đặt `VITE_API_BASE_URL`; chỉ đổi đích của proxy Vite, trong `.env.local` (không commit):

```bash
VITE_PROXY_TARGET=http://192.168.122.16:9097
```

Khởi động lại `npm run dev`. Trình duyệt vẫn gọi `http://localhost:5173/api/...`; Vite chuyển tiếp sang server nên không có CORS và cookie phiên vẫn được gửi.

## Build

```bash
npm run build
```

### Deploy: FE và BE cùng origin (nginx `/api` → BE)

Build với `VITE_API_BASE_URL` để trống, phục vụ `dist/` và chuyển `/api` sang BE trên cùng host:

```nginx
server {
  listen 80;
  root /var/www/f2-fixed-asset/dist;

  location /api/ {
    proxy_pass http://127.0.0.1:9097;   # BE
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri /index.html;
  }
}
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
