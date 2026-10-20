import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** /version.json: diz qual commit está no ar e serve para testar se o site responde. */
function versionFile(): Plugin {
  const body = () => JSON.stringify({ commit: process.env.COMMIT_REF ?? 'local', builtAt: new Date().toISOString() })
  return {
    name: 'hotelflow-version-file',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(body())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: body() })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    versionFile(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Millenium Hotel · HotelFlow',
        short_name: 'HotelFlow',
        description: 'Sistema de gestão do Millenium Hotel',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#002E2F',
        background_color: '#002E2F',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/version\.json$/],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
