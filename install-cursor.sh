#!/usr/bin/env bash
set -euo pipefail

# Grok Build for Cursor — register MCP only (shared skill lives under Codex)
#
#   bash install-cursor.sh
#   curl -fsSL https://raw.githubusercontent.com/Chrisyii/codex-grok-build/main/install-cursor.sh | bash
#
# Important: do NOT install a second copy under ~/.cursor/skills/grok-build.
# Cursor already discovers ~/.codex/skills; a duplicate creates two "grok-build" entries.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO="https://github.com/Chrisyii/codex-grok-build"
REPO="${REPO:-$DEFAULT_REPO}"

RUNTIME_DIR="${GROK_BUILD_RUNTIME_DIR:-$HOME/.codex/skills/grok-build}"
CURSOR_SKILL_DIR="$HOME/.cursor/skills/grok-build"
CURSOR_MCP_JSON="$HOME/.cursor/mcp.json"
GROK_BIN="${GROK_PATH:-$HOME/.grok/bin/grok}"

echo "==> 安装 Grok Build for Cursor（仅 MCP，共用 Codex skill）"

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

# 1) Sync shared runtime (single skill source for Codex + Cursor discovery)
echo "同步共享运行时/skill -> $RUNTIME_DIR"
bash "$SCRIPT_DIR/install.sh"

# 2) Remove duplicate Cursor skill copy if present
if [ -e "$CURSOR_SKILL_DIR" ]; then
  echo "移除重复的 Cursor skill 副本 -> $CURSOR_SKILL_DIR"
  rm -rf "$CURSOR_SKILL_DIR"
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
(cd "$RUNTIME_DIR" && npm test && npm run verify:cursor)

echo
echo "==> Cursor 安装完成"
echo "1. Open Cursor Settings -> MCP and confirm grok-build (or restart Cursor)"
echo "2. Skill should appear once, from: ${RUNTIME_DIR}"
echo "3. Do not copy the skill into ~/.cursor/skills/grok-build"
echo "4. Try in chat: 用 Grok 检查一下是否就绪"
