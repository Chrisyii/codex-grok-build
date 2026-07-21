#!/usr/bin/env node
/**
 * Merge grok-build into ~/.cursor/mcp.json without clobbering other servers.
 *
 * Env:
 *   CURSOR_MCP_JSON  path to mcp.json
 *   GROK_MCP_SERVER  absolute path to grok-acp-mcp-server.mjs
 *   GROK_BIN         absolute path to grok binary
 */

import fs from 'node:fs';

const mcpPath = process.env.CURSOR_MCP_JSON;
const serverPath = process.env.GROK_MCP_SERVER;
const grokBin = process.env.GROK_BIN;

if (!mcpPath || !serverPath || !grokBin) {
  console.error('CURSOR_MCP_JSON, GROK_MCP_SERVER, and GROK_BIN are required');
  process.exit(1);
}

const raw = fs.existsSync(mcpPath) ? fs.readFileSync(mcpPath, 'utf8') : '{"mcpServers":{}}';
const config = JSON.parse(raw || '{"mcpServers":{}}');
if (!config.mcpServers || typeof config.mcpServers !== 'object') {
  config.mcpServers = {};
}

config.mcpServers['grok-build'] = {
  command: 'node',
  args: [serverPath],
  env: {
    GROK_PATH: grokBin,
  },
};

fs.writeFileSync(mcpPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log('  ✓ mcpServers.grok-build 已写入');
