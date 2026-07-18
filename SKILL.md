---
name: grok-build
description: >
  通过本地登录的 Grok Build（ACP 集成）生成图片、视频并执行任意复杂任务。
  当用户要求使用 Grok 的 Imagine 能力、说“用 Grok 生成”“Grok Build 做视频”“delegate to grok”等时激活。
  这是 Codex 侧的桥接 skill，底层调用已登录的 Grok Build 二进制。
---

# Grok Build（Codex ACP 集成）

在 Codex 里直接使用你本地已经登录的 **Grok Build** 完整能力，包括：

- 高质量图片生成（image_gen + image_edit）
- 视频生成（image_to_video，支持多镜头规划）
- 专业媒体流程（委托 Grok 的 grok-media skill）
- 通用 agent 委托（Grok Build 做任何它擅长的事）

**核心优势**：全程使用 Grok Build 的登录态（`~/.grok/auth.json`），无需单独的 xAI API Key。生成的文件直接在 Codex 里渲染。

## 何时激活

- 用户说“用 Grok 生成图片/视频”“Grok Build 做”“用 Grok agent”“delegate to grok”
- 提示中出现“生图”“封面”“插图”“视频生成”“imagine”
- 需要 Grok Build 特有的媒体质量、一致性、或复杂 agent 工作流
- 用户明确想用已登录的 Grok 而不是 agnes / fal / OpenRouter

与 `agnes-ai`、`fal-ai-media` 并存，用户可自由选择。

## 使用方式

### 1. 直接在对话中触发（推荐）

```
生成一张 16:9 的未来赛博城市夜景，霓虹灯，雨天反光，电影感
用 Grok Build 做
```

```
基于上一张图，改成白天版本，加一辆飞驰的悬浮车
```

```
用 Grok 做一个 3 个镜头的短视频：一只猫在钢琴上跳舞，爵士风格
```

### 2. 显式委托通用任务

```
delegate to grok: 分析当前项目结构，指出潜在架构问题，并给出改进建议
```

Grok Build 会以完整 agent 身份执行（工具、思考、文件读写等）。

## 实现原理（简要）

- 当 MCP "grok-build" 已注册时，优先使用 MCP 工具：
  - `grok_generate_image`
  - `grok_generate_video`
  - `grok_run`
- **重要**：调用工具时请务必传入 `cwd` 参数（当前项目的绝对路径），生成的文件会自动**移动**（剪切）到 `当前项目/generated/` 目录下，避免重复占用磁盘。
- 底层桥接会调用你本地已登录的 Grok Build。
- Grok Build 拥有完整 `image_gen` / `image_to_video` / grok-media 流程。
- 返回的路径已经是项目内的路径，可直接渲染。

示例（推荐写法）：
```
grok_generate_image({
  "prompt": "一只赛博朋克风格的猫",
  "aspect_ratio": "16:9",
  "cwd": "/path/to/your/current/project"
})
```

## 前置条件

1. Grok Build 已正确安装并登录：
   ```bash
   ~/.grok/bin/grok login
   # 或 grok login
   ```
2. 本 skill 对应的 bridge 脚本已就位（见 `scripts/`）。
3. （推荐）把 `grok-acp` MCP 注册到 Codex（见下文）。

## 安装 / 启用

### 快速手动方式

```bash
# 1. 确保脚本可执行
chmod +x ~/.codex/skills/grok-build/scripts/grok-acp-client.mjs

# 2. 测试是否能调用（会真实生成一张图）
node ~/.codex/skills/grok-build/scripts/grok-acp-client.mjs \
  --prompt "生成一张 1:1 测试苹果图片" --media
```

### 作为 MCP 注册（推荐，与 fal-ai-media 一致）

把下面内容加入你的 MCP 配置（通常 `~/.codex/mcp-configs/mcp-servers.json` 或对应位置）：

```json
{
  "grok-build": {
    "command": "node",
    "args": ["~/.codex/skills/grok-build/scripts/grok-acp-mcp-server.mjs"],
    "env": {
      "GROK_PATH": "$HOME/.grok/bin/grok"
    },
    "description": "Grok Build - 图片/视频/通用任务（使用本地已登录的 Grok Build）"
  }
}
```

然后在 Codex 中启用该 MCP server。

（完整插件安装脚本见 `install.sh`，会自动处理上述步骤。）

## 输出规范

- 始终使用**绝对路径**。
- 图片/视频用标准 Markdown 呈现，Codex 会自动渲染。
- 多结果时逐个列出。

## 与其他媒体工具的关系

| 工具          | 后端               | 登录方式     | 推荐场景                     |
|---------------|--------------------|--------------|------------------------------|
| grok-build    | Grok Build (ACP)   | 本地登录     | 高质量、一致性、想用 Grok 风格 |
| agnes-ai      | Agnes 网关         | API Key      | 快速、已有 Agnes 账号        |
| fal-ai-media  | fal.ai (MCP)       | FAL_KEY      | 特定模型（Kling、Veo 等）    |

你可以混合使用。

## 故障排除

- **提示未登录**：运行 `grok login`。
- **没有生成图片**：在 prompt 里明确说“请调用 image_gen”或使用 `--media` 测试脚本。
- **路径没渲染**：确认是绝对路径，且用 `<path>` 包裹空格。
- **想看详细日志**：运行 bridge 脚本时观察 stderr。

## 开发 / 贡献

脚本位置：
- `scripts/grok-acp-client.mjs` — 核心 ACP 客户端
- 未来会补充 `grok-acp-mcp-server.mjs`

欢迎扩展工具（视频、批量、参考图等）。

---

**让 Codex 真正拥有 Grok Build 的全部力量。**
