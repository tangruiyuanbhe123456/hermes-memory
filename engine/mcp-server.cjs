// ============================================================
// engine/mcp-server.cjs — STDI/O MCP Server
// 暴露五层记忆为 MCP 工具，任何 MCP 兼容 Agent 均可接入
// ============================================================
// KeyMemory 移植: MCP Server 兼容
// 用法: node engine/mcp-server.cjs
// 接入: 在 Agent 配置中指向本脚本
// ============================================================

const engine = require("./memory-db.cjs");

// ---- MCP Protocol Helpers ----
function jsonRpc(id, result, error) {
  const msg = { jsonrpc: "2.0" };
  if (id !== undefined) msg.id = id;
  if (error) msg.error = { code: error.code || -32603, message: error.message || "Internal error" };
  else msg.result = result;
  return JSON.stringify(msg) + "\n";
}

// ---- Tool Definitions ----
const TOOLS = [
  {
    name: "memory_search",
    description: "全文搜索记忆（支持中英文），可按平台/来源/项目/时间范围过滤",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索关键词（中英文混合）" },
        platform: { type: "string", description: "平台过滤: xhs/douyin/wechat/xianyu" },
        source: { type: "string", description: "来源: hermes/codex" },
        project: { type: "string", description: "项目路径过滤" },
        days: { type: "number", description: "最近 N 天" },
        limit: { type: "number", default: 20 },
      },
    },
  },
  {
    name: "memory_create",
    description: "创建一条新的记忆",
    inputSchema: {
      type: "object",
      properties: {
        platform: { type: "string" },
        action: { type: "string" },
        status: { type: "string" },
        summary: { type: "string", description: "记忆内容/摘要" },
        tags: { type: "array", items: { type: "string" } },
        project: { type: "string", description: "项目路径" },
        source: { type: "string", default: "mcp" },
      },
      required: ["summary"],
    },
  },
  {
    name: "memory_get_related",
    description: "查看与某条记忆相关的其他记忆（relates_to / supersedes / references）",
    inputSchema: {
      type: "object",
      properties: {
        memory_id: { type: "number", description: "记忆 ID" },
        type: { type: "string", description: "关系类型过滤" },
      },
      required: ["memory_id"],
    },
  },
  {
    name: "memory_add_relation",
    description: "在两条记忆之间创建关系",
    inputSchema: {
      type: "object",
      properties: {
        source_id: { type: "number" },
        target_id: { type: "number" },
        type: { type: "string", enum: ["relates_to", "supersedes", "references"] },
        note: { type: "string" },
      },
      required: ["source_id", "target_id"],
    },
  },
  {
    name: "memory_list_projects",
    description: "列出所有项目树",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "memory_ensure_project",
    description: "创建或确保项目路径存在",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "项目路径，如 运营/小红书" },
        description: { type: "string" },
      },
      required: ["path"],
    },
  },
  {
    name: "memory_assign_project",
    description: "将记忆分配到项目",
    inputSchema: {
      type: "object",
      properties: {
        memory_id: { type: "number" },
        project: { type: "string" },
      },
      required: ["memory_id", "project"],
    },
  },
  {
    name: "memory_context_pack",
    description: "生成当前项目上下文包（给 Agent 启动时注入）",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "项目路径" },
        days: { type: "number", default: 7, description: "回顾最近 N 天" },
        include_relations: { type: "boolean", default: true },
      },
    },
  },
  {
    name: "memory_backup_list",
    description: "列出所有备份",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "memory_health",
    description: "记忆系统健康检查",
    inputSchema: { type: "object", properties: {} },
  },
];

