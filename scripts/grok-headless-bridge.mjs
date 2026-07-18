#!/usr/bin/env node
/**
 * 简单可靠的 Headless 桥接（fallback）
 *
 * 使用 `grok -p "..." --yolo --output-format json`
 * Grok Build 会完整执行工具（包括 image_gen），然后返回 JSON。
 *
 * 优点：简单、可靠、启动相对快。
 * 缺点：没有 ACP 的实时 tool visibility 和 thoughts 流。
 *
 * Codex skill / MCP 可以优先尝试 ACP，失败或超时后用这个。
 */

import { spawn } from 'child_process';
import { resolve, join, basename, dirname } from 'path';
import { mkdirSync, copyFileSync, existsSync, renameSync, unlinkSync } from 'fs';

const DEFAULT_GROK = process.env.GROK_PATH || resolve(process.env.HOME, '.grok/bin/grok');

export async function runWithHeadless(prompt, options = {}) {
  const grokBin = options.grokBin || DEFAULT_GROK;
  const cwd = options.cwd || process.cwd();
  // 目标输出目录：优先用户指定的，否则当前项目的 generated/ 子目录
  const outputDir = options.outputDir || join(cwd, 'generated');

  // 确保输出目录存在
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const fullPrompt = `${prompt}

重要：生成图片或视频后，请务必在最终输出中使用 Markdown 报告生成的**原始路径**，例如：
![描述](</grok生成的原始绝对路径/文件.png>)
`;

  const args = [
    '-p', fullPrompt,
    '--yolo',
    '--output-format', 'json',
    '--cwd', cwd,
  ];

  console.error(`[grok-headless] Running Grok in ${cwd}, will move media to ${outputDir}`);

  return new Promise((resolve, reject) => {
    const proc = spawn(grokBin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error('[grok-headless] stderr:', stderr.slice(-2000));
        return reject(new Error(`grok -p exited with code ${code}`));
      }

      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch (e) {
        const match = stdout.match(/\{[\s\S]*\}$/);
        if (match) parsed = JSON.parse(match[0]);
      }

      if (!parsed) {
        return reject(new Error('Could not parse grok -p JSON output'));
      }

      const text = parsed.text || parsed.content || '';
      let mediaPaths = [];

      // 提取 Grok 报告的原始路径
      const pathRe = /(\/[^\s"'`<>|]+\.(png|jpg|jpeg|gif|webp|mp4|mov|avi))/gi;
      let m;
      while ((m = pathRe.exec(text)) !== null) {
        if (m[1].startsWith('/')) mediaPaths.push(m[1]);
      }
      if (parsed.mediaPaths) mediaPaths.push(...parsed.mediaPaths);
      mediaPaths = [...new Set(mediaPaths)];

      // === 关键改进：移动（剪切）文件到当前 Codex 项目目录，避免双份占用 ===
      const movedPaths = [];
      for (const originalPath of mediaPaths) {
        try {
          if (existsSync(originalPath)) {
            const filename = basename(originalPath);
            // 避免重名，简单加时间戳前缀
            const timestamp = Date.now();
            const newPath = join(outputDir, `${timestamp}-${filename}`);

            // 尝试直接 rename（同文件系统最快）
            try {
              renameSync(originalPath, newPath);
              movedPaths.push(newPath);
              console.error(`[grok-headless] Moved to project: ${newPath}`);
            } catch (renameErr) {
              // 跨文件系统时 rename 会失败，回退到 copy + delete
              if (renameErr.code === 'EXDEV') {
                copyFileSync(originalPath, newPath);
                unlinkSync(originalPath);
                movedPaths.push(newPath);
                console.error(`[grok-headless] Copied+deleted (cross-fs) to project: ${newPath}`);
              } else {
                throw renameErr;
              }
            }
          } else {
            movedPaths.push(originalPath); // 保底返回原路径
          }
        } catch (moveErr) {
          console.error(`[grok-headless] Failed to move ${originalPath}:`, moveErr.message);
          movedPaths.push(originalPath);
        }
      }

      // 可选：尝试在返回的 text 中把原路径替换成新路径（简单处理）
      let finalText = text;
      for (let i = 0; i < mediaPaths.length; i++) {
        if (copiedPaths[i] && mediaPaths[i] !== copiedPaths[i]) {
          finalText = finalText.replaceAll(mediaPaths[i], copiedPaths[i]);
        }
      }

      resolve({
        success: true,
        text: finalText,
        mediaPaths: movedPaths,
        originalGrokPaths: mediaPaths,
        raw: parsed,
        outputDir,
      });
    });

    proc.on('error', reject);
  });
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const prompt = process.argv.slice(2).join(' ') || '生成一张测试图片';
  runWithHeadless(prompt).then(r => {
    console.log(JSON.stringify(r, null, 2));
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
