
## Memory MCP Integration

Claude Code can access the Hermes Memory system via MCP.

### Setup

Add to your `~/.claude/claude_desktop_config.json` or project `.mcp.json`:

```json
{
  "mcpServers": {
    "hermes-memory": {
      "command": "node",
      "args": ["D:\\hermes-hermes\\engine\\mcp-server.cjs"],
      "env": {}
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `memory_search` | Full-text search (Chinese + English) |
| `memory_create` | Create a new memory |
| `memory_get_related` | Get related memories |
| `memory_add_relation` | Create relation between memories |
| `memory_list_projects` | List project tree |
| `memory_ensure_project` | Create/ensure project path |
| `memory_assign_project` | Assign memory to project |
| `memory_context_pack` | Generate project context summary |
| `memory_backup_list` | List backups |
| `memory_health` | System health check |

### Usage

When starting a new task related to a known project, call:
```
memory_context_pack project="运营/小红书"
```

To search past memories:
```
memory_search query="小红书发布规则"
```

To save important decisions:
```
memory_create platform="claude" action="decision" summary="..." project="运营/小红书"
```
