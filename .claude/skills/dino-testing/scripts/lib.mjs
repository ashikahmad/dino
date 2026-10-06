// Shared helpers for the browser tests: start the servers, launch Chromium, wait for things.
// Chromium comes from CHROMIUM_PATH, or /opt/pw-browsers/chromium if it exists, or Playwright's own
// download (`npx playwright-core install chromium`).

import { chromium } from 'playwright-core';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import net from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  return new Promise((ok, fail) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
    s.on('error', fail);
  });
}

async function waitForUrl(url, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function run(cmd, args, env = {}) {
  const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'ignore' });
  return { stop: () => child.kill() };
}

/** The Vite dev server (type-checks nothing, serves src/ as it is). */
export async function startDev() {
  const port = await freePort();
  const p = run(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', 'localhost']);
  const url = `http://localhost:${port}`;
  await waitForUrl(url);
  return { url, stop: p.stop };
}

/** Build the game, then run the host server (server/host.mjs) that serves it and relays a race. */
export async function startHost() {
  // vite.config.ts builds for the /dino/ sub-path of GitHub Pages when GITHUB_ACTIONS is set (as in CI);
  // the test host serves the game from the root, so build without it
  const env = { ...process.env };
  delete env.GITHUB_ACTIONS;
  execFileSync(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--logLevel', 'error'], { cwd: ROOT, env });
  const port = await freePort();
  const p = run(process.execPath, ['server/host.mjs'], { PORT: String(port) });
  const url = `http://localhost:${port}`;
  await waitForUrl(`${url}/lan.json`);
  return { url, stop: p.stop };
}

/** dist/ served as plain static files, like GitHub Pages: no /lan.json and no relay. */
export async function startStatic() {
  const dist = join(ROOT, 'dist');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = normalize(join(dist, path === '/' ? 'index.html' : path));
      if (!file.startsWith(dist + sep)) throw new Error('outside');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<h1>Not found</h1>');
    }
  });
  const port = await freePort();
  await new Promise((ok) => server.listen(port, '127.0.0.1', ok));
  return { url: `http://localhost:${port}`, stop: () => server.close() };
}

export async function launch() {
  const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  return chromium.launch({
    executablePath,
    // software WebGL so it also runs without a GPU; no proxy so LAN-style addresses work
    args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-proxy-server'],
  });
}

/** A new page in its own browser context. Uncaught page errors are collected in `page.errors`. */
export async function openPage(browser, url, options = {}) {
  const context = await browser.newContext({ viewport: { width: 900, height: 640 }, ...options });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.dino, null, { timeout: 10000 });
  await sleep(300);
  return page;
}

/** Let the dino run into the first obstacle (no jumping) and wait for the crash. */
export async function crash(page, timeout = 40000) {
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.dino.status === 'crashed', null, { timeout, polling: 50 });
}

export const game = (page) => page.evaluate(() => ({ status: window.dino.status, score: window.dino.score, race: window.dino.race }));