// ---- Tool Handlers ----
const HANDLERS = {
  memory_search: (args) => {
    const opts = {};
    if (args.query) opts.query = args.query;
    if (args.platform) opts.platform = args.platform;
    if (args.source) opts.source = args.source;
    if (args.project) opts.project = args.project;
    if (args.days) opts.days = args.days;
    opts.limit = args.limit || 20;
    return engine.dbSearchEpisodes(opts);
  },

  memory_create: (args) => {
    const ok = engine.dbRecordEpisode({
      timestamp: new Date().toISOString(),
      platform: args.platform || "",
      action: args.action || "",
      status: args.status || "",
      summary: args.summary,
      tags: args.tags || [],
      project: args.project || "",
    }, args.source || "mcp");
    return { ok, id: ok ? "auto" : null };
  },

  memory_get_related: (args) => engine.getRelated(args.memory_id, args.type || null),

  memory_add_relation: (args) => ({
    ok: engine.addRelation(args.source_id, args.target_id, args.type || "relates_to", args.note || ""),
  }),

  memory_list_projects: () => engine.getProjectTree(),

  memory_ensure_project: (args) => ({
    ok: engine.ensureProject(args.path, args.description || ""),
  }),

  memory_assign_project: (args) => ({
    ok: engine.assignToProject(args.memory_id, args.project),
  }),

  memory_context_pack: (args) => {
    const project = args.project || "";
    const days = args.days || 7;
    const parts = [];

    // 项目相关记忆
    if (project) {
      const memories = engine.dbSearchEpisodes({ project, days, limit: 20 });
      if (memories.length > 0) {
        parts.push(`## 项目: ${project}`);
        for (const m of memories.slice(0, 10)) {
          parts.push(`- [${m.platform}] ${m.action}: ${m.summary} (${(m.timestamp||"").substring(0,10)})`);
        }
      }

      // 子项目
      const projects = engine.listProjects();
      const children = projects.filter(p => p.parent_path === project);
      if (children.length > 0) {
        parts.push(`\n子项目: ${children.map(c => c.path).join(", ")}`);
      }

      // 关系
      if (args.include_relations !== false) {
        for (const m of memories) {
          const rels = engine.getRelated(m.id);
          if (rels.length > 0) {
            parts.push(`\n记忆 #${m.id} 相关: ${rels.map(r => `${r.type} → #${r.related_memory?.id||'?'}`).join(", ")}`);
          }
        }
      }
    }

    // 最近记忆摘要
    const recent = engine.dbSearchEpisodes({ days, limit: 5 });
    if (recent.length > 0) {
      parts.push(`\n## 最近操作 (${days}天)`);
      for (const m of recent) {
        parts.push(`- [${m.platform}] ${m.summary}`);
      }
    }

    // 统计
    const health = engine.dbHealth();
    parts.push(`\n## 统计`);
    parts.push(`- 记忆总数: ${health.count}`);
    parts.push(`- 关系数: ${health.relations}`);
    parts.push(`- 项目数: ${health.projects}`);

    return { context: parts.join("\n") };
  },

  memory_backup_list: () => engine.listBackups(),

  memory_health: () => engine.dbHealth(),
};

// ---- MCP 协议处理 ----
function handleMessage(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    process.stdout.write(jsonRpc(null, null, { code: -32700, message: "Parse error" }));
    return;
  }

  const { id, method, params = {} } = msg;

  try {
    switch (method) {
      case "initialize":
        process.stdout.write(jsonRpc(id, {
          protocolVersion: "0.1.0",
          capabilities: { tools: {} },
          serverInfo: { name: "hermes-memory", version: "2.0.0" },
        }));
        break;

      case "notifications/initialized":
        // 忽略通知
        break;

      case "tools/list":
        process.stdout.write(jsonRpc(id, { tools: TOOLS }));
        break;

      case "tools/call":
        if (!params.name || !HANDLERS[params.name]) {
          process.stdout.write(jsonRpc(id, null, { code: -32601, message: `Tool not found: ${params.name}` }));
          return;
        }
        const result = HANDLERS[params.name](params.arguments || {});
        process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }));
        break;

      default:
        process.stdout.write(jsonRpc(id, null, { code: -32601, message: `Method not found: ${method}` }));
    }
  } catch (e) {
    process.stdout.write(jsonRpc(id, null, { code: -32603, message: e.message }));
  }
}

// ---- 主循环：stdio JSON-RPC ----
let buffer = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() || ""; // 不完整行留到下次
  for (const line of lines) {
    if (line.trim()) handleMessage(line.trim());
  }
});
process.stdin.on("end", () => {
  if (buffer.trim()) handleMessage(buffer.trim());
});

// 静默模式（不输出启动信息，避免污染 MCP stdio）
if (require.main === module) {
  // 只输出一行到 stderr（MCP 协议只读 stdout）
  process.stderr.write("🧠 Hermes Memory MCP Server started\n");
}
