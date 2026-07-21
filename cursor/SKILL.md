---
name: grok-build
description: >-
  Use the local logged-in Grok Build via Cursor MCP for image/video generation,
  code review, design critique, and task delegation. Activate when the user
  mentions Grok, Grok Build, Imagine, or asks to review/critique/delegate with Grok.
---

# Grok Build for Cursor

通过已注册的 `grok-build` MCP 服务调用本机 Grok。媒体落到项目 `generated/`；
审查/批判只读；委托默认可写。

## 必经调用路径

用户要求 Grok 能力时，用 Cursor 的 MCP 工具调用（`CallMcpTool` / 等价 MCP 调用）。
正常交付中不得手工跑 `grok` CLI、ACP 客户端或桥接脚本。

调用前如需确认工具 schema，先对 `grok-build` 服务做工具发现。

| 需求 | MCP 工具 | 关键参数 |
| --- | --- | --- |
| 就绪检查 | `grok_check` | 可选 `cwd` |
| 生成图片 | `grok_generate_image` | `prompt`、绝对路径 `cwd`；可选 `aspect_ratio` |
| 生成视频 | `grok_generate_video` | `prompt`、绝对路径 `cwd`；可选 `base_image` |
| 代码审查（只读） | `grok_review` | 绝对路径 `cwd`；可选 `base` / `scope` / `focus` / `model` / `effort` |
| 设计批判（只读） | `grok_critique` | 同 `grok_review` |
| 任意委托 | `grok_run` | `prompt`（或 `resume_session_id`）；可选 `cwd` / `write` / `model` / `effort` |

服务器名：`grok-build`。

### 媒体

```js
grok_generate_video({
  prompt: '清晨，一只白鹤在稻田中行走，纪录片风格。',
  cwd: '/absolute/path/to/project',
})
```

图片和视频都必须传入绝对路径 `cwd`，文件落在 `<cwd>/generated/`。
成功后只报告工具返回的绝对路径，并用 Markdown 媒体语法展示。

### 审查 / 批判

```js
grok_review({ cwd: '/absolute/path/to/project', scope: 'working-tree' })
grok_critique({ cwd: '/absolute/path/to/project', base: 'main', focus: '缓存与重试' })
```

- `scope`: `auto`（默认）| `working-tree` | `branch`
- 只读；不要用它们改代码
- 原样呈现工具返回文本

### 委托

```js
grok_run({
  prompt: '调查 auth 里的 flaky 测试并修复',
  cwd: '/absolute/path/to/project',
  write: true,
})
```

- 默认 `write: true`；只读诊断设 `write: false`
- 继续上次会话：传入返回的 `resume_session_id`

## 失败处理

若 MCP 工具不可用或服务未加载，明确报告 `grok-build` 未注册。不得改走手工 CLI。
工具报错时直接转述，不得声称已成功。

## 安装

```bash
bash install-cursor.sh
```

会同步运行时到 `~/.codex/skills/grok-build`，安装本 skill 到 `~/.cursor/skills/grok-build`，
并写入 `~/.cursor/mcp.json`。然后在 Cursor 中 reload MCP 或重启。
