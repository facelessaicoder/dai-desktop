#!/usr/bin/env node
// Reliable dev launcher: deletes ELECTRON_RUN_AS_NODE from the spawned env
// (cross-env only sets it to '' which some Windows environments ignore)
const { spawn } = require('child_process');
const path = require('path');

const electron = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.NODE_ENV = 'development';

const proc = spawn(String(electron), ['.', '--inspect=5858'], {
  cwd: path.join(__dirname, '..'),
  env,
  stdio: 'inherit',
});

proc.on('exit', (code) => process.exit(code ?? 0));
