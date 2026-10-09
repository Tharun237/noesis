import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config'

// Black padding for maskable/apple icons so Android adaptive icons stay pitch black.
const black = { background: '#000000' }
export default defineConfig({
  preset: {
    ...preset,
    maskable: { ...preset.maskable, resizeOptions: black },
    apple: { ...preset.apple, resizeOptions: black },
  },
  images: ['public/icon.svg'],
})
