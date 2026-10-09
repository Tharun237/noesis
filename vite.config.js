import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { handleFetch } from './functions/api/fetch.js'
import pkg from './package.json' with { type: 'json' }

// Cross-origin isolation unlocks SharedArrayBuffer → multithreaded WASM inference.
// `credentialless` (not require-corp) so model downloads from huggingface.co still work.
// Production gets the same headers from public/_headers (Cloudflare Pages).
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

// Dev only: serve the exact handler Cloudflare Pages runs at /api/fetch in production.
const apiInDev = {
  name: 'noesis-api',
  configureServer(server) {
    server.middlewares.use('/api/fetch', async (req, res) => {
      const r = await handleFetch(new Request('http://localhost' + req.originalUrl))
      res.statusCode = r.status
      r.headers.forEach((v, k) => res.setHeader(k, v))
      res.end(Buffer.from(await r.arrayBuffer()))
    })
  },
}

export default defineConfig({
  plugins: [
    react(),
    apiInDev,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        id: '/',
        name: 'Noesis',
        short_name: 'Noesis',
        description: 'Listen to any document. Free, private, on-device text to speech.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#000000',
        theme_color: '#000000',
        categories: ['education', 'productivity', 'books'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Android "Share → Noesis" for links and text.
        share_target: { action: '/', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
        // Desktop: "Open with → Noesis" for documents.
        file_handlers: [{
          action: '/',
          accept: {
            'application/pdf': ['.pdf'],
            'application/epub+zip': ['.epub'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'text/markdown': ['.md'],
            'text/plain': ['.txt'],
            'text/html': ['.html', '.htm'],
          },
        }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,mjs}'],
        globIgnores: ['pdfjs/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        // Model weights + voices are cached by transformers.js / kokoro-js themselves (Cache Storage).
        runtimeCaching: [{
          // The 21 MB ONNX runtime WASM is too big to precache; cache it the first time the engine loads.
          urlPattern: ({ url }) => url.pathname.endsWith('.wasm'),
          handler: 'CacheFirst',
          options: { cacheName: 'noesis-wasm' },
        }, {
          // pdf.js CMaps / standard fonts / image decoders (self-hosted under /pdfjs/), cached on first use.
          urlPattern: ({ url }) => url.pathname.startsWith('/pdfjs/'),
          handler: 'CacheFirst',
          options: { cacheName: 'noesis-pdfjs' },
        }],
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  worker: { format: 'es' },
  server: { headers: isolation },
  preview: { headers: isolation },
  build: { target: 'es2022' },
})
