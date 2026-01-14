import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:12306',
      '/auth': 'http://localhost:12306',
      '/sonarr': 'http://localhost:12306',
      '/proxy': 'http://localhost:12306',
      '/RSS': 'http://localhost:12306',
    },
  },
});
