import { useEffect, useState } from 'react'
import type { PaletteMode } from '@mui/material'

const STORAGE_KEY = 'f2-theme'

function readStoredMode(): PaletteMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Light/dark mode persisted under the same key the legacy UI used. */
export function useThemeMode() {
  const [mode, setMode] = useState<PaletteMode>(readStoredMode)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // Storage unavailable (private mode / blocked); theme still works for this session.
    }
  }, [mode])

  const toggleMode = () => setMode((m) => (m === 'dark' ? 'light' : 'dark'))
  return { mode, toggleMode }
}
