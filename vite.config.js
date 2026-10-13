import { defineConfig } from 'vite'
import { PLAIN_PAGES } from './tools/pages.mjs' // writes the plain search pages into public/ as it is read, and names them
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { handleFetch } from './functions/api/fetch.js'
import { handleDevDrive } from './server/devdrive.js'
import { handleAuth } from './server/auth.js'
import pkg from './package.json' with { type: 'json' }

// This build's stamp: shown in Settings, and written to /version.json so a running app can ask what the newest
// build is without asking its own service worker (src/lib/updates.js).
const BUILD = new Date().toISOString()
const versionFile = {
  name: 'noesis-version',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD, version: pkg.version }) }) },
}

// Cross-origin isolation unlocks SharedArrayBuffer → multithreaded WASM inference.
// `credentialless` (not require-corp) so model downloads from huggingface.co still work.
// Production gets the same headers from public/_headers (Cloudflare Pages).
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

// Dev only: serve the exact handlers Cloudflare Pages runs in production (their settings come from
// .dev.vars through wrangler), plus a stand-in for Google Drive so sync can be run and tested without Google.
const apiInDev = {
  name: 'noesis-api',
  async configureServer(server) {
    const { getPlatformProxy } = await import('wrangler')
    const { env } = await getPlatformProxy()
    const route = (path, handler) => server.middlewares.use(path, async (req, res) => {
      const chunks = []
      for await (const c of req) chunks.push(c)
      const body = chunks.length ? Buffer.concat(chunks) : undefined
      const r = await handler(new Request('http://localhost' + req.originalUrl, { method: req.method, headers: req.headers, body }), env)
      res.statusCode = r.status
      r.headers.forEach((v, k) => res.setHeader(k, v))
      res.end(Buffer.from(await r.arrayBuffer()))
    })
    route('/api/fetch', req => handleFetch(req))
    route('/api/auth', handleAuth)
    route('/api/devdrive', handleDevDrive)
  },
}

// the plain pages people arrive at from a search (tools/pages.mjs): files of their own, not screens of the app
const PLAIN = new RegExp(`^/(${PLAIN_PAGES.join('|')})(/|$|\\.html$)`)

export default defineConfig({
  plugins: [
    react(),
    apiInDev,
    versionFile,
    VitePWA({
      registerType: 'prompt', // we choose a safe moment to switch versions (src/lib/updates.js)
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        id: '/',
        name: 'Noesis',
        short_name: 'Noesis',
        description: 'Listen deeper. Any document as natural audio, generated on your own device.',
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
        globIgnores: ['pdfjs/**', 'dict/**', 'ort/**', 'espeak/**', 'translate/**'],
        importScripts: ['notify-sw.js'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//, /^\/privacy/, /^\/listen-to-pdf/, /^\/alternatives/, PLAIN, /^\/robots\.txt$/, /^\/sitemap\.xml$/], // the privacy page is a file of its own, not a screen of the app
        // Voices are cached by the voice worker itself (Cache Storage 'noesis-voices').
        runtimeCaching: [{
          // The 11 MB ONNX runtime WASM is too big to precache; cache it the first time the engine loads.
          urlPattern: ({ url }) => url.pathname.endsWith('.wasm'),
          handler: 'CacheFirst',
          options: { cacheName: 'noesis-wasm' },
        }, {
          // pdf.js CMaps / standard fonts / image decoders (self-hosted under /pdfjs/), cached on first use.
          urlPattern: ({ url }) => ['/pdfjs/', '/dict/', '/ort/', '/espeak/'].some(p => url.pathname.startsWith(p)),
          handler: 'CacheFirst',
          options: { cacheName: 'noesis-pdfjs' },
        }],
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_BUILD__: JSON.stringify(BUILD) },
  worker: { format: 'es' },
  server: { headers: isolation },
  preview: { headers: isolation },
  // Motion is a file of its own: the app's own code can then change without the customer fetching the
  // animation library again (and where the bundler puts it no longer depends on what happens to import what).
  build: { target: 'es2022', rollupOptions: { output: { manualChunks: id => (/node_modules[\/](framer-motion|motion-dom|motion-utils|motion)[\/]/.test(id) ? 'motion' : undefined) } } },
})
