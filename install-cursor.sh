#!/usr/bin/env bash
set -euo pipefail

# Grok Build for Cursor — install skill + register MCP
#
#   bash install-cursor.sh
#   curl -fsSL https://raw.githubusercontent.com/Chrisyii/codex-grok-build/main/install-cursor.sh | bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO="https://github.com/Chrisyii/codex-grok-build"
REPO="${REPO:-$DEFAULT_REPO}"

RUNTIME_DIR="${GROK_BUILD_RUNTIME_DIR:-$HOME/.codex/skills/grok-build}"
CURSOR_SKILL_DIR="$HOME/.cursor/skills/grok-build"
CURSOR_MCP_JSON="$HOME/.cursor/mcp.json"
GROK_BIN="${GROK_PATH:-$HOME/.grok/bin/grok}"

echo "==> 安装 Grok Build for Cursor"

# Resolve repo root (supports curl | bash via temp clone into RUNTIME_DIR first)
if [ ! -f "$SCRIPT_DIR/scripts/grok-acp-mcp-server.mjs" ]; then
  echo "远程安装：先确保运行时目录可用..."
  if [ ! -f "$RUNTIME_DIR/scripts/grok-acp-mcp-server.mjs" ]; then
    mkdir -p "$(dirname "$RUNTIME_DIR")"
    if [ -d "$RUNTIME_DIR" ]; then
      mv "$RUNTIME_DIR" "${RUNTIME_DIR}.bak.$(date +%Y%m%d%H%M%S)"
    fi
    git clone "$REPO" "$RUNTIME_DIR"
  fi
  SCRIPT_DIR="$RUNTIME_DIR"
fi

# 1) Sync shared runtime (Codex skill location = single source for MCP scripts)
echo "同步共享运行时 -> $RUNTIME_DIR"
bash "$SCRIPT_DIR/install.sh"

# 2) Install Cursor skill (thin wrapper; MCP points at shared runtime)
echo "安装 Cursor skill -> $CURSOR_SKILL_DIR"
mkdir -p "$CURSOR_SKILL_DIR"
if [ -f "$SCRIPT_DIR/cursor/SKILL.md" ]; then
  cp -f "$SCRIPT_DIR/cursor/SKILL.md" "$CURSOR_SKILL_DIR/SKILL.md"
else
  echo "缺少 cursor/SKILL.md" >&2
  exit 1
fi

# 3) Register MCP in ~/.cursor/mcp.json
echo "注册 Cursor MCP -> $CURSOR_MCP_JSON"
mkdir -p "$(dirname "$CURSOR_MCP_JSON")"
if [ ! -f "$CURSOR_MCP_JSON" ]; then
  printf '%s\n' '{"mcpServers":{}}' > "$CURSOR_MCP_JSON"
fi

CURSOR_MCP_JSON="$CURSOR_MCP_JSON" \
GROK_MCP_SERVER="$RUNTIME_DIR/scripts/grok-acp-mcp-server.mjs" \
GROK_BIN="$GROK_BIN" \
node "$SCRIPT_DIR/scripts/register-cursor-mcp.mjs"

# 4) Quick checks
echo "检查 Grok 二进制..."
if [ -x "$GROK_BIN" ]; then
  echo "  ✓ $GROK_BIN"
else
  echo "  ✗ 未找到 $GROK_BIN（仍可注册 MCP，但调用会失败）"
fi

echo "运行回归测试..."
(cd "$RUNTIME_DIR" && npm test)

echo
echo "==> Cursor 安装完成"
echo "1. 打开 Cursor Settings → MCP，确认 grok-build 已出现（或重启 Cursor）"
echo "2. 在 Agent 对话中试：用 Grok 检查一下是否就绪"
echo "3. Skill 路径: $CURSOR_SKILL_DIR"
echo "4. MCP 脚本: $RUNTIME_DIR/scripts/grok-acp-mcp-server.mjs"
