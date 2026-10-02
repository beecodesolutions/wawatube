import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3100',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            if (req.headers.origin === `http://${req.headers.host}`)
              proxyReq.setHeader('origin', 'http://localhost:3100');
          });
        },
      },
    },
  },
});
