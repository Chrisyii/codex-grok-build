#!/bin/bash
set -euo pipefail

# codex-grok-build
# Grok Build for Codex — 一键安装脚本
#
# 一键安装：
#   curl -fsSL https://raw.githubusercontent.com/Chrisyii/codex-grok-build/main/install.sh | bash
#
# 指定仓库：
#   REPO=https://github.com/Chrisyii/codex-grok-build bash <(curl -fsSL https://raw.githubusercontent.com/Chrisyii/codex-grok-build/main/install.sh)

SKILL_NAME="grok-build"
TARGET_SKILL_DIR="$HOME/.codex/skills/$SKILL_NAME"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 默认仓库地址
DEFAULT_REPO="https://github.com/Chrisyii/codex-grok-build"
REPO="${REPO:-$DEFAULT_REPO}"

echo "==> 安装 Grok Build Codex 插件 ($SKILL_NAME)"

# 如果当前目录没有完整脚本（通过 curl 直接下载 install.sh 的情况），则自动 clone
if [ ! -f "$SCRIPT_DIR/scripts/grok-headless-bridge.mjs" ] && [ "$SCRIPT_DIR" != "$TARGET_SKILL_DIR" ]; then
  echo "检测到通过远程方式安装，正在克隆仓库..."
  if [ -d "$TARGET_SKILL_DIR" ]; then
    echo "目标目录已存在，先备份为 ${TARGET_SKILL_DIR}.bak"
    mv "$TARGET_SKILL_DIR" "${TARGET_SKILL_DIR}.bak"
  fi
  git clone "$REPO" "$TARGET_SKILL_DIR" || {
    echo "克隆失败，请手动 git clone $REPO $TARGET_SKILL_DIR"
    exit 1
  }
  SCRIPT_DIR="$TARGET_SKILL_DIR"
  echo "克隆完成。"
fi

# 1. 创建目标目录
mkdir -p "$TARGET_SKILL_DIR/scripts" "$TARGET_SKILL_DIR/test"

# 2. 复制/同步文件
if [ "$SCRIPT_DIR" = "$TARGET_SKILL_DIR" ]; then
  echo "检测到已在目标目录，跳过复制。"
else
  echo "同步 skill 定义..."
  cp -f "$SCRIPT_DIR/SKILL.md" "$TARGET_SKILL_DIR/" 2>/dev/null || echo "  - SKILL.md 跳过"
  cp -f "$SCRIPT_DIR/README.md" "$TARGET_SKILL_DIR/" 2>/dev/null || true
  cp -f "$SCRIPT_DIR/package.json" "$TARGET_SKILL_DIR/" 2>/dev/null || true

  echo "同步桥接脚本..."
  cp -f "$SCRIPT_DIR/scripts/"*.mjs "$TARGET_SKILL_DIR/scripts/" 2>/dev/null || true
  chmod +x "$TARGET_SKILL_DIR/scripts/"*.mjs 2>/dev/null || true

  echo "同步回归测试..."
  cp -f "$SCRIPT_DIR/test/"*.test.mjs "$TARGET_SKILL_DIR/test/" 2>/dev/null || true
fi

# 3. 健康检查
echo "检查 Grok Build 二进制..."
GROK_BIN="${GROK_PATH:-$HOME/.grok/bin/grok}"
if [[ -x "$GROK_BIN" ]]; then
  echo "  ✓ 找到: $GROK_BIN"
else
  echo "  ✗ 未找到 Grok Build ($GROK_BIN)"
  echo "    请先安装并登录 Grok Build"
  exit 1
fi

echo "检查登录状态（快速探测）..."
if "$GROK_BIN" --help > /dev/null 2>&1; then
  echo "  ✓ Grok Build 可执行"
else
  echo "  ? 无法确认，建议手动运行: grok login"
fi

# 4. 打印 MCP 配置建议
echo
echo "==> 下一步：注册 MCP（推荐）"
cat <<'EOF'
把下面内容加入你的 MCP 配置（通常 ~/.codex/mcp-configs/mcp-servers.json 或 Codex 设置界面）：

{
  "grok-build": {
    "command": "node",
    "args": ["$HOME/.codex/skills/grok-build/scripts/grok-acp-mcp-server.mjs"],
    "env": {
      "GROK_PATH": "$HOME/.grok/bin/grok"
    },
    "description": "Grok Build - 图片/视频/通用任务（使用你本地登录的 Grok Build）"
  }
}

注册后重启 Codex 或 reload MCP，即可在对话中直接使用 Grok Build 生成图片视频。
EOF

echo
echo "==> 安装/同步完成！"

echo "Grok Build 二进制检查："
GROK_BIN="${GROK_PATH:-$HOME/.grok/bin/grok}"
if [[ -x "$GROK_BIN" ]]; then
  echo "  ✓ 找到: $GROK_BIN"
else
  echo "  ✗ 未找到，请先确保 Grok Build 已安装并登录"
fi

# 自动尝试注册 MCP 到 config.toml
echo
echo "尝试自动注册 MCP 配置到 ~/.codex/config.toml ..."
CONFIG_TOML="$HOME/.codex/config.toml"
MCP_TOML='[mcp_servers.grok-build]
command = "node"
args = ["'"$TARGET_SKILL_DIR"'/scripts/grok-acp-mcp-server.mjs"]
env = { GROK_PATH = "'"$GROK_BIN"'" }
description = "Grok Build - 图片/视频/通用任务（使用本地已登录的 Grok Build）"'

if [ -f "$CONFIG_TOML" ]; then
  if grep -q 'grok-build' "$CONFIG_TOML" 2>/dev/null; then
    echo "  ✓ grok-build MCP 配置已存在"
  else
    echo "" >> "$CONFIG_TOML"
    echo "$MCP_TOML" >> "$CONFIG_TOML"
    echo "  ✓ 已自动追加到 config.toml"
    echo "    请在 Codex 中 reload MCP 或重启 Codex 生效。"
  fi
else
  echo "  ! 没找到 config.toml，请手动添加："
  echo "$MCP_TOML"
fi

echo
echo "推荐回归测试（不生成真实媒体）："
echo "  cd $TARGET_SKILL_DIR && npm test"

echo
echo "（可选）如果你用 mcp-configs/mcp-servers.json，手动加下面这段："
cat <<'EOT'
{
  "grok-build": {
    "command": "node",
    "args": ["$HOME/.codex/skills/grok-build/scripts/grok-acp-mcp-server.mjs"],
    "env": { "GROK_PATH": "$HOME/.grok/bin/grok" },
    "description": "Grok Build - 图片/视频/通用任务"
  }
}
EOT

echo
echo "MCP 生效后，在 Codex 对话里直接说“用 Grok Build 生成...” 即可。"
echo "更多说明见 $TARGET_SKILL_DIR/README.md"
echo "安装/同步步骤结束。"
