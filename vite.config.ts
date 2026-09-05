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
  // No dev proxy: a previous '/api' proxy rule silently swallowed every request for
  // this project's own client/api/*.ts source modules (served at that exact URL under
  // root: 'client'), breaking `pnpm run dev` entirely. apiClient.ts fetches
  // http://localhost:3000 directly instead.
  server: {
    port: 5173,
  },
});
