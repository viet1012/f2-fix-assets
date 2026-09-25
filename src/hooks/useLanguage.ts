import { useEffect, useState } from 'react'
import type { Lang } from '../types/fixedAsset'

export function useLanguage(initial: Lang = 'vi') {
  const [lang, setLang] = useState<Lang>(initial)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const toggleLang = () => setLang((x) => (x === 'vi' ? 'en' : 'vi'))
  return { lang, setLang, toggleLang }
}
