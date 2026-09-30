# Audit: tính năng "Machine Relocation Request"

> Ngày: 2026-09-30 · Phạm vi: chỉ đọc code, **không sửa code**.
> Nguồn: `docs/Demo___Machine_Relocation_Request.html` (demo), repo FE này, `../f2-fixed-asset-be-spring` (BE Spring Boot + SQL Server), `../f2-fixed-asset-controlling-map-sql` (BE Node cũ + dump MySQL `fixed_asset_db.sql`).
>
> **Lưu ý độ tin cậy dữ liệu:** các con số về giá trị factory/div/floor/position lấy từ dump MySQL `fixed_asset_db.sql` (bảng `assets`, 2 474 dòng, import ngày 2026-09-22). Tôi **không truy cập được DB thật** (`F2Database` trên SQL Server) và BE local không chạy (`localhost:4011` từ chối kết nối), nên số liệu thật có thể lệch. Cần chạy lại các truy vấn ở Phụ lục B trên DB thật trước khi build.

---

## 0. Tóm tắt

| Vấn đề | Kết luận |
|---|---|
| Zone trong `mapData` | **Điểm** (marker %), không phải hình chữ nhật. Chỉ **khu lớn** (A1…A43) có polygon trong `areas`. **Sub-zone (A1-1, A17-3…) không có hình** → chưa đủ để click vùng như demo. |
| Tọa độ của demo (`GEO`) | Hình chữ nhật pixel cho sub-zone của 3 layout (Press, Guide, 2F). Ảnh nền **cùng bản vẽ, cùng kích thước** với ảnh trong repo → quy đổi sang % được ngay. Warehouse và Mold **không có** trong demo. |
| `Fac_A` / `Fac_B` của demo | **Không phải giá trị DB.** Cả 616 máy của demo trong DB đều là `factory = "Factory 2"`, `div = "KVH"`. "Factory A/B" là **tên toà nhà trên bản vẽ** (Press = Factory A, Guide = Factory B). Badge "Factory change" của demo sẽ gây hiểu nhầm. |
| `position` | Là `CONCAT_WS(' ', PositionA, PositionAA, PositionAAA)`, thực tế luôn có dạng **2 token cha-con** (`A2 A2-3`), chứ không phải nhiều vị trí. Zone hiện tại = token cuối. Có vài dòng dị dạng. |
| Backend | **Chưa có API/bảng nào** cho yêu cầu di dời, và **chưa có xác thực người dùng**. Contract đề xuất ở mục 5. |
| Tái sử dụng | Tái sử dụng được: ảnh map, polygon khu lớn, khung zoom/xoay của `FloorMap`, glass theme, density, `uniq`, `formatMoney`. Phải viết mới: dữ liệu hình sub-zone, lớp overlay From/To, luồng chọn máy, form, bảng yêu cầu, API. |

---

## 1. Cấu trúc `FLOORS` trong `src/data/mapData.ts`

### 1.1 Hình dạng dữ liệu

```ts
FLOORS = [ { id, title, zones, imgW, imgH, imageData, areas, rotationDeg? }, ... ] as const
```

| Trường | Nội dung | Hệ toạ độ |
|---|---|---|
| `id` | `floor1` … `floor5`: **là id layout, không phải tầng** (floor1–4 đều là tầng 1F). | — |
| `title` | `"Floor 1 - Press"`, `"Floor 1 - Guide"`, `"Floor 1 - Warehouse (WH)"`, `"Floor 1 - Mold"`, `"Floor 2 - All"` | — |
| `zones` | `{ code, x, y }`, là **một điểm** (tâm marker đếm số lượng), gồm cả khu lớn (`A1`) và sub-zone (`A1-1`). | % của khung ảnh (0–100) |
| `areas` | `MapArea { code, points[] }`: **polygon của khu lớn** (A1…A43). Phần lớn là hình chữ nhật 4 điểm (`rectArea`); A24, A29, A36 là polygon chéo. | % của khung ảnh |
| `imgW/imgH` | Kích thước pixel gốc của ảnh. | px |
| `imageData` | URL asset do Vite import (`src/assets/maps/*.png`), **không phải base64**. | — |
| `rotationDeg` | Chỉ có ở Mold (90°): cả ảnh, polygon và marker cùng xoay. | — |

Số lượng theo layout:

