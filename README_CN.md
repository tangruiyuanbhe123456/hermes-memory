# Hermes Memory (五层记忆系统)

**为 AI Agent 打造的五层记忆系统。** 零外部依赖。FTS5 中英文全文搜索。MCP 协议支持。Web 可视化管理面板。梦境归并引擎。AES-256-GCM 加密。

> 🚀 `npx skills init` → `npx skills install memory-system`

---

## 为什么选择 Hermes Memory？

市面上大部分 AI Agent 记忆系统分为两类：
1. **依赖云端**（Mem0、Supermemory）— 需要 API Key、向量数据库、云基础设施
2. **过于简单** — 只能存和读，没有搜索、去重、策略优化

Hermes Memory 是**唯一同时具备离线运行、零外部依赖、L5 自省引擎**的记忆系统——它不仅记录，还能学习*哪些策略有效、哪些无效*。

| 功能 | Hermes Memory | Mem0 | Letta | Supermemory | KeyMemory |
|------|:---:|:---:|:---:|:---:|:---:|
| 离线运行，零外部依赖 | ✅ | ❌ | ✅ | ❌ | ✅ |
| 中英文 FTS5 搜索 | ✅ | ❌ | ❌ | ❌ | ❌ |
| L5 自省引擎 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 梦境归并（去重+合并） | ✅ | ❌ | ❌ | ❌ | ✅ |
| 写入前自动备份 | ✅ | ❌ | ❌ | ❌ | ✅ |
| Web 管理面板 | ✅ | ❌ | ❌ | ✅ | ✅ |
| MCP 服务器 | ✅ | ❌ | ❌ | ❌ | ✅ |
| 多 Agent 支持 | ✅ | ❌ | ✅ | ❌ | ✅ |
| 平台健康追踪 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 踩坑知识库 | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 架构

```
hermes-memory/
├── engine/
│   ├── memory-db.cjs      ← 核心：SQLite FTS5 引擎 + 备份 + 加密
│   ├── dashboard.cjs      ← Web UI (http://127.0.0.1:3210)
│   ├── mcp-server.cjs     ← MCP 协议服务器
│   ├── dream.cjs          ← 梦境归并引擎
│   └── agent-config.cjs   ← Agent 配置生成器
├── memory/                ← 五层记忆数据
│   ├── L1_working/        ← 会话状态
│   ├── L2_episodic/       ← 操作流水
│   ├── L3_semantic/       ← 长期知识
│   ├── L4_procedural/     ← 可复用流程
│   └── L5_metacognitive/  ← 自省与策略评估
├── agent-configs/         ← Claude/Codex/Hermes 即用配置
├── codex-memory/          ← Codex 兼容记忆（同五层）
├── package.json
└── memory.db              ← SQLite FTS5 索引（自动生成）
```

### 五层说明

| 层级 | 名称 | 作用 |
|------|------|------|
| L1 | 工作记忆 | 当前会话状态、草稿 |
| L2 | 情节记忆 | 带时间戳的操作日志（JSONL + FTS5） |
| L3 | 语义记忆 | 长期事实、模式、知识 |
| L4 | 流程记忆 | 可复用工作流、技能、配方 |
| L5 | 元认知 | 策略分析：什么有效、什么无效、下一步怎么走 |

---

## 快速开始

### 安装

```bash
# 通过 skills.sh（推荐 AI Agent 使用）
npx skills init
npx skills install memory-system

# 通过 npm（独立运行）
npm install hermes-memory
npx hermes-memory-dashboard
```

### 启动面板

```bash
node engine/dashboard.cjs
# → http://127.0.0.1:3210
```

### 连接你的 AI Agent

**Hermes Agent** — 安装为 skill（见上方）
**Claude Code** — `cp agent-configs/CLAUDE.md /path/to/project/CLAUDE.md`
**Codex** — MCP 服务器自动检测 Codex 会话
**任何 MCP 兼容 Agent** — 指向 MCP 服务器：

```json
{
  "mcpServers": {
    "hermes-memory": {
      "command": "node",
      "args": ["path/to/engine/mcp-server.cjs"]
    }
  }
}
```

### 运行梦境归并

```bash
# 预览（不写文件）
node engine/dream.cjs --dry-run

# 执行
node engine/dream.cjs
```

### 健康检查

```bash
node -e "const e=require('./engine/memory-db.cjs'); console.log(JSON.stringify(e.dbHealth(),null,2))"
```

---

## 核心功能

### 🔍 FTS5 中英文搜索

与基于向量数据库的系统不同，Hermes Memory 使用 SQLite FTS5 配合 CJK 填充技术，可以不加任何外部依赖地搜索中英文混合查询（如 `"小红书发布pending"`）。

### 🧠 L5 自省引擎

元认知层追踪策略的成败历史，自动推荐最有效的方案。**这是其他记忆系统都没有的能力。**

### 💭 梦境归并

自动去重、合并、归档旧记忆。让你的知识库保持精简，无需手动整理。

### 🔐 AES-256-GCM 加密

加密存储 API Key 和凭据。不需要 `.env` 文件。

### 💾 自动备份

每次写入 L3/L4/L5 前自动备份，保留 7 天。支持事务级恢复。

---

## 竞品对比

| 能力 | Hermes Memory | Mem0 | Supermemory | Letta | KeyMemory |
|------|:---:|:---:|:---:|:---:|:---:|
| **Stars** | 新项目 | 58K | 26K | 23K | 新项目 |
| 离线零依赖 | ✅ | ❌ | ❌ | ✅ | ✅ |
| 中英文 FTS5 | ✅ | ❌ | ❌ | ❌ | ❌ |
| L5 自省 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 梦境归并 | ✅ | ❌ | ❌ | ❌ | ✅ |
| Web 面板 | ✅ | ❌ | ✅ | ❌ | ✅ |
| MCP 协议 | ✅ | ❌ | ❌ | ❌ | ✅ |
| 写入备份 | ✅ | ❌ | ❌ | ❌ | ✅ |
| 平台健康 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 踩坑库 | ✅ | ❌ | ❌ | ❌ | ❌ |
| `npm install` | ✅ | ❌ | ✅ | ✅ | ❌ |

---

## 许可证

MIT
