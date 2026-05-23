#!/usr/bin/env node
/**
 * dai-desktop doctor — diagnostic checks for the local install.
 *
 * Runs a battery of pass/fail checks across the install, native modules,
 * build artifacts, and required assets. Each failure prints a one-line fix.
 *
 * Exits 0 if everything passes, 1 otherwise (suitable for CI gating).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

let failed = 0;
let warned = 0;
let passed = 0;

function check(label, ok, fix, isWarning = false) {
  if (ok) {
    console.log(`  ${GREEN}✓${RESET} ${label}`);
    passed++;
  } else if (isWarning) {
    console.log(`  ${YELLOW}⚠${RESET} ${label}`);
    if (fix) console.log(`     ${DIM}${fix}${RESET}`);
    warned++;
  } else {
    console.log(`  ${RED}✗${RESET} ${label}`);
    if (fix) console.log(`     ${DIM}fix: ${fix}${RESET}`);
    failed++;
  }
}

function tryCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function compareSemver(a, b) {
  const pa = a.split('.').map((x) => parseInt(x, 10));
  const pb = b.split('.').map((x) => parseInt(x, 10));
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

console.log(`\n${BOLD}dai-desktop doctor${RESET}  ${DIM}— diagnosing local install${RESET}\n`);

// ── Runtime ──────────────────────────────────────────────────────────────
console.log(`${BOLD}Runtime${RESET}`);
const nodeV = process.versions.node;
check(`Node.js ${nodeV} (≥ 20.0.0)`, compareSemver(nodeV, '20.0.0') >= 0, 'install Node 20+ from https://nodejs.org');
const npmV = tryCmd('npm --version');
check(`npm ${npmV || '(missing)'} (≥ 10.0.0)`, npmV && compareSemver(npmV, '10.0.0') >= 0, 'npm install -g npm@latest');

// ── Dependencies ─────────────────────────────────────────────────────────
console.log(`\n${BOLD}Dependencies${RESET}`);
check('node_modules/ present', fs.existsSync(path.join(ROOT, 'node_modules')), 'npm install');
check(
  'packages/dai-core/node_modules linked',
  fs.existsSync(path.join(ROOT, 'packages', 'dai-core', 'node_modules')) ||
    fs.existsSync(path.join(ROOT, 'node_modules', '@dai-desktop', 'core')),
  'npm install',
);
check(
  'electron-rebuild available',
  fs.existsSync(path.join(ROOT, 'node_modules', '.bin', 'electron-rebuild')),
  'npm install',
);

// ── Native modules ───────────────────────────────────────────────────────
console.log(`\n${BOLD}Native modules${RESET}`);
const sqliteNative = path.join(ROOT, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
check('better-sqlite3 binding compiled', fs.existsSync(sqliteNative), 'npm run rebuild:native');

// ── Build artifacts ──────────────────────────────────────────────────────
console.log(`\n${BOLD}Build artifacts${RESET}`);
check('dist/main.js (compiled main process)', fs.existsSync(path.join(ROOT, 'dist', 'main.js')), 'npm run build:main');
check(
  'dist/renderer/index.html (built renderer)',
  fs.existsSync(path.join(ROOT, 'dist', 'renderer', 'index.html')),
  'npm run build:renderer',
);
check(
  'packages/dai-core/dist/ (built core)',
  fs.existsSync(path.join(ROOT, 'packages', 'dai-core', 'dist', 'index.js')),
  'npm run build:core',
);
check(
  'packages/planner-panel/dist/index.html (built planner)',
  fs.existsSync(path.join(ROOT, 'packages', 'planner-panel', 'dist', 'index.html')),
  'npm run build:planner',
);

// ── Assets ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}Assets${RESET}`);
check('assets/icon.icns (macOS app icon)', fs.existsSync(path.join(ROOT, 'assets', 'icon.icns')), 'python3 /path/to/make_icon.py');
check('assets/icon.png (Linux + runtime icon)', fs.existsSync(path.join(ROOT, 'assets', 'icon.png')), 'python3 /path/to/make_icon.py');
check('assets/icon.ico (Windows app icon)', fs.existsSync(path.join(ROOT, 'assets', 'icon.ico')), 'regenerate from icon.png');

// ── Config ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}Config${RESET}`);
const pkgJsonPath = path.join(ROOT, 'package.json');
let pkg = null;
try {
  pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  check('package.json valid JSON', true);
} catch {
  check('package.json valid JSON', false, 'check for syntax errors');
}
if (pkg) {
  check('package.json productName set', pkg.productName === 'Dataspheres AI', 'productName should be "Dataspheres AI"');
  check('package.json build.publish set', Array.isArray(pkg.build?.publish) && pkg.build.publish.length > 0, 'add GitHub publish config');
  check('package.json build.protocols includes dataspheres', !!pkg.build?.protocols?.some?.((p) => p.schemes?.includes?.('dataspheres')), 'add dataspheres:// scheme');
}

// ── Settings (runtime) ───────────────────────────────────────────────────
console.log(`\n${BOLD}Settings${RESET}`);
const userDataPath =
  process.platform === 'darwin'
    ? path.join(process.env.HOME || '', 'Library', 'Application Support', 'Dataspheres AI')
    : process.platform === 'win32'
    ? path.join(process.env.APPDATA || '', 'Dataspheres AI')
    : path.join(process.env.HOME || '', '.config', 'Dataspheres AI');
const settingsPath = path.join(userDataPath, 'settings.json');
const settingsExists = fs.existsSync(settingsPath);
check(
  `settings.json (${DIM}${settingsPath}${RESET})`,
  settingsExists,
  'launch the app once — created automatically on first save',
  true,
);
if (settingsExists) {
  try {
    const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const hasKey = !!(s.cloudApiKey || s.dataspheres_api_key);
    check(
      'Dataspheres API key configured',
      hasKey,
      'launch the app and sign in (Welcome screen)',
      true,
    );
  } catch {
    check('settings.json parses', false, 'delete and re-launch');
  }
}

// ── Summary ──────────────────────────────────────────────────────────────
console.log('');
console.log(`${BOLD}${passed} passed${RESET}${warned ? `, ${YELLOW}${warned} warning${warned === 1 ? '' : 's'}${RESET}` : ''}${failed ? `, ${RED}${failed} failed${RESET}` : ''}`);
if (failed === 0) {
  console.log(`\n${GREEN}All required checks passed.${RESET}\n`);
  process.exit(0);
} else {
  console.log(`\n${RED}${failed} check${failed === 1 ? '' : 's'} failed.${RESET}  Try ${BOLD}npm run bootstrap${RESET} to fix most issues.\n`);
  process.exit(1);
}