| Layout | Ảnh | Marker `zones` | Polygon `areas` | Sub-zone có hình? |
|---|---|---|---|---|
| Floor 1 - Press | 1226×718 | 27 (A1…A11 + con) | 11 (A1…A11) | Không |
| Floor 1 - Guide | 1178×509 | 29 (A12…A21 + con) | 10 (A12…A21) | Không |
| Floor 1 - Warehouse | 890×754 | 8 (A22…A29, không có con) | 8 | Không có sub-zone |
| Floor 1 - Mold | 467×737, xoay 90° | 21 (A30…A39 + A31-x, A32-x, A34-x, A35-x) | 10 | Không |
| Floor 2 - All | 1228×717 | 14 (A40…A43 + con) | 4 | Không |

### 1.2 So với `GEO` của demo

`GEO` của demo = `{ "Fac_A|1F": { img, w, h, zones: { "A1-1": [x, y, w, h], ... } }, ... }`: **hình chữ nhật pixel cho từng sub-zone** (và khu lớn không có con như A7, A9, A10). Demo tự suy ra khung khu lớn (`bigbox`) bằng bounding box của các con.

| Key demo | Layout repo tương ứng | Số rect | Khớp ảnh? |
|---|---|---|---|
| `Fac_A\|1F` | Floor 1 - Press | 21 | Cùng bản vẽ, cùng 1226×718 (demo là bản xám; byte khác nhau, nội dung trùng khi so bằng mắt) |
| `Fac_B\|1F` | Floor 1 - Guide | 23 | Cùng 1178×509 |
| `Fac_A\|2F` | Floor 2 - All | 12 | Cùng 1228×717 |
| — | Floor 1 - Warehouse | **0** | Demo không có |
| — | Floor 1 - Mold | **0** | Demo không có |

**Kết luận:**
- `mapData` hiện tại **không đủ** để vẽ vùng click cho sub-zone như demo. Chỉ click được khu lớn (polygon). Sub-zone chỉ có marker dạng điểm.
- **Quy đổi được ngay** cho 3 layout vì ảnh cùng kích thước: `x% = x / imgW * 100`, `y% = y / imgH * 100`, và tương tự cho `w` và `h`.
  Ví dụ: `A1-1 [334, 228, 227, 102]` trên 1226×718 → `left 27.24, top 31.75, right 45.76, bottom 45.96`. Kết quả khớp polygon `A1` hiện có (27.37 → 46.30) trong khoảng ±0.5%.
- Warehouse (A22–A29): không có sub-zone trong DB, nên polygon khu lớn hiện có là đủ.
- Mold (A30–A39): DB có sub-zone (A31-1…A35-2, A34-3). Cần **vẽ mới** rect cho các sub-zone này và nhớ rằng toạ độ nằm trong hệ ảnh **chưa xoay**.
- Đề xuất cấu trúc: thêm `subAreas: MapArea[]` (hoặc đưa sub-zone vào `areas` với cờ cấp độ) để dùng lại luôn `rectArea` và hệ %.

---

## 2. Ánh xạ dữ liệu demo ↔ `FixedAsset`

### 2.1 Field

| Demo | `FixedAsset` (FE) | Cột DB (`dbo.F2_FIXED_ASSET`) | Ghi chú |
|---|---|---|---|
| `code` | `code` | `MachineCode` | Khớp 616/616 mã của demo, không trùng mã. |
| `name` | `name` | `FAName` | Khớp. |
| `fac` (`Fac_A`/`Fac_B`) | **Không có field tương ứng** | — | Xem 2.2. |
| `floor` (`1F`/`2F`) | `floor` | `Floor` | Khớp 616/616. |
| `zone` (`A6-4`) | token **cuối** của `position` | `PositionAA` (hoặc `PositionA` nếu AA trống) | Khớp 612/616, 4 dòng lệch (xem 2.4). |
| — | `factory` | `Factory` | `"Factory 2"` cho toàn bộ máy của demo. |
| — | `div` | `Div` | `"KVH"` cho toàn bộ máy của demo. |

`position` do BE ghép: `CONCAT_WS(' ', PositionA, PositionAA, PositionAAA)` (`FixedAssetRepository.java:26`). FE không nhận riêng từng cột.

### 2.2 Giá trị thực (theo dump, xem lưu ý ở đầu)

