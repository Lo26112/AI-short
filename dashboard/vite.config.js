import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      '192.168.1.188',
      'kolforge.ai',
      'www.kolforge.ai'
    ],
    // Kling 等任务常需 60s+，默认代理可能提前断开，拉长等待时间（毫秒）
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        timeout: 600000,
        proxyTimeout: 600000,
      },
      '/static-assets': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      '/workbench-assets': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      '/thumbnails': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      '/gallery': {
        target: 'http://backend:8000',
        changeOrigin: true,
      }
    }
  }
})
