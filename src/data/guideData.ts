// Guide-only data. Images live in src/assets/guide (extracted byte-for-byte from the former inline base64);
// keys (image17…image61) are the original stable IDs referenced by byCat / gallery.
import image22 from '../assets/guide/image22.jpg'
import image18 from '../assets/guide/image18.jpg'
import image50 from '../assets/guide/image50.jpg'
import image25 from '../assets/guide/image25.jpg'
import image44 from '../assets/guide/image44.jpg'
import image40 from '../assets/guide/image40.jpg'
import image27 from '../assets/guide/image27.jpg'
import image56 from '../assets/guide/image56.jpg'
import image31 from '../assets/guide/image31.jpg'
import image29 from '../assets/guide/image29.jpg'
import image23 from '../assets/guide/image23.jpg'
import image35 from '../assets/guide/image35.jpg'
import image51 from '../assets/guide/image51.jpg'
import image55 from '../assets/guide/image55.jpg'
import image26 from '../assets/guide/image26.jpg'
import image52 from '../assets/guide/image52.jpg'
import image20 from '../assets/guide/image20.jpg'
import image28 from '../assets/guide/image28.jpg'
import image24 from '../assets/guide/image24.jpg'
import image48 from '../assets/guide/image48.jpg'
import image36 from '../assets/guide/image36.jpg'
import image33 from '../assets/guide/image33.jpg'
import image21 from '../assets/guide/image21.jpg'
import image49 from '../assets/guide/image49.jpg'
import image17 from '../assets/guide/image17.jpg'
import image39 from '../assets/guide/image39.jpg'
import image53 from '../assets/guide/image53.jpg'
import image61 from '../assets/guide/image61.jpg'
import image19 from '../assets/guide/image19.jpg'
import image37 from '../assets/guide/image37.jpg'
import image38 from '../assets/guide/image38.jpg'

export const GUIDE_DATA = {
  byCat: {"vehicles": {"qr": "image29", "model": "image26", "full": "image27"}, "buildings": {"qr": "image17", "full": "image18"}, "equipment_building": {"qr": "image19", "full": "image20"}, "copier": {"model": "image21", "full": "image22", "qr": "image33"}, "laptop": {"full": "image23", "qr": "image31"}, "machinery": {"model": "image24", "full": "image25", "qr": "image28"}, "tools_equipment": {"qr": "image35", "model": "image36", "full": "image37"}, "upgrade": {"model": "image44", "full": "image48", "qr": "image49"}, "software": {"full": "image50", "qr": "image61"}},
  gallery: ["image56", "image39", "image40", "image38", "image51", "image52", "image53", "image55"],
  images: {
    image22,
    image18,
    image50,
    image25,
    image44,
    image40,
    image27,
    image56,
    image31,
    image29,
    image23,
    image35,
    image51,
    image55,
    image26,
    image52,
    image20,
    image28,
    image24,
    image48,
    image36,
    image33,
    image21,
    image49,
    image17,
    image39,
    image53,
    image61,
    image19,
    image37,
    image38,
  },
} as const

// S-Patrol (Apps section). No public link yet: leave empty to hide the "Open" button.
export const S_PATROL_URL = ''

// Parts carried over from the legacy guide (docs/f2-fixed-asset-controlling-map-sql/public/index.html).
// Text is verbatim (legacy "1/…6/" prefixes dropped); GuideTab composes them into the numbered sections.
// `**x**` marks bold (legacy <strong>).
export type L10n = { vi: string; en: string }
export type GuideBlock =
  | { kind: 'heading'; text: L10n }
  | { kind: 'mono'; text: L10n }
  | { kind: 'text'; text: L10n }
  | { kind: 'list'; items: L10n[] }
  | { kind: 'table'; head: L10n[]; rows: string[][] }
export type GuidePartId = 'naming' | 'pic' | 'qrPosition' | 'glue' | 'upload'
export interface GuidePart { id: GuidePartId; title: L10n; blocks: GuideBlock[] }

const same = (s: string): L10n => ({ vi: s, en: s })

