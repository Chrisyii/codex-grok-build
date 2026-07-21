/**
 * Programmatic Grok Build operations for the Codex MCP skill.
 * Adapted from xai-org/grok-build-plugin-cc (review / critique / delegate / check).
 * Claude-only pieces (session import, slash commands, job queue UI) are omitted.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectReviewContext, ensureGitRepository, resolveReviewTarget } from "./lib/git.mjs";
import {
  buildReviewPrompt,
  DEFAULT_CONTINUE_PROMPT,
  getGrokAuthStatus,
  getGrokAvailability,
  parseStructuredOutput,
  readOutputSchema,
  runHeadlessAgent,
  schemaInstructionsFromPath,
} from "./lib/grok.mjs";
import { binaryAvailable } from "./lib/process.mjs";
import { interpolateTemplate, loadPromptTemplate } from "./lib/prompts.mjs";
import {
  renderNativeReviewResult,
  renderReviewResult,
  renderSetupReport,
  renderTaskResult,
} from "./lib/render.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const REVIEW_SCHEMA = path.join(ROOT_DIR, "schemas", "review-output.schema.json");
const VALID_EFFORTS = new Set(["low", "medium", "high"]);

function normalizeEffort(effort) {
  if (effort == null || effort === "") return null;
  const normalized = String(effort).trim().toLowerCase();
  if (!VALID_EFFORTS.has(normalized)) {
    throw new Error(`Unsupported effort "${effort}". Use one of: low, medium, high.`);
  }
  return normalized;
}

function firstMeaningfulLine(text, fallback) {
  const line = String(text ?? "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find(Boolean);
  return line ?? fallback;
}

function ensureGrokAvailable(cwd) {
  const availability = getGrokAvailability(cwd);
  if (!availability.available) {
    throw new Error(
      "Grok CLI is not installed or not on PATH. Install it, or set GROK_PATH / GROK_BINARY.",
    );
  }
  return availability;
}

function buildCritiquePrompt(context, focusText) {
  const template = loadPromptTemplate(ROOT_DIR, "critique");
  return interpolateTemplate(template, {
    REVIEW_KIND: "Critique",
    TARGET_LABEL: context.target.label,
    USER_FOCUS: focusText || "No extra focus provided.",
    REVIEW_COLLECTION_GUIDANCE: context.collectionGuidance,
    REVIEW_INPUT: context.content,
  });
}

export function checkGrok(cwd = process.cwd()) {
  const nodeStatus = binaryAvailable("node", ["--version"], { cwd });
  const grokStatus = getGrokAvailability(cwd);
  const authStatus = getGrokAuthStatus(cwd);
  const nextSteps = [];

  if (!grokStatus.available) {
    nextSteps.push("Install the Grok Build CLI and ensure `grok` is on PATH (or set GROK_PATH).");
  }
  if (grokStatus.available && !authStatus.loggedIn) {
    nextSteps.push("Authenticate the Grok CLI (for example `grok login`).");
    nextSteps.push("Verify with `grok models`.");
  }

  const report = {
    ready: nodeStatus.available && grokStatus.available && authStatus.loggedIn,
    node: nodeStatus,
    grok: grokStatus,
    auth: authStatus,
    nextSteps,
  };

  return {
    ready: report.ready,
    report,
    text: renderSetupReport(report),
  };
}

async function executeReview({
  cwd,
  base = null,
  scope = "auto",
  focus = "",
  model = null,
  effort = null,
  reviewName = "Review",
}) {
  ensureGrokAvailable(cwd);
  ensureGitRepository(cwd);

  const target = resolveReviewTarget(cwd, { base, scope });
  const focusText = String(focus ?? "").trim();
  const context = collectReviewContext(cwd, target);
  const normalizedEffort = normalizeEffort(effort);

  let prompt;
  let structured = false;
  if (reviewName === "Critique") {
    prompt = buildCritiquePrompt(context, focusText);
    const schemaHint = schemaInstructionsFromPath(REVIEW_SCHEMA);
    if (schemaHint) prompt = `${prompt}\n\n${schemaHint}`;
    structured = true;
  } else {
    prompt = buildReviewPrompt({
      targetLabel: context.target.label,
      focusText,
      collectionGuidance: context.collectionGuidance,
      reviewInput: context.content,
    });
  }

  const result = await runHeadlessAgent(context.repoRoot, {
    prompt,
    agent: "explore",
    permissionMode: "plan",
    sandbox: "read-only",
    model: model || undefined,
    effort: normalizedEffort || undefined,
    outputFormat: structured ? "json" : "plain",
    jsonSchema: structured ? readOutputSchema(REVIEW_SCHEMA) : undefined,
  });

  if (structured) {
    const parsed = parseStructuredOutput(result.finalMessage, {
      status: result.status,
      failureMessage: result.stderr,
    });
    const text = renderReviewResult(parsed, {
      reviewLabel: reviewName,
      targetLabel: context.target.label,
    });
    return {
      ok: result.status === 0 && !parsed.parseError,
      text,
      threadId: result.threadId,
      target,
      structured: parsed.parsed,
      parseError: parsed.parseError,
      summary: parsed.parsed?.summary ?? parsed.parseError ?? firstMeaningfulLine(result.finalMessage, `${reviewName} finished.`),
    };
  }

  const text = renderNativeReviewResult(
    {
      status: result.status,
      stdout: result.finalMessage,
      stderr: result.stderr,
    },
    { reviewLabel: reviewName, targetLabel: target.label },
  );

  return {
    ok: result.status === 0,
    text,
    threadId: result.threadId,
    target,
    summary: firstMeaningfulLine(result.finalMessage, `${reviewName} completed.`),
  };
}

export function reviewCode(options = {}) {
  return executeReview({ ...options, reviewName: "Review" });
}

export function critiqueCode(options = {}) {
  return executeReview({ ...options, reviewName: "Critique" });
}

/**
 * Delegate an arbitrary task to Grok Build.
 * Default is write-capable (matches Claude plugin delegate policy).
 * Pass write:false for read-only plan mode.
 */
export async function runTask({
  cwd = process.cwd(),
  prompt,
  write = true,
  model = null,
  effort = null,
  resumeSessionId = null,
} = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  ensureGrokAvailable(cwd);

  const normalizedEffort = normalizeEffort(effort);
  const taskPrompt = String(prompt ?? "").trim() || (resumeSessionId ? DEFAULT_CONTINUE_PROMPT : "");
  if (!taskPrompt && !resumeSessionId) {
    throw new Error("prompt is required unless resume_session_id is set");
  }

  const result = await runHeadlessAgent(workspaceRoot, {
    prompt: taskPrompt || DEFAULT_CONTINUE_PROMPT,
    resumeSessionId: resumeSessionId || undefined,
    model: model || undefined,
    effort: normalizedEffort || undefined,
    alwaysApprove: write,
    permissionMode: write ? undefined : "plan",
    sandbox: write ? undefined : "read-only",
    outputFormat: "plain",
  });

  const rawOutput = typeof result.finalMessage === "string" ? result.finalMessage : "";
  const failureMessage = result.status === 0 ? "" : result.stderr || "";
  const text = renderTaskResult({ rawOutput, failureMessage });

  return {
    ok: result.status === 0,
    text,
    threadId: result.threadId,
    write,
    summary: firstMeaningfulLine(rawOutput, firstMeaningfulLine(failureMessage, "Grok finished.")),
  };
}
