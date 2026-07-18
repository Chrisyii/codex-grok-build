#!/usr/bin/env node
/**
 * MCP server exposing Grok Build to Codex.
 *
 * Media tools require an absolute cwd so every completed file has a
 * deterministic destination: <cwd>/generated/.
 */

import { createInterface } from 'node:readline';
import { isAbsolute } from 'node:path';

import { runWithHeadless } from './grok-headless-bridge.mjs';

const rl = createInterface({ input: process.stdin });
const MEDIA_TOOLS = new Set(['grok_generate_image', 'grok_generate_video']);

function sendResponse(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function sendError(id, code, message) {
  process.stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  })}\n`);
}

function requirePrompt(prompt) {
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    throw new Error('prompt must be a non-empty string');
  }
  return prompt.trim();
}

function requireProjectDirectory(cwd) {
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) {
    throw new Error('cwd must be an absolute project path');
  }
  return cwd;
}

function formatMediaPrompt(name, prompt, args) {
  if (name === 'grok_generate_image') {
    const aspectRatio = args.aspect_ratio || '1:1';
    return `${prompt}\n\n请使用 Grok Build 的 image_gen 工具生成图片（aspect_ratio: ${aspectRatio}）。`;
  }

  if (args.base_image) {
    if (typeof args.base_image !== 'string' || !isAbsolute(args.base_image)) {
      throw new Error('base_image must be an absolute file path');
    }
    return `使用提供的图片 ${args.base_image} 作为首帧。\n${prompt}\n请使用 image_to_video 生成 6 秒短片。`;
  }
  return `${prompt}\n\n请使用 Grok Build 的 image_to_video 生成 6 秒短片。`;
}

function getTools() {
  return [
    {
      name: 'grok_generate_image',
      description: '使用登录的 Grok Build 生成图片。cwd 必须是当前项目的绝对路径；生成文件会移动到该项目的 generated/ 目录。',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          aspect_ratio: { type: 'string', default: '1:1' },
          cwd: { type: 'string', description: '当前 Codex 项目的绝对路径' },
        },
        required: ['prompt', 'cwd'],
      },
    },
    {
      name: 'grok_generate_video',
      description: '使用登录的 Grok Build 生成视频。cwd 必须是当前项目的绝对路径；生成文件会移动到该项目的 generated/ 目录。',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          base_image: { type: 'string', description: '可选，上一张图片的绝对路径' },
          cwd: { type: 'string', description: '当前 Codex 项目的绝对路径' },
        },
        required: ['prompt', 'cwd'],
      },
    },
    {
      name: 'grok_run',
      description: '把任意任务委托给 Grok Build agent 执行。',
      inputSchema: {
        type: 'object',
        properties: { prompt: { type: 'string' } },
        required: ['prompt'],
      },
    },
  ];
}

async function handleToolCall(name, args) {
  if (!MEDIA_TOOLS.has(name) && name !== 'grok_run') {
    throw new Error(`Unknown tool: ${name}`);
  }

  const prompt = requirePrompt(args.prompt);
  const isMediaTool = MEDIA_TOOLS.has(name);
  const cwd = isMediaTool ? requireProjectDirectory(args.cwd) : process.cwd();
  const taskPrompt = isMediaTool
    ? formatMediaPrompt(name, prompt, args)
    : `${prompt}\n\n执行完毕后，如果产生了媒体文件，请报告绝对路径。`;
  const result = await runWithHeadless(taskPrompt, { cwd });

  if (isMediaTool && result.mediaPaths.length === 0) {
    const missing = result.missingMediaPaths.length > 0
      ? ` Reported but inaccessible paths: ${result.missingMediaPaths.join(', ')}`
      : '';
    throw new Error(`Grok completed without an accessible generated media file.${missing}`);
  }

  const content = [];
  if (result.text) content.push({ type: 'text', text: result.text });
  for (const mediaPath of result.mediaPaths) {
    content.push({ type: 'text', text: `已生成文件: ${mediaPath}` });
  }
  if (content.length === 0) {
    content.push({ type: 'text', text: '执行完成（无额外输出）' });
  }

  return { content, isError: false };
}

rl.on('line', async (line) => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }

  if (request.method === 'initialize') {
    sendResponse(request.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'grok-build', version: '0.2.0' },
    });
    return;
  }

  if (request.method === 'tools/list') {
    sendResponse(request.id, { tools: getTools() });
    return;
  }

  if (request.method === 'tools/call') {
    try {
      const { name, arguments: args = {} } = request.params || {};
      sendResponse(request.id, await handleToolCall(name, args));
    } catch (error) {
      sendError(request.id, -32000, `Grok Build 执行失败: ${error.message}`);
    }
    return;
  }

  if (request.id !== undefined) sendResponse(request.id, null);
});

console.error('[grok-build-mcp] Ready');
