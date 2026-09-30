// Guide-only data. Images live in src/assets/guide (extracted byte-for-byte from the former inline base64);
// keys (image17…image61) are the original stable IDs referenced by byCat / gallery / appIcons.
import image22 from '../assets/guide/image22.jpg'
import image18 from '../assets/guide/image18.jpg'
import image54 from '../assets/guide/image54.jpg'
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
import image60 from '../assets/guide/image60.jpg'
import image19 from '../assets/guide/image19.jpg'
import image37 from '../assets/guide/image37.jpg'
import image38 from '../assets/guide/image38.jpg'

export const GUIDE_DATA = {
  byCat: {"vehicles": {"qr": "image29", "model": "image26", "full": "image27"}, "buildings": {"qr": "image17", "full": "image18"}, "equipment_building": {"qr": "image19", "full": "image20"}, "copier": {"model": "image21", "full": "image22", "qr": "image33"}, "laptop": {"full": "image23", "qr": "image31"}, "machinery": {"model": "image24", "full": "image25", "qr": "image28"}, "tools_equipment": {"qr": "image35", "model": "image36", "full": "image37"}, "upgrade": {"model": "image44", "full": "image48", "qr": "image49"}, "software": {"full": "image50", "qr": "image61"}},
  gallery: ["image56", "image39", "image40", "image38", "image51", "image52", "image53", "image55"],
  appIcons: {"timemark": "image60", "timestamp": "image54"},
  images: {
    image22,
    image18,
    image54,
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
    image60,
    image19,
    image37,
    image38,
  },
} as const
