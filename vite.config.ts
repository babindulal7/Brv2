import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
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
        background_color: '#0F1420',
        theme_color: '#0F1420',
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
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    // Honour an assigned PORT so more than one session can run a dev server;
    // falls back to Vite's default when unset.
    ...(process.env['PORT'] ? { port: Number(process.env['PORT']) } : {}),
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
