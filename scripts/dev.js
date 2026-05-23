#!/usr/bin/env node
/**
 * Dev launcher — starts Vite (renderer) and Electron together, kills both on exit.
 * Cross-platform (macOS, Linux, Windows).
 *
 * Default renderer port is 5174 to avoid colliding with the dataspheres.ai web
 * app (5173) and other common Vite projects. Override with RENDERER_PORT=NNNN.
 */
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const electron = require('electron');
const ROOT = path.join(__dirname, '..');
const PORT = parseInt(process.env.RENDERER_PORT || '5174', 10);
const URL = `http://localhost:${PORT}`;

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.NODE_ENV = 'development';
env.RENDERER_DEV_URL = URL;

let viteProc = null;
let electronProc = null;
let shuttingDown = false;

function waitForPort(port, timeoutMs = 20000) {
  // Try both IPv4 and IPv6 loopback — Vite may bind either depending on Node version.
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryOnce = () => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        if (ok) return resolve();
        if (Date.now() - start > timeoutMs) {
          return reject(new Error(`Vite did not start on port ${port} within ${timeoutMs}ms`));
        }
        setTimeout(tryOnce, 250);
      };
      let pending = 2;
      const probe = (host) => {
        const sock = net.connect({ port, host });
        sock.once('connect', () => { sock.destroy(); finish(true); });
        sock.once('error', () => { sock.destroy(); if (--pending === 0) finish(false); });
      };
      probe('127.0.0.1');
      probe('::1');
    };
    tryOnce();
  });
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (electronProc && !electronProc.killed) {
    try { electronProc.kill('SIGTERM'); } catch {}
  }
  if (viteProc && !viteProc.killed) {
    try { viteProc.kill('SIGTERM'); } catch {}
  }
  setTimeout(() => process.exit(code ?? 0), 200).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

(async () => {
  console.log(`[dev] Starting Vite on port ${PORT}...`);
  viteProc = spawn(npmCmd, ['run', 'dev:renderer', '--', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
    shell: isWindows,
  });
  viteProc.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[dev] Vite exited unexpectedly (code ${code})`);
      shutdown(code ?? 1);
    }
  });

  try {
    await waitForPort(PORT);
  } catch (err) {
    console.error(`[dev] ${err.message}`);
    console.error('[dev] If port is in use by another process (Docker, another Vite project, etc.),');
    console.error(`[dev] re-run with: RENDERER_PORT=5175 npm run dev`);
    shutdown(1);
    return;
  }
  console.log(`[dev] Vite ready at ${URL}. Launching Electron...`);

  electronProc = spawn(
    String(electron),
    [
      '.',
      '--inspect=5858',
      // Chrome DevTools Protocol for the renderer process — lets e2e tools
      // (Playwright) connect to a live dev session for debugging.
      '--remote-debugging-port=9222',
    ],
    {
      cwd: ROOT,
      env,
      stdio: 'inherit',
    },
  );
  electronProc.on('exit', (code) => {
    console.log(`[dev] Electron exited (code ${code})`);
    shutdown(code ?? 0);
  });
})();
