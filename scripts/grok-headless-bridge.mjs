#!/usr/bin/env node
/**
 * Reliable headless bridge for Grok Build media generation.
 *
 * Grok writes its result as JSON to stdout. This bridge extracts generated
 * media, moves it into the calling project's generated/ directory, and
 * returns only paths that are accessible to Codex.
 */

import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const DEFAULT_GROK = process.env.GROK_PATH || resolve(process.env.HOME, '.grok/bin/grok');
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MEDIA_PATH_PATTERN = /\/(?:[^\s"'`<>|])+\.(?:png|jpg|jpeg|gif|webp|mp4|mov|avi)/gi;

function parseGrokOutput(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    const match = stdout.match(/\{[\s\S]*\}$/);
    if (match) return JSON.parse(match[0]);
  }

  throw new Error('Grok did not return valid JSON output');
}

function getResultText(result) {
  if (typeof result.text === 'string') return result.text;
  if (typeof result.content === 'string') return result.content;
  if (Array.isArray(result.content)) {
    return result.content
      .map((item) => (typeof item === 'string' ? item : item?.text || ''))
      .join('');
  }
  return '';
}

function getMediaPaths(text, result) {
  const paths = new Set();
  let match;

  while ((match = MEDIA_PATH_PATTERN.exec(text)) !== null) {
    paths.add(match[0]);
  }

  if (Array.isArray(result.mediaPaths)) {
    for (const path of result.mediaPaths) {
      if (typeof path === 'string' && path.startsWith('/')) paths.add(path);
    }
  }

  return [...paths];
}

function nextDestination(outputDir, originalPath, index) {
  return join(outputDir, `${Date.now()}-${index + 1}-${basename(originalPath)}`);
}

function moveMedia(paths, outputDir) {
  const movedPaths = [];
  const missingMediaPaths = [];
  const replacements = new Map();

  paths.forEach((originalPath, index) => {
    if (!existsSync(originalPath)) {
      missingMediaPaths.push(originalPath);
      return;
    }

    const destination = nextDestination(outputDir, originalPath, index);
    try {
      renameSync(originalPath, destination);
    } catch (error) {
      if (error?.code !== 'EXDEV') throw error;
      copyFileSync(originalPath, destination);
      unlinkSync(originalPath);
    }

    movedPaths.push(destination);
    replacements.set(originalPath, destination);
  });

  return { movedPaths, missingMediaPaths, replacements };
}

function replaceMediaPaths(text, replacements) {
  let result = text;
  for (const [originalPath, destination] of replacements) {
    result = result.replaceAll(originalPath, destination);
  }
  return result;
}

function buildPrompt(prompt) {
  return `${prompt}

生成图片或视频后，请在最终输出中使用 Markdown 报告每个生成文件的原始绝对路径，例如：
![描述](</绝对路径/文件.mp4>)`;
}

export async function runWithHeadless(prompt, options = {}) {
  const grokBin = options.grokBin || DEFAULT_GROK;
  const cwd = options.cwd || process.cwd();
  const outputDir = options.outputDir || join(cwd, 'generated');
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  mkdirSync(outputDir, { recursive: true });

  const args = [
    '-p',
    buildPrompt(prompt),
    '--yolo',
    '--no-plan',
    '--no-subagents',
    '--no-memory',
    '--disable-web-search',
    '--output-format',
    'json',
    '--cwd',
    cwd,
  ];

  console.error(`[grok-headless] Running Grok in ${cwd}; output directory: ${outputDir}`);

  return new Promise((resolveResult, rejectResult) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    const proc = spawn(grokBin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
    });
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      finish(rejectResult, new Error(`Grok timed out after ${Math.round(timeoutMs / 1000)} seconds`));
    }, timeoutMs);
    const appendOutput = (target, chunk) => {
      const next = target.value + chunk.toString();
      if (Buffer.byteLength(next) > MAX_OUTPUT_BYTES) {
        proc.kill('SIGTERM');
        finish(rejectResult, new Error('Grok output exceeded the 4 MiB safety limit'));
        return;
      }
      target.value = next;
    };

    const stdoutBuffer = { value: stdout };
    const stderrBuffer = { value: stderr };
    proc.stdout.on('data', (chunk) => appendOutput(stdoutBuffer, chunk));
    proc.stderr.on('data', (chunk) => appendOutput(stderrBuffer, chunk));
    proc.on('error', (error) => finish(rejectResult, new Error(`Could not start Grok: ${error.message}`)));
    proc.on('close', (code) => {
      if (settled) return;
      stdout = stdoutBuffer.value;
      stderr = stderrBuffer.value;

      if (code !== 0) {
        finish(rejectResult, new Error(`Grok exited with code ${code}`));
        return;
      }

      try {
        const raw = parseGrokOutput(stdout);
        if (raw.error) {
          throw new Error(typeof raw.error === 'string' ? raw.error : 'Grok reported an error');
        }

        const text = getResultText(raw);
        const sourcePaths = getMediaPaths(text, raw);
        const { movedPaths, missingMediaPaths, replacements } = moveMedia(sourcePaths, outputDir);
        finish(resolveResult, {
          success: true,
          text: replaceMediaPaths(text, replacements),
          mediaPaths: movedPaths,
          missingMediaPaths,
          originalGrokPaths: sourcePaths,
          raw,
          outputDir,
        });
      } catch (error) {
        finish(rejectResult, error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prompt = process.argv.slice(2).join(' ') || '生成一张测试图片';
  runWithHeadless(prompt)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