- `factory`: `Factory 2` (895), `Factory 3` (567), `Factory 1` (493), `Factory 4` (454), `Outside` (65). **Không có `Fac_A`/`Fac_B`.**
- `div`: `KVH` 873, `FVH1` 396, `FVH4` 306, `TVH` 299, `INFRA_GM` 250, `FVH3` 181, `INFRA_IT` 104, `meviy` 65.
- `floor`: `1F` 1 956, `2F` 453, `Outside` 65.
- Factory 2: `KVH` 871, `INFRA_IT` 15, `INFRA_GM` 9. `MapTab` hiện lọc `Factory 2` + `KVH`, nên **24 tài sản INFRA của Factory 2 không lên map**.
- Factory 2 / KVH theo dải zone:

| Dải zone | Layout | 1F | 2F |
|---|---|---|---|
| A1–A11 | Press ("Factory A") | 290 | 2 ⚠ |
| A12–A21 | Guide ("Factory B") | 226 | — |
| A22–A29 | Warehouse | 17 | — |
| A30–A39 | Mold | 238 | — |
| A40–A43 | Floor 2 | 5 ⚠ | 93 |

- Demo `Fac_A` → DB `Factory 2/KVH` (391 máy), demo `Fac_B` → DB `Factory 2/KVH` (225 máy).
- Demo có 616 máy trên 871 máy Factory 2/KVH. **255 máy bị thiếu** (238 Mold + 17 Warehouse).
- Theo `kind`, demo gồm cả `Software` (12), `Buildings` (19), `Equipment attached to buildings` (30), `Tools, Furniture…` (4). Di dời "Software" hay "Buildings" là vô nghĩa, cần quy tắc lọc.

**Hệ quả:** "Factory A/B" nên được hiểu là **toà nhà / layout** bên trong Factory 2, suy ra từ zone (A1–A11 & A40–A43 → A, A12–A21 → B), không suy ra từ `factory`. Trong DB, chuyển máy từ A sang B **không đổi `Factory` hay `Floor`**, chỉ đổi `PositionA/AA`.

### 2.3 Cấu trúc `position`

| Mẫu | Số dòng | Ý nghĩa |
|---|---|---|
| `A9 A9-9` (cha + con) | 1 589 | Chuẩn: PositionA = khu lớn, PositionAA = sub-zone |
| `A9 A9` (cha lặp lại) | 815 | Máy chỉ gán đến khu lớn (A7, A9, A10, A18, A33…) |
| `Outside Outside` | 65 | Ngoài nhà máy |
| `A-15 A-15-3` | 2 | **Dị dạng** (dấu `-` sau `A`): không khớp zone nào |
| `A30-4 A30-4` | 1 | Sub-zone lặp, A30-4 không có trên bản vẽ |
| `A34 A23-5` | 1 | Cha ≠ con (Factory 3, ngoài phạm vi) |
| `A33` (1 token) / rỗng | 1 / 1 | Thiếu dữ liệu |

→ **Không có dòng nào có 3 token** (PositionAAA đang trống). Việc `position` có "nhiều token" là do cấu trúc cha-con, **không phải máy có nhiều vị trí**.

### 2.4 Lệch giữa demo và DB

- `A-1488`: demo `A15-4`, DB `A15 A15-3`.
- `A-2964`, `A-2965`: demo `A15-3`, DB `A-15 A-15-3` (demo đã tự chuẩn hoá).
- `A-884`: demo `Fac_A / A2-2`, DB `A14 A14-1` (khác cả toà nhà).

→ Dữ liệu `RAW` của demo là **bản chụp cũ hoặc đã chỉnh tay**. Không dùng `RAW`, phải đọc từ `/api/assets`.

---

## 3. Tái sử dụng và viết mới

### 3.1 Tái sử dụng được

