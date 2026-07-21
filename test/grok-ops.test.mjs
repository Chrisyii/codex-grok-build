import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { checkGrok } from '../scripts/grok-ops.mjs';
import { renderSetupReport, renderNativeReviewResult } from '../scripts/lib/render.mjs';

const skillRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

async function createFakeGrok(directory, { stdout = '', exitCode = 0, modelsOk = true } = {}) {
  const scriptPath = join(directory, 'fake-grok.mjs');
  const script = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'models') {
  if (${modelsOk ? 'true' : 'false'}) {
    process.stdout.write('Default model: grok-4.5\\nAvailable models:\\n  * grok-4.5\\n');
    process.exit(0);
  }
  process.stderr.write('not logged in\\n');
  process.exit(1);
}
if (args[0] === 'version' || args[0] === '--version') {
  process.stdout.write('grok 0.0.0-test\\n');
  process.exit(0);
}
process.stdout.write(${JSON.stringify(stdout)});
process.exit(${exitCode});
`;
  await writeFile(scriptPath, script, 'utf8');
  await chmod(scriptPath, 0o755);
  return scriptPath;
}

function callMcp(method, params, env = {}) {
  return new Promise((resolve, reject) => {
    const server = spawn(process.execPath, [join(skillRoot, 'scripts', 'grok-acp-mcp-server.mjs')], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let pending = '';
    const timeout = setTimeout(() => {
      server.kill('SIGTERM');
      reject(new Error('MCP response timed out'));
    }, 8_000);

    server.stdout.on('data', (chunk) => {
      pending += chunk.toString();
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        if (message.id === 2) {
          clearTimeout(timeout);
          server.kill('SIGTERM');
          resolve(message);
        }
      }
    });
    server.on('error', reject);

    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })}\n`);
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method, params })}\n`);
  });
}

test('renderSetupReport marks ready status', () => {
  const text = renderSetupReport({
    ready: true,
    node: { detail: 'v22' },
    grok: { detail: 'ok' },
    auth: { detail: 'logged in' },
    nextSteps: [],
  });
  assert.match(text, /Status: ready/);
});

test('renderNativeReviewResult includes target and stdout', () => {
  const text = renderNativeReviewResult(
    { status: 0, stdout: 'Looks fine.', stderr: '' },
    { reviewLabel: 'Review', targetLabel: 'working tree diff' },
  );
  assert.match(text, /Target: working tree diff/);
  assert.match(text, /Looks fine/);
});

test('checkGrok reports ready when fake grok models succeeds', async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'codex-grok-ops-'));
  const fakeGrok = await createFakeGrok(tempRoot, { modelsOk: true });
  const previous = process.env.GROK_PATH;
  process.env.GROK_PATH = fakeGrok;
  try {
    const result = checkGrok(tempRoot);
    assert.equal(result.ready, true);
    assert.match(result.text, /Status: ready/);
  } finally {
    if (previous === undefined) delete process.env.GROK_PATH;
    else process.env.GROK_PATH = previous;
  }
});

test('MCP tools/list exposes media plus review/critique/run/check', async () => {
  const message = await callMcp('tools/list');
  assert.equal(message.error, undefined);
  const names = message.result.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    'grok_check',
    'grok_critique',
    'grok_generate_image',
    'grok_generate_video',
    'grok_review',
    'grok_run',
  ]);
});

test('MCP grok_check returns setup report text', async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'codex-grok-check-'));
  await mkdir(join(tempRoot, 'project'));
  const fakeGrok = await createFakeGrok(tempRoot, { modelsOk: true });
  const message = await callMcp(
    'tools/call',
    {
      name: 'grok_check',
      arguments: { cwd: join(tempRoot, 'project') },
    },
    { GROK_PATH: fakeGrok },
  );
  assert.equal(message.error, undefined);
  assert.match(message.result.content[0].text, /Grok Build Check/);
});
