#!/usr/bin/env node
/**
 * Grok Build MCP Server for Codex
 *
 * 暴露工具：
 *   grok_generate_image
 *   grok_generate_video
 *   grok_run
 *
 * 优先使用可靠的 headless 桥接（grok -p），ACP 版本可后续切换。
 * 这样 Codex 可以直接调用本地登录的 Grok Build 来生成图片/视频。
 *
 * 注册示例见 mcp-example/grok-acp.json
 */

import { runWithHeadless } from './grok-headless-bridge.mjs';
import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin });

function sendResponse(id, result) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, result });
  process.stdout.write(msg + '\n');
}

function sendError(id, code, message) {
  const msg = JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  });
  process.stdout.write(msg + '\n');
}

rl.on('line', async (line) => {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }

  if (req.method === 'initialize') {
    sendResponse(req.id, {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: 'grok-acp',
        version: '0.1.0',
      },
    });
    return;
  }

  if (req.method === 'tools/list') {
    sendResponse(req.id, {
      tools: [
        {
          name: 'grok_generate_image',
          description: '使用登录的 Grok Build 生成图片。推荐传入 cwd 参数指定当前项目目录，生成的文件会自动移动（剪切）到项目 generated/ 文件夹，避免重复占用磁盘。',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: { type: 'string' },
              aspect_ratio: { type: 'string', default: '1:1' },
              cwd: { type: 'string', description: '当前 Codex 项目的绝对路径（推荐传入）' },
            },
            required: ['prompt'],
          },
        },
        {
          name: 'grok_generate_video',
          description: '使用登录的 Grok Build 生成视频（从图或文）。推荐传入 cwd 参数，文件会自动移动到当前项目目录。',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: { type: 'string' },
              base_image: { type: 'string', description: '可选，上一张图片路径' },
              cwd: { type: 'string', description: '当前 Codex 项目的绝对路径（推荐传入）' },
            },
            required: ['prompt'],
          },
        },
        {
          name: 'grok_run',
          description: '把任意任务委托给 Grok Build agent 执行',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: { type: 'string' },
            },
            required: ['prompt'],
          },
        },
      ],
    });
    return;
  }

  if (req.method === 'tools/call') {
    const { name, arguments: args = {} } = req.params;
    try {
      let prompt = args.prompt || '';
      // Codex agent 可以传入当前项目目录（推荐）
      const projectCwd = args.cwd || args.project_dir || process.cwd();

      if (name === 'grok_generate_image') {
        const ar = args.aspect_ratio || '1:1';
        prompt = `${prompt}\n\n请使用 Grok Build 的 image_gen 工具生成图片（aspect_ratio: ${ar}）。`;
      } else if (name === 'grok_generate_video') {
        if (args.base_image) {
          prompt = `使用提供的图片 ${args.base_image} 作为首帧。\n${prompt}\n请使用 image_to_video 生成视频，优先 6 秒短片。`;
        } else {
          prompt = `${prompt}\n请使用 Grok Build 生成视频（优先 image_to_video）。`;
        }
      } else if (name === 'grok_run') {
        prompt = `${prompt}\n\n执行完毕后，如果产生了媒体文件，请报告绝对路径。`;
      }

      // 传递项目目录，bridge 会自动把生成的文件复制到项目 generated/ 目录
      const result = await runWithHeadless(prompt, { cwd: projectCwd });

      const content = [];

      if (result.text) {
        content.push({ type: 'text', text: result.text });
      }

      if (result.mediaPaths && result.mediaPaths.length > 0) {
        result.mediaPaths.forEach(p => {
          content.push({ type: 'text', text: `已生成文件（已移动到当前项目 generated/ 目录）: ${p}` });
        });
      }

      if (content.length === 0) {
        content.push({ type: 'text', text: result.raw ? JSON.stringify(result.raw).slice(0, 500) : '执行完成（无额外输出）' });
      }

      sendResponse(req.id, {
        content,
        isError: false,
      });
    } catch (e) {
      sendError(req.id, -32000, `Grok Build 执行失败: ${e.message}`);
    }
    return;
  }

  // 其他方法忽略或返回空
  if (req.id !== undefined) {
    sendResponse(req.id, null);
  }
});

console.error('[grok-build-mcp] Grok Build MCP server ready (using headless bridge for reliability)');
