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
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
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
