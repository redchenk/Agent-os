#!/usr/bin/env node
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const nodeBin = process.execPath;
const electronCli = path.join(projectRoot, 'node_modules', 'electron', 'cli.js');

let devProcess = null;
let electronProcess = null;

const frontendReady = await isHttpReady('http://127.0.0.1:5173/');
const bridgeReady = await isHttpReady('http://127.0.0.1:8787/health');

if (!frontendReady || !bridgeReady) {
  devProcess = spawn(nodeBin, [path.join(projectRoot, 'server', 'dev-all.mjs')], {
    cwd: projectRoot,
    stdio: 'inherit',
    windowsHide: true
  });
  await waitForHttp('http://127.0.0.1:5173/', 30000);
  await waitForHttp('http://127.0.0.1:8787/health', 30000);
}

electronProcess = spawn(nodeBin, [electronCli, path.join(projectRoot, 'desktop', 'pet-main.mjs')], {
  cwd: projectRoot,
  stdio: 'inherit',
  windowsHide: false
});

electronProcess.on('exit', (code) => stopAll(code || 0));
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

function stopAll(code = 0) {
  if (electronProcess && !electronProcess.killed) electronProcess.kill();
  if (devProcess && !devProcess.killed) devProcess.kill();
  setTimeout(() => process.exit(code), 120);
}

function isHttpReady(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.setTimeout(900, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isHttpReady(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
