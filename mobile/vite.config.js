import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from 'unplugin-vue-components/resolvers'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/', // Capacitor 需要使用相对路径
  plugins: [
    vue(),
    Components({
      resolvers: [VantResolver()]
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: true,
    port: 3000,
    open: true,
    cors: true,
    proxy: {
      // 考生端接口转发到本地后端；后端无全局前缀，路由本身就带 /app，故不 rewrite
      '/app': {
        target: 'http://127.0.0.1:9001',
        changeOrigin: true
      },
      // 上传文件（证书底图、印章等）由后端静态目录直接对外，不带 /app 前缀
      '/uploads': {
        target: 'http://127.0.0.1:9001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  }
})
