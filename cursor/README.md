# Cursor 安装说明

Cursor 与 Codex **共用**同一份 skill：`~/.codex/skills/grok-build/SKILL.md`。

Cursor 会自动发现 `~/.codex/skills`，因此 **不要**再往 `~/.cursor/skills/grok-build`
复制一份，否则技能面板会出现两个 `grok-build`。

Cursor 侧只需要：

```bash
bash install-cursor.sh
```

它会：

1. 同步共享运行时到 `~/.codex/skills/grok-build`
2. 删除可能存在的 `~/.cursor/skills/grok-build` 重复副本
3. 写入 `~/.cursor/mcp.json` 的 `mcpServers.grok-build`

验证：

```bash
npm run verify:cursor
```
