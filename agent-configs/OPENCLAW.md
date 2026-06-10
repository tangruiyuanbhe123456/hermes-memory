
## Memory MCP Integration for OpenClaw

Add to OpenClaw's MCP configuration:

```yaml
# openclaw.yml or ~/.openclaw/config.yml
mcp_servers:
  hermes-memory:
    command: node
    args:
      - D:\hermes-hermes\engine\mcp-server.cjs
```

Then in agent prompts, reference:
- Use `memory_search` to recall past decisions
- Use `memory_context_pack` for project context
- Use `memory_create` to save new learnings
