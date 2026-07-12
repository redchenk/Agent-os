#!/usr/bin/env node
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  start('bridge', ['run', 'dev:bridge']),
  start('ui', ['run', 'dev:ui'])
];

let stopping = false;

function start(name, args) {
  const command = process.platform === 'win32' ? 'cmd.exe' : npm;
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', [npm, ...args].join(' ')]
    : args;
  const child = spawn(command, commandArgs, {
    stdio: 'inherit',
    shell: false,
    windowsHide: true
  });

  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(`[dev:${name}] exited with ${code ?? signal}`);
    stopAll(code || 0);
  });

  return child;
}

function stopAll(code = 0) {
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 200);
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
