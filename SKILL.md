---
name: grok-build
description: >
  通过 Codex MCP 调用本机已登录的 Grok Build：生成图片/视频、代码审查、设计批判、
  任意任务委托。当用户明确要求 Grok、Grok Build、Imagine、审查委托给 Grok 时激活。
---

# Grok Build for Codex

通过已注册的 `grok-build` MCP 服务使用本机 Grok。媒体文件会落到项目 `generated/`；
审查/批判为只读；委托默认可写。

## 必经调用路径

用户要求 Grok 能力时，直接调用 MCP 工具。正常交付中不得手工调用 Grok CLI、ACP
客户端或桥接脚本。

| 需求 | 工具 | 关键参数 |
| --- | --- | --- |
| 就绪检查 | `grok_check` | 可选 `cwd` |
| 生成图片 | `grok_generate_image` | `prompt`、绝对路径 `cwd`；可选 `aspect_ratio` |
| 生成视频 | `grok_generate_video` | `prompt`、绝对路径 `cwd`；可选 `base_image` |
| 代码审查（只读） | `grok_review` | 绝对路径 `cwd`；可选 `base` / `scope` / `focus` / `model` / `effort` |
| 设计批判（只读） | `grok_critique` | 同 `grok_review` |
| 任意委托 | `grok_run` | `prompt`（或 `resume_session_id`）；可选 `cwd` / `write` / `model` / `effort` |

### 媒体

```js
grok_generate_video({
  prompt: '清晨，一只白鹤在稻田中行走，纪录片风格。',
  cwd: '/absolute/path/to/project',
})
```

图片和视频都必须传入绝对路径 `cwd`，文件落在 `<cwd>/generated/`。

### 审查 / 批判

```js
grok_review({ cwd: '/absolute/path/to/project', scope: 'working-tree' })
grok_critique({ cwd: '/absolute/path/to/project', base: 'main', focus: '缓存与重试' })
```

- `scope`: `auto`（默认）| `working-tree` | `branch`
- 有未提交改动时 `auto` 审 working tree；否则审相对默认分支的 branch diff
- 只读；不要用它们改代码

### 委托

```js
grok_run({
  prompt: '调查 auth 里的 flaky 测试并修复',
  cwd: '/absolute/path/to/project',
  write: true,
})
```

- 默认 `write: true`（可改文件）
- 只读诊断设 `write: false`
- 继续上次会话：传入上次返回的 `resume_session_id`（Grok session ID）

## 失败处理

如果 MCP 工具不可用，明确报告 `grok-build` MCP 服务未注册或未加载。不得改走手工
CLI 备用路径。工具返回错误时直接报告，不得声称已成功。

## 输出要求

- 媒体：只使用工具返回的绝对路径，并以 Markdown 媒体格式呈现
- 审查/批判/委托：原样呈现工具返回的文本；若有 session ID，告知用户可 resume
- 提示词保留用户要求的时长、比例、主体、关注点与排除项

## 安装与验证

本机必须安装并登录 Grok。用 `mcp-example/grok-acp.json` 或 `install.sh` 注册 MCP，
然后在 Codex 中 reload MCP。在本 skill 目录运行 `npm test` 验证修改。
