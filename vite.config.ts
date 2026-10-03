import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Served from https://<user>.github.io/dino/ on GitHub Pages.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/dino/' : '/',
  define: { __APP_VERSION__: JSON.stringify(version) },
});
