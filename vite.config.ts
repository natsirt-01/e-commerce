import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const googleClientId = env.GOOGLE_CLIENT_ID?.trim() || ''
  const validGoogleClientId = googleClientId.endsWith('.apps.googleusercontent.com') ? googleClientId : ''
  const clientOrigin = env.CLIENT_ORIGIN?.trim() || 'http://localhost:5173'
  const clientPort = Number(new URL(clientOrigin).port) || 5173
  const apiPort = Number(env.PORT) || 4000
  return {
    plugins: [react()],
    define: {
      __GOOGLE_CLIENT_ID__: JSON.stringify(validGoogleClientId),
    },
    server: {
      port: clientPort,
      strictPort: true,
      allowedHosts: [new URL(clientOrigin).hostname],
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`,
      },
    },
  }
})
