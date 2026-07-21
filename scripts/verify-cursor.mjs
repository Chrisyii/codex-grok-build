#!/usr/bin/env node
/**
 * Verify grok-build MCP works the way Cursor will call it (stdio JSON-RPC).
 * Does not generate real media.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = join(root, 'scripts', 'grok-acp-mcp-server.mjs');
const EXPECTED_TOOLS = [
  'grok_check',
  'grok_critique',
  'grok_generate_image',
  'grok_generate_video',
  'grok_review',
  'grok_run',
];

function createFakeGrok() {
  const dir = mkdtempSync(join(tmpdir(), 'cursor-grok-verify-'));
  const bin = join(dir, 'fake-grok.mjs');
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'models' || args[0] === 'version' || args[0] === '--version') {
  process.stdout.write('Default model: grok-4.5\\nAvailable models:\\n  * grok-4.5\\n');
  process.exit(0);
}
process.stdout.write('ok\\n');
process.exit(0);
`,
    'utf8',
  );
  chmodSync(bin, 0o755);
  return { dir, bin };
}

function rpc(server, id, method, params) {
  return new Promise((resolve, reject) => {
    let pending = '';
    const onData = (chunk) => {
      pending += chunk.toString();
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.id === id) {
          server.stdout.off('data', onData);
          clearTimeout(timer);
          resolve(message);
        }
      }
    };
    const timer = setTimeout(() => {
      server.stdout.off('data', onData);
      reject(new Error(`timeout waiting for id=${id} method=${method}`));
    }, 10_000);
    server.stdout.on('data', onData);
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

async function main() {
  const fake = createFakeGrok();
  const projectDir = mkdtempSync(join(tmpdir(), 'cursor-grok-project-'));
  mkdirSync(projectDir, { recursive: true });

  const server = spawn(process.execPath, [serverPath], {
    env: { ...process.env, GROK_PATH: fake.bin },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const failures = [];
  try {
    const init = await rpc(server, 1, 'initialize', {});
    if (!init.result?.serverInfo?.name) failures.push('initialize missing serverInfo');

    const listed = await rpc(server, 2, 'tools/list', {});
    const names = (listed.result?.tools || []).map((t) => t.name).sort();
    if (JSON.stringify(names) !== JSON.stringify(EXPECTED_TOOLS)) {
      failures.push(`tools/list mismatch: ${names.join(',')}`);
    }

    const check = await rpc(server, 3, 'tools/call', {
      name: 'grok_check',
      arguments: { cwd: projectDir },
    });
    if (check.error) failures.push(`grok_check error: ${check.error.message}`);
    const checkText = check.result?.content?.[0]?.text || '';
    if (!/Grok Build Check/.test(checkText)) {
      failures.push('grok_check missing setup report');
    }
    if (!/Status: ready/.test(checkText)) {
      failures.push('grok_check not ready with fake grok');
    }

    // Cursor mcp.json shape check if present
    const cursorMcp = join(process.env.HOME, '.cursor', 'mcp.json');
    try {
      const { readFileSync } = await import('node:fs');
      const cfg = JSON.parse(readFileSync(cursorMcp, 'utf8'));
      const entry = cfg?.mcpServers?.['grok-build'];
      if (!entry) {
        failures.push('~/.cursor/mcp.json missing mcpServers.grok-build (run install-cursor.sh)');
      } else if (!Array.isArray(entry.args) || !entry.args[0]?.includes('grok-acp-mcp-server.mjs')) {
        failures.push('grok-build MCP args do not point at grok-acp-mcp-server.mjs');
      } else {
        console.log('✓ ~/.cursor/mcp.json has grok-build');
      }
    } catch {
      failures.push('could not read ~/.cursor/mcp.json');
    }

    // Cursor skill check
    try {
      const { readFileSync, existsSync } = await import('node:fs');
      const skillPath = join(process.env.HOME, '.cursor', 'skills', 'grok-build', 'SKILL.md');
      if (!existsSync(skillPath)) {
        failures.push('missing ~/.cursor/skills/grok-build/SKILL.md');
      } else {
        const body = readFileSync(skillPath, 'utf8');
        if (!/grok_generate_image/.test(body) || !/CallMcpTool|MCP/.test(body)) {
          failures.push('Cursor SKILL.md missing MCP guidance');
        } else {
          console.log('✓ ~/.cursor/skills/grok-build/SKILL.md');
        }
      }
    } catch (error) {
      failures.push(`skill check failed: ${error.message}`);
    }

    if (failures.length) {
      console.error('FAIL');
      for (const item of failures) console.error(` - ${item}`);
      process.exitCode = 1;
    } else {
      console.log('✓ initialize');
      console.log(`✓ tools/list (${names.join(', ')})`);
      console.log('✓ grok_check ready');
      console.log('PASS: Cursor Grok Build MCP verification');
    }
  } finally {
    server.kill('SIGTERM');
    rmSync(fake.dir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
