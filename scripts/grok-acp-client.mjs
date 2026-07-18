#!/usr/bin/env node
/**
 * Grok Build ACP Client (for Codex integration)
 *
 * 核心功能：
 * - spawn 本地已登录的 Grok Build (`grok agent stdio`)
 * - 通过 Agent Client Protocol (ACP) 与之通信
 * - 发送提示，让 Grok 使用其原生 image_gen / image_to_video / grok-media 能力
 * - 收集输出，提取生成的媒体绝对路径
 * - 支持持久会话（同一个进程内多次 prompt）
 *
 * 用法示例（直接测试）：
 *   node grok-acp-client.mjs --prompt "生成一张 1:1 的简约测试图片，一只红苹果放在白色桌子上" --media
 *
 * Codex skill 会调用此脚本或基于它的 MCP server。
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_GROK_BIN = process.env.GROK_PATH || resolve(process.env.HOME, '.grok/bin/grok');

class GrokACPClient {
  constructor(options = {}) {
    this.grokBin = options.grokBin || DEFAULT_GROK_BIN;
    this.cwd = options.cwd || process.cwd();
    this.alwaysApprove = options.alwaysApprove !== false; // 默认 yolo，便于媒体生成
    this.proc = null;
    this.rl = null;
    this.sessionId = null;
    this.pendingRequests = new Map();
    this.messageId = 1;
    this.isReady = false;
  }

  async start() {
    if (this.proc) return;

    const args = ['agent'];
    if (this.alwaysApprove) args.push('--always-approve');
    args.push('stdio');

    console.error(`[grok-acp] Spawning: ${this.grokBin} ${args.join(' ')}`);

    this.proc = spawn(this.grokBin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    this.rl = createInterface({ input: this.proc.stdout });

    // stderr 透传便于调试
    this.proc.stderr.on('data', (d) => {
      const line = d.toString().trim();
      if (line) console.error(`[grok-acp:stderr] ${line}`);
    });

    this.proc.on('exit', (code) => {
      console.error(`[grok-acp] Grok process exited with code ${code}`);
      this.isReady = false;
    });

    // 启动 ACP 初始化
    await this._initialize();

    // 创建会话
    const { sessionId } = await this._request('session/new', {
      cwd: this.cwd,
      mcpServers: [], // 可按需注入，但这里我们主要用 Grok 自己的工具
    });
    this.sessionId = sessionId;
    this.isReady = true;

    console.error(`[grok-acp] Session created: ${this.sessionId}`);
    return this;
  }

  async _initialize() {
    return this._request('initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
    });
  }

  _request(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.messageId++;
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      this.pendingRequests.set(id, { resolve, reject });

      this.proc.stdin.write(msg + '\n');
    });
  }

  async sendPrompt(promptText, onUpdate = null) {
    if (!this.isReady || !this.sessionId) {
      throw new Error('Client not ready. Call start() first.');
    }

    const promptId = this.messageId++;
    const msg = JSON.stringify({
      jsonrpc: '2.0',
      id: promptId,
      method: 'session/prompt',
      params: {
        sessionId: this.sessionId,
        prompt: [{ type: 'text', text: promptText }],
      },
    });

    const collectedUpdates = [];
    const mediaPaths = new Set();
    let finished = false;

    const donePromise = new Promise((resolve, reject) => {
      const handler = (line) => {
        let data;
        try {
          data = JSON.parse(line);
        } catch {
          return;
        }

        // Handle session updates (the main stream of thinking + tool activity)
        if (data.method === 'session/update') {
          const update = data.params?.update || data.params;
          if (update) {
            collectedUpdates.push(update);
            if (onUpdate) onUpdate(update);
            this._extractPathsFromUpdate(update, mediaPaths);
          }
          return;
        }

        // The prompt request itself completed (some implementations send result on the request id)
        if (data.id === promptId) {
          if (data.result !== undefined) {
            finished = true;
            this.rl.removeListener('line', handler);
            resolve();
            return;
          }
          if (data.error) {
            finished = true;
            this.rl.removeListener('line', handler);
            reject(new Error(data.error.message || 'ACP prompt error'));
            return;
          }
        }

        // Fallback: sometimes Grok signals completion via specific update types
        // We treat a long quiet period or explicit end as done in the caller with timeout.
      };

      this.rl.on('line', handler);

      // Safety timeout (media generation can be slow on first run)
      const timeout = setTimeout(() => {
        if (!finished) {
          this.rl.removeListener('line', handler);
          // Still return what we have (paths may have been collected from tool updates)
          resolve();
        }
      }, 1000 * 60 * 8); // 8 minutes safety for image/video

      // Write the prompt
      this.proc.stdin.write(msg + '\n');

      // When done, clear timeout
      const origResolve = resolve;
      resolve = (...args) => {
        clearTimeout(timeout);
        origResolve(...args);
      };
    });

    await donePromise;

    return {
      updates: collectedUpdates,
      mediaPaths: Array.from(mediaPaths),
      text: this._collectText(collectedUpdates),
    };
  }

  _extractPathsFromUpdate(update, pathSet) {
    // 1. Plain text in message chunks
    const textSources = [
      update.content?.text,
      update.text,
      update.data,
      JSON.stringify(update.result || {}),
      JSON.stringify(update),
    ].filter(Boolean);

    for (const src of textSources) {
      const t = typeof src === 'string' ? src : JSON.stringify(src);

      // Absolute paths with image/video extensions
      const pathRegex = /(\/[^\s"'`<>|]+\.(png|jpg|jpeg|gif|webp|mp4|mov|avi))/gi;
      let m;
      while ((m = pathRegex.exec(t)) !== null) {
        const p = m[1];
        if (p.startsWith('/Users/') || p.startsWith('/home/') || p.startsWith('/tmp/') || p.startsWith('/var/')) {
          pathSet.add(p);
        }
      }

      // Markdown images/videos
      const mdRegex = /!\[[^\]]*\]\(<?([^>)]+)>?\)/g;
      while ((m = mdRegex.exec(t)) !== null) {
        const p = m[1];
        if (p.startsWith('/')) pathSet.add(p);
      }
    }

    // 2. Structured tool results (very common for image_gen)
    const result = update.result || update.output || (update.tool_call_update && update.tool_call_update.result);
    if (result) {
      const candidates = [];
      if (typeof result === 'string') candidates.push(result);
      if (result.path) candidates.push(result.path);
      if (result.file) candidates.push(result.file);
      if (result.output_path) candidates.push(result.output_path);
      if (Array.isArray(result.files)) result.files.forEach(f => candidates.push(f));
      if (result.url && result.url.startsWith('file:')) candidates.push(result.url.replace('file://', ''));

      for (const c of candidates) {
        if (typeof c === 'string' && c.startsWith('/')) {
          pathSet.add(c);
        }
      }
    }

    // 3. Direct fields that Grok sometimes uses
    ['path', 'file_path', 'output_path', 'image_path'].forEach(k => {
      if (update[k] && typeof update[k] === 'string' && update[k].startsWith('/')) {
        pathSet.add(update[k]);
      }
    });
  }

  _collectText(updates) {
    return updates
      .filter(u => u.sessionUpdate === 'agent_message_chunk' || u.type === 'text')
      .map(u => u.content?.text || u.data || '')
      .join('');
  }

  async stop() {
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
      this.rl = null;
      this.isReady = false;
    }
  }
}

// ==================== CLI 入口（方便独立测试 + Codex 调用） ====================
async function main() {
  const args = process.argv.slice(2);
  const promptIdx = args.indexOf('--prompt');
  const prompt = promptIdx !== -1 ? args[promptIdx + 1] : '生成一张 1:1 的简洁测试图片：一只放在木桌上的红色苹果，干净光影，专业摄影风格。请使用你的 image_gen 工具，最终只返回生成的绝对文件路径，并用 Markdown 格式呈现。';

  const mediaOnly = args.includes('--media') || args.includes('--image');
  const isVideo = args.includes('--video');

  const client = new GrokACPClient({
    alwaysApprove: true,
  });

  try {
    await client.start();

    let finalPrompt = prompt;
    if (mediaOnly && !isVideo) {
      finalPrompt = `${prompt}\n\n请严格使用 Grok Build 的 image_gen / image_edit 工具。完成后必须输出绝对路径，并用 Markdown 图片标签呈现，例如：\n![描述](</绝对路径/图片.png>)`;
    } else if (isVideo) {
      finalPrompt = `${prompt}\n\n请使用 image_to_video（或 reference_to_video）。优先短镜头（6s），最后报告所有生成视频的绝对路径，用 Markdown 视频标签呈现。`;
    }

    console.error('[grok-acp] Sending prompt to Grok Build agent...');

    const result = await client.sendPrompt(finalPrompt, (update) => {
      // 实时把重要信息打到 stderr，方便调试
      if (update.sessionUpdate === 'agent_message_chunk') {
        process.stderr.write(update.content?.text || '');
      }
      if (update.sessionUpdate === 'tool_call') {
        console.error(`\n[tool] ${update.title || update.kind}`);
      }
    });

    // 输出结构化结果（Codex skill 很容易解析）
    const output = {
      success: true,
      text: result.text,
      mediaPaths: result.mediaPaths,
      sessionId: client.sessionId,
    };

    console.log(JSON.stringify(output, null, 2));

    // 额外友好打印路径（人类可读）
    if (result.mediaPaths.length > 0) {
      console.error('\n=== 生成的媒体文件 ===');
      result.mediaPaths.forEach(p => console.error(p));
    }

  } catch (err) {
    console.error('[grok-acp] Error:', err.message);
    console.log(JSON.stringify({ success: false, error: err.message }));
    process.exit(1);
  } finally {
    // 注意：对于长期运行的 MCP，我们通常不在这里 stop。
    // 这里 CLI 模式下结束即可。
    await client.stop();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { GrokACPClient };
