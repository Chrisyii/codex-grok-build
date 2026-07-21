# ✨ codex-grok-build

> **把 Grok Build 的魔法杖，塞进 Codex 的手里**

你要是在用 Codex 的时候，也想同时用上 Grok 的多模态能力（生图生视频），以及审查 / 批判 / 委托干活，那么现在可以了。

**codex-grok-build** 是一个轻量 Codex skill + MCP，让你**直接在 Codex 对话里**调用本地已登录的 **Grok Build**。

零额外 Key，文件自动落到项目里，审查和委托也走同一套 MCP。

---

**一句话总结：**
在 Codex 里用 Grok Build：生图、生视频、代码审查、设计批判、任务委托，全都行。

仓库：https://github.com/Chrisyii/codex-grok-build

---

## 🚀 核心亮点

| 特性 | 说明 |
|------|------|
| **零配置媒体魔法** | 对话里说“生成一张赛博猫”，走本地登录态出图 |
| **文件自动归位** | 生成文件会**移动**到 `项目/generated/` |
| **登录态直连** | 用本机 Grok Build，无需新 Key |
| **代码审查** | `grok_review` 只读审查 working tree / 分支 diff |
| **设计批判** | `grok_critique` 对抗式找风险，尽量结构化 findings |
| **任务委托** | `grok_run` 默认可写；只读诊断设 `write: false` |

审查 / 批判 / 委托逻辑适配自 [xai-org/grok-build-plugin-cc](https://github.com/xai-org/grok-build-plugin-cc)（Apache-2.0），去掉了 Claude Code 专用的 marketplace / hooks / session import。详见 `NOTICE`。

---

## Codex 调用方式

| 请求 | MCP 工具 | 必填参数 | 说明 |
| --- | --- | --- | --- |
| 就绪检查 | `grok_check` | — | Node + grok + 登录态 |
| 图片 | `grok_generate_image` | `prompt`、绝对路径 `cwd` | 输出到 `<cwd>/generated/` |
| 视频 | `grok_generate_video` | `prompt`、绝对路径 `cwd` | 同上；可选 `base_image` |
| 代码审查 | `grok_review` | 绝对路径 `cwd` | 只读；可选 `base` / `scope` / `focus` / `model` / `effort` |
| 设计批判 | `grok_critique` | 绝对路径 `cwd` | 只读；结构化 findings |
| 通用委托 | `grok_run` | `prompt` 或 `resume_session_id` | 默认 `write: true` |

## 前置条件

1. 安装并登录 Grok Build：

   ```bash
   grok login
   ```

2. 在 Codex MCP 配置中注册服务。按实际安装路径调整：

   ```toml
   [mcp_servers.grok-build]
   command = "node"
   args = ["/absolute/path/to/codex-grok-build/scripts/grok-acp-mcp-server.mjs"]
   env = { GROK_PATH = "/Users/your-user/.grok/bin/grok" }
   ```

3. 在 Codex 中 reload MCP 或重启。

仓库附带的安装器会把 skill 同步到 `~/.codex/skills/grok-build` 并补充本地 MCP 注册：

```bash
# 一键安装
curl -fsSL https://raw.githubusercontent.com/Chrisyii/codex-grok-build/main/install.sh | bash

# 或本地
bash install.sh
```

## Cursor 支持

同一套 MCP 运行时也可给 Cursor Agent 用：

```bash
bash install-cursor.sh
```

会：

1. 同步共享运行时到 `~/.codex/skills/grok-build`
2. 安装 Cursor skill 到 `~/.cursor/skills/grok-build`
3. 写入 `~/.cursor/mcp.json` 的 `mcpServers.grok-build`

验证（不生成真实媒体）：

```bash
npm test
npm run verify:cursor
```

然后在 Cursor 里 reload MCP / 重启，对话中说「用 Grok 检查一下是否就绪」。

## 使用

```text
用 Grok Build 生成一段六秒视频：清晨一只白鹤在稻田中行走，机位稳定，纪录片风格。
用 Grok 审查当前工作区改动
用 Grok 批判一下相对 main 的设计风险，重点看重试
把 flaky auth 测试调查并修掉，交给 Grok
```

## 可靠性契约

- 图片和视频工具必须传入绝对路径 `cwd`，不依赖不透明的 session 输出位置。
- 桥接只在验证文件存在后移动它，并报告 `generated/` 中的最终路径。
- 缺失文件、非法 Grok 输出、进程启动失败与超时都会成为正常 MCP 错误，不会关闭 MCP 传输。
- 桥接最多捕获 4 MiB 进程输出，单次请求最长十分钟。
- 审查 / 批判默认只读（plan + read-only sandbox）。

## 开发

```bash
npm test
```

测试使用伪 Grok 可执行文件，覆盖文件移动、MCP 协议，以及 check / tools 列表等回归。