| Thành phần | Mức độ | Ghi chú |
|---|---|---|
| Ảnh `src/assets/maps/*.png` | Dùng nguyên | Cùng bản vẽ với demo. Đã tách file, có hash, lazy-load theo chunk Map. |
| `FLOORS[].areas` + `rectArea()` | Dùng nguyên, **bổ sung sub-zone** | Hệ % thống nhất. Có sẵn polygon chéo (A24/A29/A36). |
| `FloorMap` (`src/components/map/FloorMap.tsx`) | **Một phần** | Tái sử dụng được: nút zoom, `RotationFrame` (Mold xoay 90°), khung ảnh + lớp SVG `viewBox 0-100`, cơ chế giữ chữ đứng khi xoay. **Chưa có**: rect sub-zone, trạng thái from / to / old / dim theo từng zone, ghim và mũi tên, "tray" cho zone không có trên bản vẽ, click chọn đích. Nên tách phần "scene" (zoom + xoay + ảnh) thành component dùng chung, rồi làm `RelocationFloorMap` riêng thay vì nhồi thêm props vào `FloorMap`. |
| `matchesZone` (`MapTab.tsx:21`) | Dùng để **đếm** | So khớp theo cấp (`A1` khớp `A1-1`). **Chưa export**, cần chuyển sang `utils`. Relocation cần thêm hàm `currentZone(row)` = token cuối, có chuẩn hoá (`A-15-3` → `A15-3`?). |
| `posTokens`, `normalize` (`MapTab.tsx`) | Dùng được | Chuyển sang `utils` cùng lúc. |
| `layoutDbFloor` (`MapTab.tsx:25`) | Dùng được nhưng **mong manh** | Parse từ `title`. Nên thêm field `dbFloor: '1F' \| '2F'` và `building: 'A' \| 'B' \| …` rõ ràng vào `FLOORS`. |
| `MAP_FACTORY` / `MAP_DIV` | Dùng được | Hiện là hằng số trong `MapTab`, nên chuyển vào `mapData`. |
| Glass theme (`src/theme/liquidGlass.ts`) | Dùng nguyên | `glassTabs` (tab layout / tab tầng), `glassFloating` (legend, nút zoom), `glassFilterControls` (Autocomplete chọn máy), `glassIconButton`, `glassSegmented`, `glassRadius`. |
| `density` (`src/theme/density.ts`) | Dùng nguyên | `gap`, `pad`, `tabGap`. |
| `palette.ts` | **Cần bổ sung token** | Màu From (amber), To (green), Cross (purple) của demo chỉ có bản sáng. Cần thêm bản dark. |
| `ZoneDetailPanel` | Tham khảo / tái dùng một phần | Danh sách máy trong zone, giới hạn 100 dòng. |
| `uniq`, `formatMoney`, `EmptyState`/`LoadingState`/`ErrorState` | Dùng nguyên | — |
| `App.tsx` `TabPanel` + lazy chunk | Dùng nguyên | Thêm tab: mở rộng `AppTab` (`types/fixedAsset.ts:66`), mảng `tabs` (`DashboardTabs.tsx:12`), `DATA_TABS` và `renderDataTab` (`App.tsx:50,104`). |
| `fixedAssetApi.readJson` | Dùng nguyên | Cho các endpoint mới. |

### 3.2 Phải viết mới

1. **Dữ liệu hình sub-zone**: chuyển `GEO` sang %, cho Press, Guide và 2F. Vẽ mới cho Mold nếu cần chọn đến sub-zone.
2. **Chỉ mục zone → layout** (`zoneIndex`): mỗi mã khu lớn A1…A43 thuộc đúng **một** layout, nên tra layout theo zone thay vì theo `floor` (vì 1F có tới 4 layout).
3. **`RelocationTab`**: 2 bản đồ Before/After, chọn nhiều máy (Autocomplete `multiple`, dán danh sách mã phân tách bằng dấu phẩy), chọn đích (Toà nhà/Tầng/Sub-zone hoặc click trên map), tóm tắt, form ngày và lý do, bảng yêu cầu đã gửi.
4. **Overlay SVG**: trạng thái zone (from/to/old/dim), ghim nhãn, mũi tên cong, edge tag "Sang toà B / 1F / A15-3", tray cho zone không có trên bản vẽ. Nên render bằng JSX thay cho việc demo xoá rồi dựng lại `innerHTML` mỗi lần cập nhật.
5. **Hook state** (`useRelocationDraft`): danh sách máy, đích, loại di chuyển (`building` / `floor` / `same` / `none`).
6. **API client + types**: `RelocationRequest`, `RelocationItem`, `createRelocation`, `listRelocations`.
7. **i18n vi/en** cho toàn bộ chuỗi (demo chỉ có tiếng Anh).
8. **Backend**: bảng + endpoint (mục 5).

---

## 4. Rủi ro

### 4.1 Hiệu năng