const PARTS: GuidePart[] = [
  {
    id: 'naming',
    title: { vi: 'Nguyên tắc đặt tên', en: 'Naming convention' },
    blocks: [
      { kind: 'heading', text: { vi: 'Trước khi dán QR (Before)', en: 'Before sticking QR' } },
      { kind: 'mono', text: same('[Factory]_[Code]_[No]  →  FVH1_A-0001_1') },
      { kind: 'heading', text: { vi: 'Sau khi dán QR (After)', en: 'After sticking QR' } },
      { kind: 'mono', text: same('[Factory]_[Code]_[Floor]_[MAP]_[Group]_[No]  →  FVH1_A-0001_1F_A1-1_Flange big fine_1') },
      {
        kind: 'list',
        items: [
          { vi: 'Photo1: chụp toàn cảnh', en: 'Photo1: full overview shot' },
          { vi: 'Photo2: chụp serial/model', en: 'Photo2: serial/model shot' },
          { vi: 'Photo3: chụp thấy được QR code', en: 'Photo3: shot showing the QR code' },
        ],
      },
    ],
  },
  {
    id: 'pic',
    title: { vi: 'PIC phụ trách theo Đối tượng & Factory', en: 'PIC in charge by Asset type & Factory' },
    blocks: [
      { kind: 'text', text: { vi: 'Mỗi loại đối tượng tài sản do 1 PIC phụ trách chụp ảnh/đánh giá riêng theo từng Factory:', en: 'Each asset type is handled by a dedicated PIC for photo-taking/assessment, per Factory:' } },
      {
        kind: 'table',
        head: [same('#'), { vi: 'Đối tượng', en: 'Asset object' }, same('PIC'), same('FVH1'), same('FVH3'), same('FVH4'), same('TVH'), same('KVH'), same('meviy')],
        rows: [
          ['1', 'Machine', 'SM local main + MA', 'Sơn', 'Long', 'Long', 'Hùng', 'Duẩn', 'Hoàng'],
          ['2', 'Thiết bị đo / Measuring device', 'MTC', 'An', 'An', 'An', 'Hùng', 'Kha', 'Hoàng'],
          ['3', 'Tòa nhà, máy lạnh, GM, máy photo / Building, AC, GM, copier', 'INFRA_GM', 'Tuấn', 'Tuấn', 'Tuấn', 'Tuấn', 'Tuấn', 'Tuấn'],
          ['4', 'IT, máy photo KVH / IT, KVH copier', 'INFRA_IT', 'N.Thành', 'N.Thành', 'N.Thành', 'N.Thành', 'N.Thành', 'N.Thành'],
          ['5', 'Phần mềm / Software (Solidwork…)', 'PE', 'Liễn', 'Giang', 'Giang', 'Hùng', 'Vinh', 'Hoàng'],
        ],
      },
    ],
  },
  {
    id: 'qrPosition',
    title: { vi: 'Vị trí dán QR code (Position sticking QR code)', en: 'QR code sticking position' },
    blocks: [
      { kind: 'heading', text: { vi: 'Tiêu chuẩn chung (Standard) — trình tự chọn vị trí dán:', en: 'General standard — order for choosing the sticking position:' } },
      {
        kind: 'list',
        items: [
          { vi: 'Mặt trước (trực diện) của thiết bị', en: 'The front (directly visible) face of the equipment' },
          { vi: 'Chiều cao trong khoảng 1.4m ~ 1.7m (trường hợp máy móc thiết bị <1.4m thì dán tại vị trí cao nhất có thể)', en: 'Height between 1.4m ~ 1.7m (if the equipment is <1.4m, stick at the highest possible position)' },
          { vi: 'Ưu tiên vị trí dán theo: phần trên từ trái qua phải, giữa từ trái qua phải, dưới từ trái qua phải', en: 'Position priority: top from left to right, middle from left to right, bottom from left to right' },
          { vi: 'Có khoảng trống, dễ dàng nhìn thấy, ít bị tác động, va chạm. Không dán tại vị trí lồi lõm không bằng phẳng', en: 'Enough clear space, easily visible, low risk of impact/collision. Do not stick on uneven or bumpy surfaces' },
          { vi: '📌 Trường hợp nằm ngoài standard 1-4: PIC liên lạc Finance, gửi đề xuất vị trí dán và cập nhật vào "Position Stick QR code" trong Master File để quản lý theo trường hợp đặc biệt', en: '📌 If outside standard rules 1-4: PIC contacts Finance, proposes a sticking position and updates "Position Stick QR code" in the Master File to manage it as a special case' },
        ],
      },
      { kind: 'heading', text: { vi: 'Lưu ý theo khu vực đặc biệt:', en: 'Notes for special areas:' } },
      {
        kind: 'list',
        items: [
          { vi: '**Khu vực Plating & Waste:** dán tại tủ điện, đầu đường ống', en: '**Plating & Waste area:** stick on the electrical cabinet, at the pipe end' },
          { vi: '**Khu vực Building:** cao 1.4m~1.7m; ưu tiên gần cổng chính, cửa ra vào, lối lên nhà xe có mái che', en: '**Building area:** height 1.4m~1.7m; prioritize near the main gate, doors, or covered walkway to the parking area' },
          { vi: '**Cột cờ / bờ kè:** dán gần vị trí có mái che, hoặc đầu bờ kè', en: '**Flagpole / embankment:** stick near a covered spot, or at the end of the embankment' },
          { vi: '**Máy lạnh:** dán trực tiếp lên dàn lạnh / bảng điều khiển (nếu trên cao, in 2 tem: 1 dán dàn lạnh, 1 dán bảng điều khiển)', en: '**Air conditioners:** stick directly on the indoor unit / control panel (if high up, print 2 labels: one on the indoor unit, one on the control panel)' },
          { vi: '**Nhiều thiết bị trong 1 tài sản:** in đủ số tem, đánh số (VD: 1/8 ~ 8/8) dán lên từng thiết bị để dễ quản lý khi hủy', en: '**Multiple devices in one asset:** print one label per device, numbered (e.g. 1/8 ~ 8/8) so each is easy to track when disposing' },
          { vi: '**Server:** in 2 tem — 1 dán trực tiếp thiết bị, 1 dán ngoài tủ server kèm layout chỉ dẫn', en: '**Servers:** print 2 labels — one directly on the device, one outside the server cabinet with a layout guide' },
        ],
      },
    ],
  },
  {
    id: 'glue',
    title: { vi: 'Keo dán QR code', en: 'Adhesive for the QR code' },
    blocks: [
      { kind: 'text', text: { vi: 'Dùng loại keo **3M - 93010** (áp dụng cho môi trường máy móc nhiều dầu) — dán 2 lớp:', en: 'Use **3M - 93010** adhesive (for oily machinery environments) — stick in 2 layers:' } },
      {
        kind: 'list',
        items: [
          { vi: 'Bước 1: Dán keo mặt sau QR code', en: 'Step 1: Apply adhesive to the back of the QR code' },
          { vi: 'Bước 2: Dán keo mặt trước QR code (phủ bảo vệ)', en: 'Step 2: Apply adhesive to the front of the QR code (protective cover)' },
        ],
      },
    ],
  },
  {
    id: 'upload',
    title: { vi: 'Upload ảnh vào File Excel', en: 'Upload photos to the Excel file' },
    blocks: [
      {
        kind: 'list',
        items: [
          { vi: 'Vào Sheet "Details"', en: 'Go to the "Details" sheet' },
          { vi: 'Dán link ảnh vào đúng cột: Photo1, Photo2, Photo3', en: 'Paste the photo link into the correct column: Photo1, Photo2, Photo3' },
        ],
      },
    ],
  },
]

