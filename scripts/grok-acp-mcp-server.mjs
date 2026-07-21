#!/usr/bin/env node
/**
 * MCP server exposing Grok Build to Codex.
 *
 * Media tools require an absolute cwd so every completed file has a
 * deterministic destination: <cwd>/generated/.
 *
 * Agent tools (check / review / critique / run) are adapted from the
 * xAI Claude Code plugin and share this same MCP surface.
 */

import { createInterface } from 'node:readline';
import { isAbsolute } from 'node:path';

import { runWithHeadless } from './grok-headless-bridge.mjs';
import { checkGrok, critiqueCode, reviewCode, runTask } from './grok-ops.mjs';

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

function optionalAbsoluteCwd(cwd) {
  if (cwd == null || cwd === '') return process.cwd();
  return requireProjectDirectory(cwd);
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

function textResult(text, extraLines = []) {
  const content = [{ type: 'text', text: String(text ?? '').trimEnd() || '执行完成（无额外输出）' }];
  for (const line of extraLines) {
    content.push({ type: 'text', text: line });
  }
  return { content, isError: false };
}

function getTools() {
  return [
    {
      name: 'grok_check',
      description: '检查本机 Node、Grok CLI 与登录态是否就绪。',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: '可选，绝对项目路径' },
        },
      },
    },
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
      name: 'grok_review',
      description: '只读审查本地 git 变更（working tree 或相对 base 分支）。不修改文件。',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: '当前项目绝对路径' },
          base: { type: 'string', description: '可选，对比的 base ref，例如 main' },
          scope: {
            type: 'string',
            description: 'auto | working-tree | branch',
            default: 'auto',
          },
          focus: { type: 'string', description: '可选，审查关注点' },
          model: { type: 'string', description: '可选，Grok 模型 ID' },
          effort: { type: 'string', description: '可选：low | medium | high' },
        },
        required: ['cwd'],
      },
    },
    {
      name: 'grok_critique',
      description: '对本地 git 变更做对抗式设计/风险批判，尽量返回结构化 findings。只读。',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: '当前项目绝对路径' },
          base: { type: 'string', description: '可选，对比的 base ref' },
          scope: {
            type: 'string',
            description: 'auto | working-tree | branch',
            default: 'auto',
          },
          focus: { type: 'string', description: '可选，批判关注点' },
          model: { type: 'string', description: '可选，Grok 模型 ID' },
          effort: { type: 'string', description: '可选：low | medium | high' },
        },
        required: ['cwd'],
      },
    },
    {
      name: 'grok_run',
      description: '把任意任务委托给 Grok Build agent。默认可写（会改代码）；只读诊断请设 write=false。可 resume 上次 session。',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '任务说明；resume 时可省略' },
          cwd: { type: 'string', description: '可选，绝对项目路径' },
          write: {
            type: 'boolean',
            description: '默认 true。false 时使用 plan + read-only sandbox',
            default: true,
          },
          model: { type: 'string', description: '可选，Grok 模型 ID' },
          effort: { type: 'string', description: '可选：low | medium | high' },
          resume_session_id: {
            type: 'string',
            description: '可选，继续已有 Grok session（grok -r <id>）',
          },
        },
      },
    },
  ];
}

async function handleMediaTool(name, args) {
  const prompt = requirePrompt(args.prompt);
  const cwd = requireProjectDirectory(args.cwd);
  const taskPrompt = formatMediaPrompt(name, prompt, args);
  const result = await runWithHeadless(taskPrompt, { cwd });

  if (result.mediaPaths.length === 0) {
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
  return { content, isError: false };
}

async function handleToolCall(name, args) {
  if (MEDIA_TOOLS.has(name)) {
    return handleMediaTool(name, args);
  }

  if (name === 'grok_check') {
    const cwd = optionalAbsoluteCwd(args.cwd);
    const result = checkGrok(cwd);
    return textResult(result.text);
  }

  if (name === 'grok_review') {
    const cwd = requireProjectDirectory(args.cwd);
    const result = await reviewCode({
      cwd,
      base: args.base || null,
      scope: args.scope || 'auto',
      focus: args.focus || '',
      model: args.model || null,
      effort: args.effort || null,
    });
    if (!result.ok) {
      throw new Error(result.text || 'Grok review failed');
    }
    const extras = [];
    if (result.threadId) extras.push(`Grok session ID: ${result.threadId}`);
    return textResult(result.text, extras);
  }

  if (name === 'grok_critique') {
    const cwd = requireProjectDirectory(args.cwd);
    const result = await critiqueCode({
      cwd,
      base: args.base || null,
      scope: args.scope || 'auto',
      focus: args.focus || '',
      model: args.model || null,
      effort: args.effort || null,
    });
    if (!result.ok) {
      throw new Error(result.text || 'Grok critique failed');
    }
    const extras = [];
    if (result.threadId) extras.push(`Grok session ID: ${result.threadId}`);
    return textResult(result.text, extras);
  }

  if (name === 'grok_run') {
    const cwd = optionalAbsoluteCwd(args.cwd);
    const write = args.write !== false;
    const resumeSessionId = typeof args.resume_session_id === 'string' && args.resume_session_id.trim()
      ? args.resume_session_id.trim()
      : null;
    if (!resumeSessionId) {
      requirePrompt(args.prompt);
    }

    const result = await runTask({
      cwd,
      prompt: args.prompt,
      write,
      model: args.model || null,
      effort: args.effort || null,
      resumeSessionId,
    });

    if (!result.ok) {
      throw new Error(result.text || 'Grok run failed');
    }

    const extras = [];
    if (result.threadId) {
      extras.push(`Grok session ID: ${result.threadId}`);
      extras.push(`Resume: grok -r ${result.threadId}`);
    }
    return textResult(result.text, extras);
  }

  throw new Error(`Unknown tool: ${name}`);
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
      serverInfo: { name: 'grok-build', version: '0.3.0' },
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
