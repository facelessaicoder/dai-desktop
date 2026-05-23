#!/usr/bin/env node
/**
 * Postinstall — rebuild native modules against Electron's bundled Node ABI.
 *
 * Without this, fresh clones break immediately: `better-sqlite3` (and any
 * other native modules) get compiled against the system Node version during
 * `npm install`, but Electron ships a different Node ABI. The renderer then
 * crashes with NODE_MODULE_VERSION mismatch errors on first launch.
 *
 * Skipped when running inside electron-builder (which manages its own
 * rebuild) or when CI is explicitly building installers, since the rebuild
 * is then redundant and slow.
 */
'use strict';

const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const SKIP = process.env.DAI_SKIP_NATIVE_REBUILD === '1' || process.env.npm_config_skip_native_rebuild === 'true';

if (SKIP) {
  console.log('[postinstall] DAI_SKIP_NATIVE_REBUILD set, skipping electron-rebuild.');
  process.exit(0);
}

// Only run when @electron/rebuild is installed (i.e. devDeps are present).
const electronRebuildBin = path.join(__dirname, '..', 'node_modules', '.bin', 'electron-rebuild');
if (!fs.existsSync(electronRebuildBin)) {
  console.log('[postinstall] @electron/rebuild not installed (production deps only?). Skipping.');
  process.exit(0);
}

try {
  console.log('[postinstall] Rebuilding native modules against Electron ABI…');
  execSync(`"${electronRebuildBin}" -f -w better-sqlite3`, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
  console.log('[postinstall] ✓ Native modules rebuilt.');
} catch (err) {
  console.warn(
    '[postinstall] electron-rebuild failed — the app may crash at startup ' +
      'with a NODE_MODULE_VERSION mismatch. Run `npm run rebuild:native` ' +
      'manually to retry.',
  );
  console.warn(String(err && err.message ? err.message : err));
  // Don't fail the install — let the user retry with a clear message.
  process.exit(0);
}
