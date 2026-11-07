import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  clearScreen: false,
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src/pulse') } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, watch: { ignored: ['**/src-tauri/**', '**/.local/**'] } },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { target: 'es2020', minify: !process.env.TAURI_ENV_DEBUG ? 'oxc' : false, sourcemap: Boolean(process.env.TAURI_ENV_DEBUG) },
});
