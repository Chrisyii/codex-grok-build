#!/usr/bin/env node
/**
 * 便捷包装：grok-codex
 * 用法示例：
 *   grok-codex image "一只赛博猫"
 *   grok-codex video "猫在弹钢琴"
 *   grok-codex run "review 当前目录"
 */

import { GrokACPClient } from './grok-acp-client.mjs';
import { resolve } from 'path';

const sub = process.argv[2] || 'help';
const rest = process.argv.slice(3).join(' ');

async function run() {
  const client = new GrokACPClient({ alwaysApprove: true });

  await client.start();

  let prompt = rest;
  let isMedia = false;
  let isVideo = false;

  if (sub === 'image' || sub === 'img') {
    isMedia = true;
    prompt = rest || '生成一张测试图片';
    prompt = `${prompt}\n请使用 image_gen，完成后只返回绝对路径 + Markdown 图片标签。`;
  } else if (sub === 'video' || sub === 'vid') {
    isVideo = true;
    prompt = rest || '生成一个短视频';
    prompt = `${prompt}\n请使用 image_to_video，优先 6s 短镜头，报告所有视频绝对路径。`;
  } else if (sub === 'run' || sub === 'task') {
    prompt = rest || '总结当前目录';
  } else {
    console.log(`用法:
  grok-codex image "提示词"
  grok-codex video "提示词"
  grok-codex run   "任意任务提示词"

推荐在 Codex 内走 MCP（grok_generate_* / grok_review / grok_critique / grok_run），
而不是直接调用本 CLI。
`);
    process.exit(0);
  }

  const result = await client.sendPrompt(prompt);

  if (result.mediaPaths.length > 0) {
    console.log('媒体文件:');
    result.mediaPaths.forEach(p => console.log(p));
  }

  if (result.text) {
    console.log('\n--- Grok 返回 ---\n' + result.text);
  }

  await client.stop();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
