import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'icons/*.png'],
      manifest: {
        name: 'Babin Rentals OS',
        short_name: 'Babin',
        id: '/',
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'any',
        /* DESIGN_DIRECTION_SPEC_v4.2 §2.1/§3 — the installed app opens LIGHT,
           so the splash and window chrome are the cream canvas, matching
           index.html's <meta name="theme-color">. These two must be changed
           together with that meta tag: they are what the OS paints BEFORE the
           app has run, and #0F1420 left the installed app flashing a full
           screen of dark navy into a cream app on every cold launch. (#0F1420
           was not even the dark canvas — that is #050B12.) */
        background_color: '#FDEFDC',
        theme_color: '#FDEFDC',
        lang: 'en',
        dir: 'ltr',
        categories: ['business', 'productivity'],
        icons: [
          { src: '/icons/192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          { name: 'Scan', url: '/scan', icons: [{ src: '/icons/scan-96.png', sizes: '96x96' }] },
          { name: 'Today', url: '/today' },
          { name: 'New Rental', url: '/rentals/new' },
          { name: 'Packing', url: '/operations/packing' }
        ]
      },
      workbox: {
        /*
         * Workbox's default `globPatterns` is `**' + '/*.{js,wasm,css,html}` — no
         * font formats. That silently left all 30+ `.woff2`/`.woff` files out of
         * the precache manifest, including `hind-devanagari-*` and
         * `asar-devanagari-*`, while their @font-face stylesheets WERE precached.
         * Offline, the shell painted, the CSS asked for the Devanagari faces, and
         * nothing answered — so Nepali fell back to a system face on the one
         * device class that needs it most. Foundation §3.3 requires Devanagari
         * month names (`साउन`) under the Nepali toggle, and the whole reason the
         * fonts were self-hosted in the first place (4 Aug) was that a CDN
         * `<link>` fails silently in exactly this situation.
         *
         * `ico`/`png`/`svg` join it so the manifest icons and favicon survive a
         * cold offline launch too.
         *
         * Cost: the four self-hosted families are ~740 KB of woff2 in `dist`,
         * which is now downloaded once at install rather than lazily. That is
         * the correct trade for an app whose stated premise is that the
         * warehouse has no signal.
         */
        globPatterns: ['**/*.{js,wasm,css,html,woff,woff2,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/rest\/v1\/(equipment|clients|bundles)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-reference-data',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 7 * 24 * 60 * 60 // 1 week
              }
            }
          },
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/rest\/v1\/(bookings|booking_items)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-operational-data',
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 24 * 60 * 60 // 1 day
              },
              networkTimeoutSeconds: 3
            }
          }
        ]
      }
    })
  ],
  build: {
    /* Explicitly off, not merely defaulted. Rentman ships `*.js.map` with
       `sourcesContent` in its production bundle, which is how the 30 Aug 2026
       forensics pack reconstructed 1,500 of their source paths, their whole
       route tree, and their enum values. Same stack as ours. Keep this pinned
       so no config edit or Capacitor template flips it silently, and re-verify
       the wrapped bundle before any store upload. */
    sourcemap: false,
    rollupOptions: {
      /* Two documents, deliberately. `marketing.html` is the public site; it
         must not pull the ops app's bundle (Supabase, dexie, the router, every
         module) down to a first-time visitor, and its Tailwind stylesheet must
         not reach the app — see src/marketing/marketing.css for why that
         isolation is load-bearing. */
      input: {
        main: path.resolve(__dirname, 'index.html'),
        marketing: path.resolve(__dirname, 'marketing.html'),
      },
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-icons': ['@tabler/icons-react'],
          'vendor-scanner': ['@zxing/browser', '@zxing/library'],
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@babin-rentals/design-tokens': path.resolve(__dirname, './packages/design-tokens/src/index.ts'),
    },
  },
  server: {
    // Managed checkouts can share dependencies; allow their self-hosted fonts.
    fs: { allow: [__dirname, fs.realpathSync(path.resolve(__dirname, 'node_modules'))] },
    port: process.env['PORT'] ? Number(process.env['PORT']) : 3000,
    host: true,
    allowedHosts: [
      '.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.io',
      /* Pinggy hands out a different suffix per tunnel type — a free tunnel
         returns BOTH `*.free.pinggy.net` and `*.run.pinggy-free.link`, and paid
         subdomains land on `*.pinggy.link`. Allow all of them; a missing suffix
         fails as a bare 403 "Blocked request" that looks like a tunnel fault. */
      '.pinggy.net', '.pinggy-free.link', '.pinggy.link', '.pinggy.io', '.pinggy.online',
      '.trycloudflare.com',
    ],
    watch: {
      ignored: ['**/__rar_*', '**/*.rartemp', '**/*.rar', '**/.tmp-*'],
    },
  },
  preview: {
    /* `vite preview` carries its own host check (Vite >= 5.4.12), separate from
       `server.allowedHosts` above. The tunnel hits preview, not dev, whenever the
       offline layer is under test — the dev server registers no service worker at
       all (`devOptions` is unset), so airplane-mode behaviour is only observable
       against a built bundle. */
    allowedHosts: [
      '.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.io',
      /* Pinggy hands out a different suffix per tunnel type — a free tunnel
         returns BOTH `*.free.pinggy.net` and `*.run.pinggy-free.link`, and paid
         subdomains land on `*.pinggy.link`. Allow all of them; a missing suffix
         fails as a bare 403 "Blocked request" that looks like a tunnel fault. */
      '.pinggy.net', '.pinggy-free.link', '.pinggy.link', '.pinggy.io', '.pinggy.online',
      '.trycloudflare.com',
    ],
  },
})
