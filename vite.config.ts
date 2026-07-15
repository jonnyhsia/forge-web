import { copyFile } from 'node:fs/promises'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.VITE_BASE_PATH ?? '/'
const pwaCacheId = 'forge-pwa-v1'

function githubPagesSpaFallback(): Plugin {
  return {
    name: 'github-pages-spa-fallback',
    apply: 'build',
    async closeBundle() {
      await copyFile('dist/index.html', 'dist/404.html')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    githubPagesSpaFallback(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        id: base,
        name: 'Forge 训练',
        short_name: 'Forge',
        description: '离线可用的训练计划、记录与统计工具',
        lang: 'zh-CN',
        start_url: base,
        scope: base,
        display: 'standalone',
        theme_color: '#0d0d0d',
        background_color: '#0d0d0d',
        categories: ['fitness', 'health'],
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cacheId: pwaCacheId,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        globIgnores: ['**/pwa-192.png', '**/pwa-512.png'],
        globPatterns: ['**/*.{js,css,html,svg,png,ico,ttf,woff,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
})
