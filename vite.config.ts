import { defineConfig } from 'vite';

// Served from https://<user>.github.io/dino/ on GitHub Pages.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/dino/' : '/',
});
