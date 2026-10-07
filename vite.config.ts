import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command, mode }) => {
  // A real build without the database keys would ship an app that cannot
  // save anything. Stop it here; `npm run build:demo` is the backendless build.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  if (command === 'build' && env.VITE_DEMO !== '1') {
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((key) => !env[key])
    if (missing.length) {
      throw new Error(
        `Cannot build without ${missing.join(' and ')}. Copy .env.example to .env and fill them in, ` +
          'or run `npm run build:demo` for the demo.',
      )
    }
  }
  return {
    plugins: [
      react(),
      tailwindcss(),
      // An installable app whose screens are kept on the phone, so it opens with no
      // internet. Records are not cached here: the app keeps those itself.
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: 'Mandi Khata',
          short_name: 'Mandi Khata',
          description: 'Challans, sales, khatay, and cash and bank for an animal mandi, in Roman Urdu and English.',
          lang: 'ur-Latn',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          theme_color: '#2e6a43',
          background_color: '#f4f2ec',
          categories: ['business', 'finance', 'productivity'],
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          // A long press on the icon goes straight to the everyday jobs.
          shortcuts: [
            { name: 'Nayi sale', short_name: 'Sale', url: '/sales/new', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
            { name: 'Naya challan', short_name: 'Challan', url: '/challans/new', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
            { name: 'Khatay', short_name: 'Khatay', url: '/ledgers', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          // Every page of the app opens offline: they are all index.html.
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
        },
      }),
    ],
  }
})
