import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // Reads .env / .env.local in this folder (the website's settings; the server has its own in server/.env).
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const api = env.VITE_API_PROXY || 'http://localhost:4000';
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    // The backend lives in ./server and has its own tests; the website ignores it.
    test: { include: ['test/**/*.test.js'] },
    server: {
      port: 5173,
      watch: { ignored: ['**/server/**'] },
      proxy: { '/api': api, '/uploads': api, '/sitemap.xml': api, '/robots.txt': api },
    },
    build: {
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/](three|@react-three)[\\/]/.test(id)) return 'three';
            if (/[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/.test(id)) return 'charts';
            if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react';
            return undefined;
          },
        },
      },
    },
  };
});
