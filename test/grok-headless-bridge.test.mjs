import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';

import { runWithHeadless } from '../scripts/grok-headless-bridge.mjs';

async function createFakeGrok(directory, response) {
  const scriptPath = join(directory, 'fake-grok.mjs');
  const script = [
    '#!/usr/bin/env node',
    `process.stdout.write(${JSON.stringify(JSON.stringify(response))});`,
  ].join('\n');

  await writeFile(scriptPath, script, 'utf8');
  await chmod(scriptPath, 0o755);
  return scriptPath;
}

test('moves generated media into the project and rewrites the returned path', async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'codex-grok-'));
  const sourceDir = join(tempRoot, 'source');
  const projectDir = join(tempRoot, 'project');
  const mediaPath = join(sourceDir, 'crane.mp4');

  await mkdir(sourceDir);
  await mkdir(projectDir);
  await writeFile(mediaPath, 'video', 'utf8');

  const fakeGrok = await createFakeGrok(tempRoot, {
    text: `![white crane](<${mediaPath}>)`,
  });
  const result = await runWithHeadless('generate a video', {
    cwd: projectDir,
    grokBin: fakeGrok,
  });

  assert.equal(result.mediaPaths.length, 1);
  assert.match(result.mediaPaths[0], new RegExp(`/generated/.+-${basename(mediaPath)}$`));
  assert.equal(result.text, `![white crane](<${result.mediaPaths[0]}>)`);
  assert.equal(result.missingMediaPaths.length, 0);
});

test('reports inaccessible media without crashing the caller', async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'codex-grok-'));
  const projectDir = join(tempRoot, 'project');
  const missingPath = join(tempRoot, 'missing.mp4');

  await mkdir(projectDir);
  const fakeGrok = await createFakeGrok(tempRoot, {
    text: `![missing](<${missingPath}>)`,
  });
  const result = await runWithHeadless('generate a video', {
    cwd: projectDir,
    grokBin: fakeGrok,
  });

  assert.deepEqual(result.mediaPaths, []);
  assert.deepEqual(result.missingMediaPaths, [missingPath]);
});

test('MCP returns a media result instead of closing its transport', async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'codex-grok-'));
  const sourceDir = join(tempRoot, 'source');
  const projectDir = join(tempRoot, 'project');
  const mediaPath = join(sourceDir, 'crane.mp4');

  await mkdir(sourceDir);
  await mkdir(projectDir);
  await writeFile(mediaPath, 'video', 'utf8');
  const fakeGrok = await createFakeGrok(tempRoot, {
    text: `![white crane](<${mediaPath}>)`,
  });

  const serverPath = join(process.cwd(), 'scripts', 'grok-acp-mcp-server.mjs');
  const server = spawn(process.execPath, [serverPath], {
    env: { ...process.env, GROK_PATH: fakeGrok },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let pending = '';
  const response = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('MCP response timed out')), 5_000);
    server.stdout.on('data', (chunk) => {
      pending += chunk.toString();
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        const message = JSON.parse(line);
        if (message.id === 2) {
          clearTimeout(timeout);
          resolve(message);
        }
      }
    });
    server.on('error', reject);
  });

  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })}\n`);
  server.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'grok_generate_video',
      arguments: { prompt: 'a crane walks through a rice field', cwd: projectDir },
    },
  })}\n`);

  try {
    const message = await response;
    assert.equal(message.error, undefined);
    assert.equal(message.result.isError, false);
    assert.match(message.result.content[0].text, /\/generated\//);
  } finally {
    server.kill('SIGTERM');
  }
});
