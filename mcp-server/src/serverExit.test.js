import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const INDEX = fileURLToPath(new URL('./index.js', import.meta.url));
const home = mkdtempSync(join(tmpdir(), 'fileforge-exit-'));
const started = [];

after(() => {
  started.forEach((child) => child.kill('SIGKILL'));
  rmSync(home, { recursive: true, force: true });
});

function startServer(port) {
  const child = spawn(process.execPath, [INDEX], {
    env: { ...process.env, HOME: home, USERPROFILE: home, FILEFORGE_WS_PORT: String(port) },
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  started.push(child);
  child.exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  child.ready = new Promise((resolve, reject) => {
    let log = '';
    child.stderr.on('data', (chunk) => {
      log += chunk;
      if (log.includes('MCP server ready')) resolve();
    });
    child.exited.then((code) => reject(new Error(`server exited with ${code} before it was ready:\n${log}`)));
  });
  return child;
}

async function assertExitsWithin(child, ms) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve('still running'), ms));
  assert.equal(await Promise.race([child.exited, timeout]), 0);
}

function randomPort() {
  return 40000 + Math.floor(Math.random() * 20000);
}

test('the server keeps running while stdin is open and exits when it closes', async () => {
  const child = startServer(randomPort());
  await child.ready;

  const early = await Promise.race([child.exited, new Promise((resolve) => setTimeout(() => resolve('running'), 1000))]);
  assert.equal(early, 'running');

  child.stdin.end();
  await assertExitsWithin(child, 5000);
});

test('exiting releases the bridge port', async () => {
  const port = randomPort();
  const child = startServer(port);
  await child.ready;
  child.stdin.end();
  await assertExitsWithin(child, 5000);

  const wss = new WebSocketServer({ port, host: '127.0.0.1' });
  await new Promise((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });
  await new Promise((resolve) => wss.close(resolve));
});
