import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

/** Copies pre-built static pages into the output directory after Vite empties it. */
function copyStaticPages(): import('vite').Plugin {
  const pages = ['faq', 'terms'];
  return {
    name: 'copy-static-pages',
    closeBundle() {
      for (const page of pages) {
        const src = path.resolve(__dirname, `static-pages/${page}/index.html`);
        const dest = path.resolve(__dirname, `../webapp_public/${page}/index.html`);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyStaticPages()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: '../webapp_public',
    emptyOutDir: true,
  },
});