| Rủi ro | Mức | Chi tiết / đề xuất |
|---|---|---|
| Ảnh base64 inline | **Thấp nếu không copy từ demo** | Demo nhúng 3 ảnh base64 (~234 KB text, lớn hơn file PNG khoảng 33%) và `RAW` (~50 KB) ngay trong script. Repo đã tách ảnh thành PNG có hash (35–73 KB/ảnh, tổng ~241 KB), cache được, nằm trong chunk lazy. **Không được** dán `IMG`/`RAW` của demo vào TS, vì sẽ làm phình JS chunk và mất cache. |
| 2 bản đồ cùng lúc | Thấp | Before/After có thể dùng cùng ảnh, trình duyệt chỉ tải một lần. Hai lớp SVG với khoảng 30 rect mỗi lớp là nhẹ. |
| `filter: drop-shadow` + animation (`pulse`, `dash`) | Trung bình khi zoom 2–3× | Filter trên SVG làm repaint toàn vùng. Nên dùng stroke thay cho filter, và tôn trọng `prefers-reduced-motion` (demo đã làm). |
| Đếm zone | Thấp | `zones.map(... visible.filter(matchesZone))` là O(zone × rows), khoảng 30 × 900 phép so khớp. Nếu thêm cả sub-zone của 5 layout thì nên dựng `Map<zone, count>` một lần. |
| Tra mã máy | Thấp | Dùng `Map<code, row>` (như `BYCODE` của demo). ~2.5k dòng. |
| Bộ lọc toàn cục | **Cần quyết định** | `App` truyền `tabRows` **đã lọc** vào tab. Nếu tab Relocation dùng `tabRows`, máy bị bộ lọc ẩn sẽ không chọn được, và số máy trong zone đích sẽ sai. Có thể cần `data.tableData`. |
| `TabPanel` giữ mount | Thấp | State nháp giữ nguyên khi đổi tab, đây là điều có lợi. |

### 4.2 Zone có trong DB nhưng không có trên bản vẽ (Factory 2/KVH)

| Trường hợp | Số dòng | Hiện tại trên `MapTab` |
|---|---|---|
| `A5-3` (1F): không có marker lẫn rect | 1 | Chỉ được đếm vào `A5`. Không chọn riêng được. |
| `A-15 A-15-3` (dị dạng) | 2 | **Biến mất khỏi map** (không khớp zone nào). |
| `A30-4 A30-4` | 1 | Đếm vào `A30`. Sub-zone không có trên bản vẽ. |
| **Tầng lệch với bản vẽ**: `A40-1`, `A42-3` ghi `1F` (5 dòng); `A2-3`, `A5-1` ghi `2F` (2 dòng) | 7 | **Biến mất khỏi map**: layout lọc theo `floor` trước, mà layout 1F không có marker A42, layout 2F không có marker A2/A5. Đây là lỗi đang tồn tại. |
| `A33` chỉ có 1 token | 1 | Vẫn khớp `A33`. |
| Zone có trên bản vẽ nhưng 0 máy: `A8`, `A19`, và A22/A27/A28/A29, A31/A32/A34/A35 (cấp khu lớn) | — | Vẫn phải cho chọn làm đích. |

Demo xử lý bằng **tray** "Sub-areas in master data but not on the drawing" (vẫn click được) và **block plan** khi không có ảnh. Nên giữ cách này thay vì bỏ qua các dòng trên.

### 4.3 `position` "nhiều token"

- Thực tế luôn là **cha + con**, không phải nhiều vị trí. Quy tắc: `currentZone = token cuối`, `major = token đầu` (hoặc `currentZone.split('-')[0]`).
- `matchesZone` đếm theo cấp, nên một máy `A2 A2-3` được đếm ở cả `A2` và `A2-3`. Điều này đúng cho việc đếm, nhưng **khi so sánh "đã ở đích chưa" phải so bằng `currentZone`**.
- 815 máy chỉ gán đến khu lớn (`A9 A9`). Nếu đích bắt buộc là sub-zone, những máy này sẽ luôn tính là "di chuyển" dù thực tế chỉ bổ sung chi tiết vị trí.
- Nếu sau này `PositionAAA` có dữ liệu thì quy tắc "token cuối" vẫn đúng, nhưng cần thêm hình cho cấp thứ 3.

### 4.4 Rủi ro nghiệp vụ và dữ liệu

