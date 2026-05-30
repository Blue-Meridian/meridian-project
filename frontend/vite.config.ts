import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Resolve `@/` → `./src/` without needing @types/node. The Web `URL`
// constructor + import.meta.url are part of the standard ES/DOM lib.
// decodeURI is needed because paths with spaces (e.g. "IBM Hackathon")
// come back URL-encoded ("IBM%20Hackathon") which Vite can't resolve.
const srcDir = decodeURI(new URL('./src', import.meta.url).pathname);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': srcDir,
    },
  },
  server: {
    port: 5173,
  },
});
