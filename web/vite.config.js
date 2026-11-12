import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const worker = 'http://localhost:8787';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { proxy: { '/api': worker, '/frame': worker, '/img': worker } },
});
