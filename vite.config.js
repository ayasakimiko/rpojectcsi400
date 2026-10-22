import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { cp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { API_ORIGIN, LOCAL_API_ORIGIN } from './src/config/api.js'
import { SERVICE_PORTS } from './src/config/serviceRoutes.js'

function copyPublicAssets() {
  let config
  return {
    name: 'copy-public-assets',
    apply: 'build',
    configResolved(resolved) { config = resolved },
    async closeBundle() {
      if (!config.publicDir || !existsSync(config.publicDir)) return
      await cp(config.publicDir, path.resolve(config.root, config.build.outDir), {
        recursive: true,
        filter: (source) => path.relative(config.publicDir, source).split(path.sep)[0] !== 'uploads',
      })
    },
  }
}

function blockPrivateUploads() {
  return {
    name: 'block-private-uploads',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let pathname = (req.url || '').split(/[?#]/, 1)[0]
        try {
          pathname = decodeURIComponent(pathname)
        } catch {
          pathname = ''
        }
        if (!/^\/+uploads\/+contracts(\/|$)/i.test(pathname.replaceAll('\\', '/')) && pathname) return next()
        res.statusCode = 404
        res.end()
      })
    },
  }
}

function backendProxy(target, prefix = '', { keepOrigin = false } = {}) {
  return {
    target,
    changeOrigin: true,
    rewrite: (url) => prefix ? url.slice(prefix.length) : url,
    configure(proxy) {
      if (keepOrigin) return
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.removeHeader('origin')
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), copyPublicAssets(), blockPrivateUploads()],
  build: { copyPublicDir: false },
  server: {
    proxy: {
      '/__api/vps': backendProxy(API_ORIGIN, '/__api/vps', { keepOrigin: true }),
      ...Object.fromEntries(Object.entries(SERVICE_PORTS).map(([name, port]) => [
        `/__api/local/direct/${name}`,
        backendProxy(`http://127.0.0.1:${port}`, `/__api/local/direct/${name}`),
      ])),
      '/__api/local': backendProxy(LOCAL_API_ORIGIN, '/__api/local'),
      '/api': backendProxy(API_ORIGIN, '', { keepOrigin: true }),
    },
  },
})
