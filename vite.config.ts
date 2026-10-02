import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // The browser always calls /api on its own origin; in dev this proxy forwards it to the BE (cookie stays same-origin).
  // VITE_PROXY_TARGET comes from .env / .env.local (see .env.example); no server address is hard-coded here.
  const env = loadEnv(mode, '.', 'VITE_') // '.' = project root (Vite runs from it)
  const target = env.VITE_PROXY_TARGET?.trim() || 'http://localhost:8080'
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
        },
      },
    },
  }
})
