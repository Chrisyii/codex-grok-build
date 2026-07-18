# ✨ codex-grok-build

> **把 Grok Build 的魔法杖，塞进 Codex 的手里**

你是不是经常在 Codex 里写代码写到一半，想：“要是能直接让 Grok Build 给我生成张酷图，或者拍个短视频就好了”？

现在可以了。

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
| **和平共处**       | 和 fal-ai、agnes 一起用，想切就切         |

---

## ⚡ 一键安装（推荐）

你只需要执行下面这行命令即可完成安装：

```bash
curl -fsSL https://raw.githubusercontent.com/Chrisyii/codex-grok-build/main/install.sh | bash
```

安装脚本会自动完成：
- 克隆仓库到 `~/.codex/skills/grok-build`
- 尝试写入 MCP 配置到 `~/.codex/config.toml`
- 检查 Grok Build 环境
- 给出测试命令

或者使用 git 方式（推荐，便于后续更新）：

```bash
git clone git@github.com:Chrisyii/codex-grok-build.git ~/.codex/skills/grok-build
cd ~/.codex/skills/grok-build
bash install.sh
```

---

## 🛠️ 使用方法

安装并在 Codex 中 reload MCP 后，直接在对话里说就行：

### 图像生成
```
生成一张 16:9 的未来赛博城市夜景，霓虹雨夜，电影感
用 Grok Build 做
```

### 视频生成
```
用 Grok 做一个 6 秒的爵士猫在钢琴上跳舞的短视频
```

### 迭代编辑（超级好用）
```
基于上一张图，改成白天版本，加一辆飞驰的悬浮车
```

### 通用委托
```
delegate to grok: 分析当前项目架构，给出 3 个最值得优化的点
```

Codex 的 agent 会自动发现 `grok-build` 工具并调用。

---

## 📁 文件输出说明

生成的文件**不会**留在 Grok 的 session 文件夹，而是会被**移动**到：

```
你的当前项目/generated/
```

例如：
```
project/generated/1721301234567-1.jpg
```

这样你可以在项目里直接引用、管理，干净又方便。

---

## 🧩 如何在 Codex 中启用 MCP

install.sh 会尽量自动添加配置到 `~/.codex/config.toml`。

如果需要手动添加（或使用 mcp-configs 方式），复制下面内容：

```json
{
  "grok-build": {
    "command": "node",
    "args": ["$HOME/.codex/skills/grok-build/scripts/grok-acp-mcp-server.mjs"],
    "env": {
      "GROK_PATH": "$HOME/.grok/bin/grok"
    },
    "description": "Grok Build - 图片/视频/通用任务（使用本地已登录的 Grok Build）"
  }
}
```

添加后在 Codex 执行 `reload MCP` 或重启。

---

## 🔧 工具列表（MCP）

注册后 Codex 会看到以下工具：

- `grok_generate_image` — 生成图片（支持 aspect_ratio + cwd）
- `grok_generate_video` — 生成视频（支持参考图 + cwd）
- `grok_run` — 通用任务委托

推荐在 prompt 中让 agent 传入当前项目路径（`cwd`），以便文件正确归位。

---

## 🏗️ 工作原理（简要）

Codex Skill/MCP → 调用本地桥接脚本  
→ 通过 `grok -p --yolo --cwd 项目路径` 或 ACP stdio 调用 Grok Build  
→ Grok 使用完整 Imagine 工具 + grok-media 专业流程  
→ 生成的文件被桥接脚本移动到项目 `generated/` 目录  
→ 返回 Markdown 路径给 Codex 直接渲染

支持两种后端（优先 headless，更稳定；ACP 更丰富）。

---

## ❓ 常见问题

**Q: 提示没登录？**  
A: 运行 `grok login` 或 `~/.grok/bin/grok login`

**Q: 文件没出现在项目里？**  
A: 确保调用时传了 `cwd`，或者手动指定项目路径测试。

**Q: 想同时用 fal / agnes？**  
A: 完全没问题！这个插件是并存的，你可以随时切换。

**Q: 第一次生成很慢？**  
A: 正常，模型加载 + 推理需要时间。后续会快很多。

---

## 🤝 贡献

欢迎提 Issue / PR！

- 改进提示词工程
- 增加更多 Grok 工具支持
- 优化文件移动逻辑
- 添加更多使用示例

---

## 📜 License

MIT

---

**让 Codex 拥有 Grok Build 的全部力量。**

*Now go create something beautiful.* ✨

如果这个插件帮到了你，欢迎 star ⭐ 和分享！

## 开发

主要文件：
- `SKILL.md` — Codex skill 定义
- `scripts/grok-acp-client.mjs` — ACP 客户端核心（可独立运行）

想扩展更多工具（批量生成、视频拼接控制等）可以继续丰富 client。

## 注意事项

- 第一次生成可能较慢（模型加载）。
- 确保 Grok Build 已经 `grok login`。
- 生成的文件现在会自动复制到你当前 Codex 项目的 `generated/` 目录下（非常好找）。

## 如何分享给其他人

### 准备工作

1. 把整个文件夹推送到 GitHub（推荐仓库名保持 `codex-grok-build`）。
2. 把仓库里的 install.sh 和 README 中的占位符替换成你的 GitHub 用户名（当前已使用 Chrisyii）。
3. 提交并 push。

### 一键安装方式

最简单的一键命令：

```bash
curl -fsSL https://raw.githubusercontent.com/Chrisyii/codex-grok-build/main/install.sh | bash
```

这会：
- 自动 clone 完整仓库到 `~/.codex/skills/grok-build`
- 运行安装逻辑（包括自动 MCP 配置）
- 检查 Grok Build 环境

Git 手动方式（推荐，便于后续更新）：

```bash
git clone https://github.com/Chrisyii/codex-grok-build ~/.codex/skills/grok-build
cd ~/.codex/skills/grok-build
bash install.sh
```

### 更新插件

以后想更新可以执行：

```bash
cd ~/.codex/skills/grok-build
git pull
bash install.sh
```

### 额外建议

- 在仓库 README 里放使用示例和已知问题。
- 可以加一个 `CHANGELOG.md`。
- 如果想更进一步，可以把这个 skill 做成跨工具包（支持 Codex / Claude / Cursor）。

安装脚本已经支持远程一键安装，新用户基本不用敲太多命令。

---

让 Codex 拥有 Grok Build 的全部力量。