- **Import Excel ghi đè vị trí**: `POST /api/upload` cập nhật `PositionA/AA/AAA`/`Floor` từ Excel (`FixedAssetRepository.batchUpdate`). Nếu một yêu cầu đã duyệt cập nhật DB, lần import sau sẽ ghi đè lại theo Excel, và ngược lại. Cần xác định **nguồn dữ liệu gốc (source of truth)**.
- **Vị trí thay đổi giữa lúc tạo và lúc duyệt**: phải lưu snapshot `from` và kiểm tra lại ở server.
- **Không có danh tính người dùng**: demo hard-code `USER`. FE/BE hiện không có đăng nhập.
- **Mã yêu cầu**: demo sinh `RL-0001` từ `localStorage`. Mã này phải do server sinh.
- **Bảo mật (ngoài phạm vi, nhưng cần báo)**: `../f2-fixed-asset-be-spring/src/main/resources/application.yml` chứa **mật khẩu DB dạng chuỗi cứng** (không đọc qua biến môi trường). Nên chuyển sang `${DB_PASSWORD}` và đổi mật khẩu nếu file này đã được commit hoặc chia sẻ.
- Repo đang có **bản trùng** của demo ở `src/docs/Demo – Machine Relocation Request.html` (chưa track). Nên xoá để tránh lẫn vào `src/`. Tôi chưa xoá.

---

## 5. Backend

### 5.1 Hiện trạng

| BE | Endpoint | Bảng |
|---|---|---|
| Spring Boot (`f2-fixed-asset-be-spring`) | `GET /api/health`, `GET /api/assets`, `GET /api/import-history`, `POST /api/upload`, `POST /api/upload-from-url` | `dbo.F2_FIXED_ASSET` (master, không được tạo hay sửa schema), `dbo.F2_FIXED_ASSET_HISTORY`, `dbo.F2_FIXED_ASSET_IMPORT_HISTORY` |
| Node cũ (`f2-fixed-asset-controlling-map-sql`) | Cùng contract | `assets`, `asset_history`, `import_history` (MySQL) |

→ **Không có API, bảng hay trạng thái nào cho yêu cầu di dời.** Không có Spring Security, không có khái niệm người dùng (`ImportedBy` luôn là `null`).

### 5.2 Contract đề xuất (theo phong cách hiện có: JSON, lỗi `{ error }`)

**Bảng (SQL Server, `F2Database`):**

```sql
CREATE TABLE dbo.F2_RELOCATION_REQUEST (
  Id              BIGINT IDENTITY PRIMARY KEY,
  RequestNo       NVARCHAR(20)  NOT NULL UNIQUE,      -- RL-2026-0001, server sinh
  ToFactory       NVARCHAR(50)  NOT NULL,             -- 'Factory 2'
  ToBuilding      NVARCHAR(10)  NULL,                 -- 'A' | 'B' (nếu dùng)
  ToFloor         NVARCHAR(50)  NOT NULL,             -- '1F'
  ToPositionA     NVARCHAR(100) NOT NULL,             -- 'A15'
  ToPositionAA    NVARCHAR(100) NULL,                 -- 'A15-3'
  PlannedMoveDate DATE NOT NULL,
  PlannedDoneDate DATE NOT NULL,
  Reason          NVARCHAR(1000) NULL,
  Status          NVARCHAR(20)  NOT NULL,             -- PENDING|APPROVED|REJECTED|DONE|CANCELLED
  RequestedBy     NVARCHAR(255) NOT NULL,             -- email/emp id từ xác thực
  RequestedAt     DATETIME2(0)  NOT NULL DEFAULT SYSDATETIME(),
  DecidedBy       NVARCHAR(255) NULL,
  DecidedAt       DATETIME2(0)  NULL,
  DecisionNote    NVARCHAR(1000) NULL,
  RowVer          ROWVERSION,
  CONSTRAINT CK_RELOC_DATES CHECK (PlannedDoneDate >= PlannedMoveDate)
);
CREATE TABLE dbo.F2_RELOCATION_REQUEST_ITEM (
  Id              BIGINT IDENTITY PRIMARY KEY,
  RequestId       BIGINT NOT NULL REFERENCES dbo.F2_RELOCATION_REQUEST(Id),
  MachineCode     NVARCHAR(64) NOT NULL,
  MachineName     NVARCHAR(500) NULL,                 -- snapshot
  FromFactory     NVARCHAR(50) NULL,
  FromFloor       NVARCHAR(50) NULL,
  FromPositionA   NVARCHAR(100) NULL,
  FromPositionAA  NVARCHAR(100) NULL,
  MoveType        NVARCHAR(10) NOT NULL               -- BUILDING|FLOOR|SAME
);
CREATE INDEX IX_RELOC_ITEM_CODE ON dbo.F2_RELOCATION_REQUEST_ITEM(MachineCode);
```

