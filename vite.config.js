import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { cp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { API_ORIGIN, LOCAL_API_ORIGIN } from './src/config/api.js'

function copyPublicAssets() {
  let config
  return {
    name: 'copy-public-assets',
    apply: 'build',
    configResolved(resolved) { config = resolved },
    async closeBundle() {
      if (!config.publicDir || !existsSync(config.publicDir)) return
      // Keep uploaded files, including payment slips, on the backend.
      await cp(config.publicDir, path.resolve(config.root, config.build.outDir), {
        recursive: true,
        filter: (source) => path.relative(config.publicDir, source).split(path.sep)[0] !== 'uploads',
      })
    },
  }
}

function backendProxy(target, prefix = '') {
  return {
    target,
    changeOrigin: true,
    rewrite: (url) => prefix ? url.slice(prefix.length) : url,
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq) => {
        // Requests from the local dev proxy are server-to-server requests.
        proxyReq.removeHeader('origin')
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), copyPublicAssets()],
  build: { copyPublicDir: false },
  server: {
    proxy: {
      '/__api/vps': backendProxy(API_ORIGIN, '/__api/vps'),
      '/__api/local': backendProxy(LOCAL_API_ORIGIN, '/__api/local'),
      '/api': backendProxy(API_ORIGIN),
    },
  },
})
