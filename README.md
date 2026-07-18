# ✨ codex-grok-build

> **把 Grok Build 的魔法杖，塞进 Codex 的手里**

你要是在用codex的时候，也想同时用上grok的多模态能力，生图生视频，那么，现在可以了


**codex-grok-build** 是一个轻量却强大的 Codex 插件，让你**直接在 Codex 对话里**调用你本地已登录的 **Grok Build**（包括它那变态级别的 Imagine 图像/视频生成能力 + 完整 Agent 工具链）。

零额外 Key，零配置，文件还自动飞到你项目里。

---

**一句话总结：**
在 Codex 里用 Grok Build，生图、生视频、干活，全都行。就像给 Codex 装了个 Grok Build 的外挂。

---

## 🚀 核心亮点

| 特性               | 说明                                      |
|--------------------|-------------------------------------------|
| **零配置媒体魔法** | 直接在对话里说“生成一张赛博猫”，Grok Build 的 Imagine 马上出图 |
| **文件自动归位**   | 生成的文件会**移动**（剪切）到 `项目/generated/`，不留双份垃圾 |
| **登录态直连**     | 用你本地的 Grok Build 登录态，无需新 Key   |
| **专业级媒体流程** | 自动遵循 Grok 的 grok-media 工作流（一致性、镜头设计） |
| **不只是生图**     | 还能委托 review、架构分析、写代码等复杂任务 |
|       |          |

---

## Codex 调用方式

Codex 只有一条正常调用路径：

| 请求 | MCP 工具 | 必填参数 | 输出 |
| --- | --- | --- | --- |
| 图片 | `grok_generate_image` | `prompt`、绝对路径 `cwd` | `<cwd>/generated/<file>` |
| 视频 | `grok_generate_video` | `prompt`、绝对路径 `cwd` | `<cwd>/generated/<file>` |
| 通用委托 | `grok_run` | `prompt` | 文本；有媒体时附带路径 |

MCP 服务调用本机 `grok` 二进制，校验其 JSON 返回结果，只移动磁盘上真实存在的文件，
并返回最终绝对路径。Codex 不需要直接调用 Grok CLI 或 ACP 脚本。

## 前置条件

1. 安装并登录 Grok Build：

   ```bash
   grok login
   ```

2. 在 Codex MCP 配置中注册服务。按实际安装路径调整：

   ```toml
   [mcp_servers.grok-build]
   command = "node"
   args = ["/absolute/path/to/codex-grok/scripts/grok-acp-mcp-server.mjs"]
   env = { GROK_PATH = "/Users/your-user/.grok/bin/grok" }
   ```

3. 在 Codex 中 reload MCP 或重启。

仓库附带的安装器会把 skill 同步到 `~/.codex/skills/grok-build` 并补充本地 MCP
注册：

```bash
bash install.sh
```

## 使用

直接要求 Codex 生成媒体：

```text
用 Grok Build 生成一段六秒视频：清晨一只白鹤在稻田中行走，机位稳定，纪录片风格。
```

skill 会让 Codex 调用 `grok_generate_video` 并传入当前项目绝对路径。成功结果从
`generated/` 返回，Codex 可以直接渲染。

## 可靠性契约

- 图片和视频工具必须传入绝对路径 `cwd`，不依赖不透明的 session 输出位置。
- 桥接只在验证文件存在后移动它，并报告 `generated/` 中的最终路径。
- 缺失文件、非法 Grok 输出、进程启动失败与超时都会成为正常 MCP 错误，不会关闭
  MCP 传输。
- 桥接最多捕获 4 MiB 进程输出，单次请求最长十分钟。

## 开发

运行不生成真实媒体的回归测试：

```bash
npm test
```

测试使用伪 Grok 可执行文件，覆盖文件移动、不可访问输出与 MCP 请求/响应协议。