export const GUIDE_PARTS = Object.fromEntries(PARTS.map((p) => [p.id, p])) as Record<GuidePartId, GuidePart>

// Guide sections in work order; `purpose` is the one-line subtitle under each card title.
export const GUIDE_SECTIONS = [
  { id: 'responsibility', title: { vi: 'Trách nhiệm & chuẩn bị', en: 'Responsibilities & preparation' }, purpose: { vi: 'Xác định ai phụ trách chụp ảnh/đánh giá từng loại tài sản ở mỗi Factory.', en: 'Know who handles photos/assessment for each asset type in each Factory.' } },
  { id: 'apps', title: { vi: 'Ứng dụng cần dùng', en: 'Apps you need' }, purpose: { vi: 'Ứng dụng dùng để đăng nhập hệ thống.', en: 'The app used to sign in to this system.' } },
  { id: 'photos', title: { vi: 'Chụp ảnh tài sản', en: 'Photographing assets' }, purpose: { vi: 'Chụp đủ 3 ảnh cho mỗi tài sản và đặt tên đúng quy tắc.', en: 'Take the 3 required photos per asset and name them correctly.' } },
  { id: 'qr', title: { vi: 'Dán tem QR', en: 'Sticking QR labels' }, purpose: { vi: 'Chọn đúng vị trí và loại keo khi dán tem QR lên tài sản.', en: 'Choose the right position and adhesive when sticking QR labels.' } },
  { id: 'relocation', title: { vi: 'Di dời máy', en: 'Machine relocation' }, purpose: { vi: 'Tạo và gửi yêu cầu di dời máy sang vị trí mới.', en: 'Create and submit a request to move machines to a new location.' } },
  { id: 'appendix', title: { vi: 'Phụ lục – Dành cho quản trị: Upload ảnh vào Excel', en: 'Appendix – For admins: Upload photos to Excel' }, purpose: { vi: 'Cách đưa link ảnh vào file Excel quản lý tài sản.', en: 'How to put photo links into the asset Excel file.' } },
] as const satisfies readonly { id: string; title: L10n; purpose: L10n }[]
export type GuideSectionId = (typeof GUIDE_SECTIONS)[number]['id']
