/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180.png'],
      // Registra el service worker también en `npm run dev` — sin esto no hay
      // push (ni botones de aviso, ni emparejamiento de cuidador) en local.
      devOptions: { enabled: true },
      manifest: {
        name: 'Dosi · Tu compañero de medicinas',
        short_name: 'Dosi',
        description: 'Seguimiento de medicamentos y dosis diarias',
        theme_color: '#c2530a',
        background_color: '#f4efe6',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        importScripts: ['push-sw.js'],
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // El stack de jsPDF (~776 KiB, ~57% del precache) solo se usa al generar
        // el PDF del médico. Se saca del precache y se cachea en runtime la
        // primera vez que se usa de verdad.
        globIgnores: ['**/pdf-*.js'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/pdf-[^/]+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdf-lib',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Nombre determinista para el chunk del PDF → workbox lo puede excluir
        // del precache por patrón (`pdf-*.js`).
        manualChunks(id: string) {
          if (/node_modules\/(jspdf|html2canvas|canvg|dompurify|core-js|raf|rgbcolor)\//.test(id)) {
            return 'pdf';
          }
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