**Endpoint:**

| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/api/relocation-requests` | Tạo yêu cầu. Server tự lấy `from` từ `F2_FIXED_ASSET` (không tin giá trị `from` do client gửi) và bỏ qua máy đã ở đích. Trả 409 nếu máy đang có yêu cầu `PENDING`/`APPROVED`. |
| `GET` | `/api/relocation-requests?status=&machineCode=&requestedBy=&page=&size=` | Danh sách (bảng "Submitted requests"). |
| `GET` | `/api/relocation-requests/{requestNo}` | Chi tiết + items. |
| `PATCH` | `/api/relocation-requests/{requestNo}` | `{ action: "approve" \| "reject" \| "cancel" \| "complete", note? }`, có kiểm tra quyền và `RowVer`. |
| (tuỳ chọn) | `GET /api/assets` bổ sung `positionA`, `positionAA` riêng | Để FE khỏi phải tách chuỗi `position`. |

**Request/response mẫu:**

```jsonc
// POST /api/relocation-requests
{
  "machineCodes": ["A-006-1", "A-077-1"],
  "to": { "factory": "Factory 2", "floor": "1F", "positionA": "A15", "positionAA": "A15-3" },
  "plannedMoveDate": "2026-10-05",
  "plannedDoneDate": "2026-10-07",
  "reason": "Gom máy mài về một line"
}
// 201
{
  "requestNo": "RL-2026-0001", "status": "PENDING",
  "items": [{ "machineCode": "A-006-1", "from": { "factory": "Factory 2", "floor": "1F", "positionA": "A6", "positionAA": "A6-4" }, "moveType": "BUILDING" }],
  "skipped": [{ "machineCode": "A-077-1", "reason": "ALREADY_AT_TARGET" }],
  "requestedBy": "…", "requestedAt": "2026-09-30T10:00:00"
}
// 400 { "error": "..." } · 404 { "error": "Unknown machine code: X" } · 409 { "error": "A-006-1 already in RL-2026-0000" }
```

Khi `complete`: có ghi `PositionA/AA/Floor` vào `F2_FIXED_ASSET` và ghi lịch sử hay không phụ thuộc vào câu hỏi Q9.

---

## 6. Câu hỏi cần trả lời trước khi build

**Phạm vi và ý nghĩa dữ liệu**
1. **Phạm vi**: chỉ `Factory 2` + `KVH`? Có tính 24 tài sản `INFRA_GM`/`INFRA_IT` của Factory 2 không? Factory 1/3/4 (chưa có bản vẽ) có cần dùng block plan như demo không?
2. **"Factory A / Factory B"**: xác nhận đây là toà nhà trong Factory 2 (Press = A, Guide = B, 2F = A). **Warehouse (A22–A29) và Mold (A30–A39) thuộc toà nào?** Nhãn badge nên là "Đổi toà nhà" thay cho "Factory change"?
3. **Loại tài sản**: có loại `Software`, `Buildings`, `Equipment attached to buildings`, `Tools…` khỏi danh sách chọn không? Chỉ cho `Machinery`?
4. **Độ chi tiết của đích**: bắt buộc chọn sub-zone (`A15-3`), hay cho chọn khu lớn không có con (A7, A9, A18…)? Có cho chọn khu lớn khi khu đó có con không?

**Bản vẽ**
5. Dùng lại toạ độ sub-zone từ `GEO` của demo (đã quy đổi %) cho Press/Guide/2F được không? **Ai vẽ và nghiệm thu rect sub-zone cho Mold** (bản vẽ xoay 90°)? Có cần sub-zone cho Warehouse không?
6. Với zone không có trên bản vẽ (`A5-3`, `A30-4`) và dòng lệch tầng (A42-3 ghi 1F, A2-3 ghi 2F…): dùng **tray** như demo, hay sửa dữ liệu nguồn trước? Khi lệch tầng thì tin `Floor` hay tin zone?
7. `A-15-3` / `A-15`: có tự chuẩn hoá thành `A15-3` ở FE không, hay yêu cầu sửa Excel?

**Luồng nghiệp vụ**
8. **Danh tính người yêu cầu**: dùng SSO (Entra ID) hay nhập mã nhân viên? Hiện FE/BE chưa có xác thực nào.
9. **Khi hoàn tất di dời**: hệ thống có **cập nhật `PositionA/AA/Floor` trong `F2_FIXED_ASSET`** không? Nếu có, xử lý thế nào khi import Excel ghi đè lại? Excel hay app là nguồn dữ liệu gốc?
10. **Quy trình duyệt**: các trạng thái nào? Ai duyệt (`pic_approved` của máy, trưởng bộ phận, hay admin cố định)? Có gửi email thông báo không?
11. Một yêu cầu **chỉ một đích cho tất cả máy** như demo, hay cho mỗi máy một đích?
12. Có **chặn** tạo yêu cầu mới cho máy đang có yêu cầu `PENDING`/`APPROVED` không?
13. Ràng buộc ngày: có cho chọn ngày trong quá khứ không, có bắt buộc cả 2 ngày không? Có cần thêm trường khác (bộ phận, số điện thoại, đính kèm ảnh/bản vẽ) không?

**Kỹ thuật và UI**
14. Đặt ở **tab mới trong dashboard** (`AppTab = 'relocation'`) hay trang/route riêng? Bộ lọc toàn cục (FilterBar) có áp dụng cho tab này không?
15. BE đích là **Spring Boot + SQL Server** (không phải Node)? Ai phát triển BE? Tài khoản DB có quyền tạo 2 bảng mới trong `F2Database` không?
16. Cần hỗ trợ **dark mode** và **song ngữ vi/en** như các tab khác không? Demo chỉ có light mode và tiếng Anh.
17. Bảng "Submitted requests": ai được xem gì (chỉ yêu cầu của mình, hay tất cả)?

---

## Phụ lục A: Tệp đã đọc

FE: `src/App.tsx`, `src/components/map/{MapTab,FloorMap,ZoneDetailPanel}.tsx`, `src/data/mapData.ts`, `src/types/fixedAsset.ts`, `src/utils/fixedAsset.ts`, `src/hooks/useFixedAssets.ts`, `src/components/dashboard/DashboardTabs.tsx`, `src/api/fixedAssetApi.ts`, `src/theme/{density,liquidGlass}.ts`.
BE: `f2-fixed-asset-be-spring` (controller, repository, `ExcelImportService`, SQL, README), `f2-fixed-asset-controlling-map-sql` (`routes/api.js`, `fixed_asset_db.sql`).
`.env.example` của FE bị chặn đọc theo cấu hình quyền, nên không kiểm tra.

## Phụ lục B: Truy vấn kiểm chứng trên DB thật

```sql
-- Phân bố factory/div/floor
SELECT Factory, Div, Floor, COUNT(*) n FROM dbo.F2_FIXED_ASSET GROUP BY Factory, Div, Floor ORDER BY n DESC;
-- Dạng Position
SELECT PositionA, PositionAA, PositionAAA, COUNT(*) n FROM dbo.F2_FIXED_ASSET
WHERE Factory = N'Factory 2' GROUP BY PositionA, PositionAA, PositionAAA ORDER BY PositionA, PositionAA;
-- Dị dạng: cha ≠ tiền tố của con, có dấu '-' sau 'A', hoặc thiếu
SELECT MachineCode, Floor, PositionA, PositionAA FROM dbo.F2_FIXED_ASSET
WHERE Factory = N'Factory 2' AND (PositionA LIKE 'A-%' OR PositionAA LIKE 'A-%'
   OR (PositionAA LIKE '%-%' AND PositionAA NOT LIKE PositionA + '-%')
   OR NULLIF(LTRIM(RTRIM(PositionA)), '') IS NULL);
-- Lệch tầng: zone A40–A43 ghi 1F, hoặc zone A1–A39 ghi 2F
SELECT MachineCode, Floor, PositionA, PositionAA FROM dbo.F2_FIXED_ASSET
WHERE Factory = N'Factory 2' AND ((Floor = '1F' AND PositionA IN ('A40','A41','A42','A43'))
   OR (Floor = '2F' AND PositionA NOT IN ('A40','A41','A42','A43')));
```
