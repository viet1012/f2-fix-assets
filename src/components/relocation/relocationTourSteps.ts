import type { LayoutId } from '../../data/mapData'
import type { RelocationDemo } from '../../demo/relocationDemo'
import type { RelocationTarget } from '../../types/relocation'
import type { RelocationFormValues } from '../../utils/relocationForm'
import type { TourStep } from '../common/GuidedTour'

/** What a tour step may change on the relocation tab (sample data only; the user's draft is restored afterwards). */
export interface RelocationTourCtx {
  demo: RelocationDemo
  setFacFilter: (fac: string | null) => void
  add: (codes: readonly string[]) => void
  setViewBefore: (id: LayoutId | null) => void
  setOpenZone: (zone: string | null) => void
  setHoverZone: (zone: string | null) => void
  setTarget: (target: RelocationTarget) => void
  setForm: (form: RelocationFormValues) => void
}

/**
 * Interactive tour of the relocation tab: targets are the `data-tour` keys set in RelocationTab / its parts.
 * `apply` builds the sample state of each step (cumulative); `body` describes that state, `plainBody` is used when
 * no sample data could be picked.
 */
export const RELOCATION_TOUR_STEPS: readonly TourStep<RelocationTourCtx>[] = [
  {
    target: 'stepper',
    title: { vi: 'Quy trình 3 bước', en: '3-step process' },
    body: {
      vi: 'Chọn máy → Vị trí đích → Thông tin & gửi. Hướng dẫn dùng dữ liệu mẫu, phần bạn đang nhập sẽ được giữ nguyên.',
      en: 'Pick machines → Destination → Details & submit. The tour uses sample data; your own input is kept.',
    },
    plainBody: {
      vi: 'Chọn máy → Vị trí đích → Thông tin & gửi. Bấm một bước để cuộn tới phần đó.',
      en: 'Pick machines → Destination → Details & submit. Click a step to jump to it.',
    },
  },
  {
    target: 'fac-chips',
    title: { vi: 'Lọc theo toà', en: 'Filter by building' },
    body: { vi: 'Đang lọc Toà A: danh sách chỉ còn máy của toà này. Số trong ngoặc là số máy có thể di dời.', en: 'Building A is selected: the list only shows its machines. The number is how many can be moved.' },
    plainBody: { vi: 'Chỉ hiện máy của toà đã chọn. Số trong ngoặc là số máy có thể di dời.', en: 'Shows only machines in that building. The number is how many can be moved.' },
    fallback: 'pick-card',
    apply: (c) => c.setFacFilter(c.demo.fac),
  },
  {
    target: 'machine-input',
    title: { vi: 'Nhập mã máy', en: 'Enter machine codes' },
    body: {
      vi: 'Máy đầu tiên đã vào ô chọn. Có thể gõ hoặc dán nhiều mã cùng lúc.',
      en: 'The first machine is now in the picker. You can type or paste several codes at once.',
    },
    plainBody: {
      vi: 'Gõ hoặc dán nhiều mã cùng lúc. Trong danh sách có thể chọn cả zone.',
      en: 'Type or paste several codes at once. In the list you can pick a whole zone.',
    },
    fallback: 'pick-card',
    apply: (c) => c.add([c.demo.codes[0]]),
  },
  {
    target: 'map-before',
    title: { vi: 'Bản đồ Trước', en: 'Before map' },
    body: {
      vi: 'Click một zone sẽ mở danh sách máy trong zone đó. Máy thứ hai đã được thêm từ danh sách này.',
      en: 'Clicking a zone opens the list of its machines. The second machine was added from that list.',
    },
    plainBody: { vi: 'Click một zone để chọn nhiều máy trong zone đó.', en: 'Click a zone to pick several machines in it.' },
    apply: (c) => {
      c.add([c.demo.codes[1]])
      c.setViewBefore(c.demo.layoutId)
      c.setOpenZone(c.demo.sourceZone)
    },
  },
  {
    target: 'selected-table',
    title: { vi: 'Máy đã chọn', en: 'Selected machines' },
    body: {
      vi: 'Rê chuột lên một dòng thì zone của máy nhấp sáng trên bản đồ. Bấm thùng rác để bỏ máy.',
      en: "Hovering a row flashes the machine's zone on the maps. Use the bin to remove a machine.",
    },
    plainBody: {
      vi: 'Rê chuột lên một dòng để thấy zone trên bản đồ. Bấm thùng rác để bỏ máy.',
      en: 'Hover a row to flash its zone on the maps. Use the bin to remove a machine.',
    },
    fallback: 'pick-card',
    apply: (c) => c.setHoverZone(c.demo.sourceZone),
  },
  {
    target: 'target-card',
    title: { vi: 'Vị trí đích', en: 'Destination' },
    body: { vi: 'Toà, Tầng/Khu và Zone đích đã được điền theo thứ tự.', en: 'Building, Floor/Area and Zone are filled in, in that order.' },
    plainBody: { vi: 'Chọn lần lượt Toà → Tầng/Khu → Zone.', en: 'Choose Building → Floor/Area → Zone.' },
    apply: (c) => {
      c.setHoverZone(null)
      c.setTarget(c.demo.target)
    },
  },
  {
    target: 'map-after',
    title: { vi: 'Bản đồ Sau', en: 'After map' },
    body: {
      vi: 'Zone đích tô xanh, vị trí cũ viền đứt, mũi tên chỉ hướng di dời. Cũng có thể click thẳng zone đích trên bản đồ này.',
      en: 'The destination is green, the old spot dashed, an arrow shows the move. You can also click the destination right here.',
    },
    plainBody: { vi: 'Hoặc click thẳng vào zone đích trên bản đồ này.', en: 'Or click the destination zone right on this map.' },
  },
  {
    target: 'route-summary',
    title: { vi: 'Kiểu di dời', en: 'Move type' },
    body: {
      vi: 'Hai máy đổi zone trong cùng tầng nên badge là "Cùng tầng" (xanh). Đổi tầng hoặc Đổi toà hiện màu tím.',
      en: 'Both machines change zone on the same floor, so the badge is "Same floor" (green). Floor or building changes are purple.',
    },
    plainBody: { vi: 'Xanh: Cùng tầng. Tím: Đổi tầng hoặc Đổi toà.', en: 'Green: Same floor. Purple: Floor or Building change.' },
    fallback: 'target-card',
  },
  {
    target: 'map-toolbar',
    title: { vi: 'Chú giải & tuỳ chọn', en: 'Legend & options' },
    body: {
      vi: 'Chú giải giải thích màu trên hai bản đồ; "Xem 3D" mở mô hình 3D. "Đồng bộ zoom" giữ hai bản đồ cùng mức zoom.',
      en: 'The legend explains the colours on both maps; "3D view" opens the 3D model. "Sync zoom" keeps both maps at the same zoom.',
    },
    plainBody: {
      vi: 'Amber là vị trí hiện tại, xanh là vị trí mới, tím là đổi toà/tầng. "Xem 3D" mở mô hình, "Đồng bộ zoom" giữ hai bản đồ cùng mức zoom.',
      en: 'Amber is current, green is new, purple is another building/floor. "3D view" opens the model; "Sync zoom" links both maps.',
    },
  },
  {
    target: 'request-form',
    title: { vi: 'Thông tin & gửi', en: 'Details & submit' },
    body: {
      vi: 'Ngày và lý do đã điền mẫu; nút Gửi bị khoá trong hướng dẫn. Khi gửi thật, hệ thống tạo mã (vd. R0001) và lưu bản vẽ PNG + Excel.',
      en: 'Dates and reason are sample values; Submit is locked during the tour. A real submit creates an ID (e.g. R0001) and saves a PNG drawing + Excel file.',
    },
    plainBody: {
      vi: 'Nhập ngày, lý do rồi bấm Gửi. Hệ thống tạo mã (vd. R0001) và lưu bản vẽ PNG + Excel.',
      en: 'Enter the dates and reason, then Submit. You get an ID (e.g. R0001) plus a saved PNG and Excel file.',
    },
    apply: (c) => c.setForm(c.demo.form),
  },
]
