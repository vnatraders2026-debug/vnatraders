import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'qr-vna.jpeg', 'qr-vna.jpg', 'vna-logo.jpeg', 'vna-logo.jpg'],
      manifest: {
        name: 'VNA Traders - Billing System',
        short_name: 'VNA Traders',
        description: 'VNA Traders - Offline-First Retail Point of Sale System',
        theme_color: '#C2410C',
        background_color: '#F7F7F5',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2,png,jpg,jpeg}'],
        runtimeCaching: [], // No network caching for Supabase; Dexie handles all data offline
      },
    }),
  ],
});
