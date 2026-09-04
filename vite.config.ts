import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'client',
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
  // No dev proxy: apiClient.ts fetches http://localhost:3000 directly (cross-origin,
  // CORS-credentialed) rather than through a same-origin /api prefix — see its own
  // comment. A '/api' proxy rule previously lived here unused, and silently swallowed
  // every request for this project's own client/api/*.ts source modules (Vite serves
  // them at that exact URL under root: 'client'), breaking `pnpm run dev` entirely.
  server: {
    port: 5173,
  },
});
