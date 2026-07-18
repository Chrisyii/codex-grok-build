---
name: grok-build
description: >
  通过直接的 Codex MCP 工具，使用本机已登录的 Grok Build 生成图片和视频。
  当用户明确要求 Grok、Grok Build、Imagine 或 Grok 媒体生成时激活。
---

# Grok Build for Codex

通过已注册的 `grok-build` MCP 服务生成媒体。服务复用本机 Grok 登录态，验证
生成文件后将其移动到当前项目的 `generated/` 目录。

## 必经调用路径

用户要求生成媒体时，直接调用 MCP 工具。正常交付中不得手工调用 Grok CLI、ACP
客户端或桥接脚本。

1. 生成图片：调用 `grok_generate_image`，传入 `prompt`、用户指定时的
   `aspect_ratio`，以及项目绝对路径 `cwd`。
2. 生成视频：调用 `grok_generate_video`，传入 `prompt`、可选的绝对路径
   `base_image`，以及项目绝对路径 `cwd`。
3. 仅返回 MCP 工具实际报告的绝对媒体路径，并以 Markdown 媒体格式呈现。

图片和视频调用都必须传入 `cwd`。这样文件必定落在
`<cwd>/generated/`，不会遗留在 Grok session 目录。

```js
grok_generate_video({
  prompt: '清晨，一只白鹤在稻田中行走，纪录片风格。',
  cwd: '/absolute/path/to/project',
})
```

## 失败处理

如果媒体 MCP 工具不可用，应明确报告 `grok-build` MCP 服务未注册或未加载。不得
改走手工 CLI 或 ACP 备用路径；它们属于桥接内部实现，无法保证同样的输出契约。
如果工具返回错误，直接报告错误，不得声称媒体已生成。

## 输出要求

- 只使用绝对路径。
- 只有工具返回媒体路径时才能报告成功。
- 提示词必须保留用户要求的时长、比例、主体与排除项。
- 多个结果逐个呈现。

## 安装与验证

本机必须安装并登录 Grok。用 `mcp-example/grok-acp.json` 中的配置注册 MCP 服务，
然后在 Codex 中 reload MCP。桥接实现与测试是内部细节；在此 skill 目录运行
`npm test` 验证修改。
