// ============================================================
// engine/agent-config.cjs — 多 Agent 配置模板生成器
// 生成 Hermes/Codex/Claude Code/OpenClaw/Cursor/Gemini 的
// MCP 接入配置片段
// ============================================================
// KeyMemory 移植: Agent Config 生成
// 用法: node engine/agent-config.cjs [target]
//   target: hermes | codex | claude-code | openclaw | cursor | gemini | all
// ============================================================

const path = require("path");
const fs = require("fs");

const MCP_SCRIPT = path.resolve(__dirname, "mcp-server.cjs");
const engine = require("./memory-db.cjs");
const HERMES_HOME = engine.HERMES_HOME;

// ---- 各 Agent 配置文件模板 ----

const TEMPLATES = {
  "claude-code": {
    name: "Claude Code",
    file: "CLAUDE.md",
    content: () => `
## Memory MCP Integration

Claude Code can access the Hermes Memory system via MCP.

### Setup

Add to your \`~/.claude/claude_desktop_config.json\` or project \`.mcp.json\`:

\`\`\`json
{
  "mcpServers": {
    "hermes-memory": {
      "command": "node",
      "args": ["${MCP_SCRIPT.replace(/\\/g, "\\\\")}"],
      "env": {}
    }
  }
}
\`\`\`

### Available Tools

| Tool | Description |
|------|-------------|
| \`memory_search\` | Full-text search (Chinese + English) |
| \`memory_create\` | Create a new memory |
| \`memory_get_related\` | Get related memories |
| \`memory_add_relation\` | Create relation between memories |
| \`memory_list_projects\` | List project tree |
| \`memory_ensure_project\` | Create/ensure project path |
| \`memory_assign_project\` | Assign memory to project |
| \`memory_context_pack\` | Generate project context summary |
| \`memory_backup_list\` | List backups |
| \`memory_health\` | System health check |

### Usage

When starting a new task related to a known project, call:
\`\`\`
memory_context_pack project="运营/小红书"
\`\`\`

To search past memories:
\`\`\`
memory_search query="小红书发布规则"
\`\`\`

To save important decisions:
\`\`\`
memory_create platform="claude" action="decision" summary="..." project="运营/小红书"
\`\`\`
`,
  },

  "claude-desktop": {
    name: "Claude Desktop",
    file: "claude_desktop_config.json",
    content: () => JSON.stringify({
      mcpServers: {
        "hermes-memory": {
          command: "node",
          args: [MCP_SCRIPT],
        },
      },
    }, null, 2),
  },

  openclaw: {
    name: "OpenClaw",
    file: "OPENCLAW.md",
    content: () => `
## Memory MCP Integration for OpenClaw

Add to OpenClaw's MCP configuration:

\`\`\`yaml
# openclaw.yml or ~/.openclaw/config.yml
mcp_servers:
  hermes-memory:
    command: node
    args:
      - ${MCP_SCRIPT}
\`\`\`

Then in agent prompts, reference:
- Use \`memory_search\` to recall past decisions
- Use \`memory_context_pack\` for project context
- Use \`memory_create\` to save new learnings
`,
  },

  cursor: {
    name: "Cursor",
    file: ".cursor/mcp.json",
    content: () => JSON.stringify({
      mcpServers: {
        "hermes-memory": {
          command: "node",
          args: [MCP_SCRIPT],
        },
      },
    }, null, 2),
  },

  gemini: {
    name: "Gemini Code Assist",
    file: "GEMINI.md",
    content: () => `
## Gemini MCP Integration

\`\`\`json
{
  "mcpServers": {
    "hermes-memory": {
      "command": "node",
      "args": ["${MCP_SCRIPT.replace(/\\/g, "\\\\")}"]
    }
  }
}
\`\`\`
`,
  },

  hermes: {
    name: "Hermes Agent",
    file: "hermes-mcp-config.yaml",
    content: () => `
# Hermes Agent MCP Config
# Add this to your hermes config.yaml under mcp_servers:

mcp_servers:
  hermes-memory:
    transport: stdio
    command: node
    args:
      - ${MCP_SCRIPT}
`,
  },

  generic: {
    name: "Generic MCP",
    file: "mcp-config.json",
    content: () => JSON.stringify({
      mcpServers: {
        "hermes-memory": {
          command: "node",
          args: [MCP_SCRIPT],
          description: "Hermes Five-Layer Memory System - Search, create, relate, and manage memories",
        },
      },
    }, null, 2),
  },
};

// ---- CLI ----

function printConfig(target) {
  const t = TEMPLATES[target];
  if (!t) {
    console.error(`未知目标: ${target}`);
    console.error(`可用: ${Object.keys(TEMPLATES).join(", ")}`);
    process.exit(1);
  }

  console.log(`\n=== ${t.name} 配置 ===`);
  console.log(`配置文件: ${t.file}`);
  console.log(`MCP 脚本路径: ${MCP_SCRIPT}`);
  console.log("=".repeat(50));
  console.log(t.content());
}

function writeConfigs(outputDir) {
  const dir = outputDir || path.join(HERMES_HOME, "agent-configs");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let count = 0;
  for (const [key, t] of Object.entries(TEMPLATES)) {
    const filePath = path.join(dir, t.file);
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
    fs.writeFileSync(filePath, t.content(), "utf-8");
    console.log(`  ✅ ${key}: ${filePath}`);
    count++;
  }
  console.log(`\n已生成 ${count} 个配置文件到 ${dir}`);
  return count;
}

// ---- 导出 ----
module.exports = {
  TEMPLATES,
  printConfig,
  writeConfigs,
  getConfigForAgent: (target) => {
    const t = TEMPLATES[target];
    if (!t) return null;
    return { name: t.name, file: t.file, content: t.content() };
  },
};

// ---- CLI ----
if (require.main === module) {
  const target = process.argv[2] || "all";
  const outputDir = process.argv[3];

  if (target === "all") {
    writeConfigs(outputDir);
  } else if (target === "write") {
    writeConfigs(outputDir);
  } else {
    printConfig(target);
  }
}
