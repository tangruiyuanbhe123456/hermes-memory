# Hermes Memory

**Five-layer memory system for AI agents.** One runtime dep (better-sqlite3). FTS5 full-text search. MCP protocol. Web dashboard. Dream consolidation. AES-256-GCM encryption. Portable install path via `HERMES_MEMORY_HOME`. Dashboard port configurable via `HERMES_MEMORY_PORT`.

> 🚀 `npx skills init` → then `npx skills install memory-system`

🌐 **Languages:** [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README_CN.md)

---

## Why Hermes Memory?

Most AI agent memory systems fall into two camps:
1. **Cloud-dependent** (Mem0, Supermemory) — need API keys, vector DBs, cloud infra
2. **Too simple** — just save/recall, no search, no dedup, no strategy

Hermes Memory is **the only offline-first, zero-dependency memory system with a self-reflection (L5) engine** — it doesn't just remember, it learns *which strategies work and which don't*.

| Feature | Hermes Memory | Mem0 | Letta | Supermemory | KeyMemory |
|---------|:---:|:---:|:---:|:---:|:---:|
| Offline-only, zero external deps | ✅ | ❌ | ✅ | ❌ | ✅ |
| FTS5 Chinese+English search | ✅ | ❌ | ❌ | ❌ | ❌ |
| Self-reflection engine (L5) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Dream consolidation (dedup+merge) | ✅ | ❌ | ❌ | ❌ | ✅ |
| Write-before-write auto backup | ✅ | ❌ | ❌ | ❌ | ✅ |
| Web UI dashboard | ✅ | ❌ | ❌ | ✅ | ✅ |
| MCP server (any agent) | ✅ | ❌ | ❌ | ❌ | ✅ |
| Multi-agent (Codex+Claude+Hermes) | ✅ | ❌ | ✅ | ❌ | ✅ |
| Platform health tracking | ✅ | ❌ | ❌ | ❌ | ❌ |
| Pitfall knowledge base | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Architecture

```
hermes-memory/
├── engine/
│   ├── memory-db.cjs      ← Core: SQLite FTS5 engine + backup + encryption
│   ├── dashboard.cjs      ← Web UI (http://127.0.0.1:3210)
│   ├── mcp-server.cjs     ← MCP protocol server
│   ├── dream.cjs          ← Dream consolidation engine
│   └── agent-config.cjs   ← Agent config generator
├── memory/                ← 5-layer memory data
│   ├── L1_working/        ← Session state
│   ├── L2_episodic/       ← Operation timeline
│   ├── L3_semantic/       ← Long-term knowledge
│   ├── L4_procedural/     ← Reusable skills
│   └── L5_metacognitive/  ← Self-reflection, strategy evaluation
├── agent-configs/         ← Ready-to-use configs for Claude/Codex/Hermes
├── codex-memory/          ← Codex-compatible memory (same 5 layers)
├── package.json
└── memory.db              ← SQLite FTS5 index (auto-generated)
```

### The Five Layers

| Layer | Name | Purpose |
|-------|------|---------|
| L1 | Working | Current session state, scratchpad |
| L2 | Episodic | Action log with timestamps (JSONL + FTS5) |
| L3 | Semantic | Long-term facts, patterns, knowledge |
| L4 | Procedural | Reusable workflows, skills, recipes |
| L5 | Metacognitive | Strategy analysis: what worked, what didn't, what to try next |

---

## Quick Start

### Install

```bash
# Via skills.sh (recommended for AI agents)
npx skills init
npx skills install memory-system

# Via npm (standalone)
npm install hermes-memory
npx hermes-memory-dashboard
```

### Start the Dashboard

```bash
node engine/dashboard.cjs
# → http://127.0.0.1:3210
```

### Connect Your AI Agent

**Hermes Agent** — install as a skill (see above)
**Claude Code** — `cp agent-configs/CLAUDE.md /path/to/project/CLAUDE.md`
**Codex** — the MCP server auto-detects Codex sessions
**Any MCP-compatible agent** — point to the MCP server:

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

### Run Dream Consolidation

```bash
# Preview (dry-run)
node engine/dream.cjs --dry-run

# Execute
node engine/dream.cjs
```

### Health Check

```bash
node -e "const e=require('./engine/memory-db.cjs'); console.log(JSON.stringify(e.dbHealth(),null,2))"
```

### Configuration

All paths and ports are env-overridable. Default behavior is portable across Linux/macOS/Windows.

| Env var | Default (Windows / *nix) | Purpose |
|---------|--------------------------|---------|
| `HERMES_MEMORY_HOME` | `D:\hermes-hermes` / `~/.hermes-memory` | Where `memory.db`, `backups/`, `.memory-secrets/` live |
| `HERMES_MEMORY_PORT` | `3211` | Dashboard port (avoid KeyMemory's 3210) |
| `HERMES_MEMORY_HOST` | `127.0.0.1` | Dashboard bind address |

Example (Linux, custom data dir + port):

```bash
HERMES_MEMORY_HOME=/data/hermes HERMES_MEMORY_PORT=3299 npx hermes-memory-dashboard
```

Example (Windows, D-drive):

```powershell
$env:HERMES_MEMORY_HOME = "D:\hermes-memory"
npx hermes-memory-dashboard
```

> ⚠️ **Port change:** v2.0.0+ defaults to port **3211** (was 3210) to avoid conflict with [KeyMemory](https://github.com/digibeing1001/KeyMemory). Set `HERMES_MEMORY_PORT=3210` to restore the old port.

---

## Key Features

### 🔍 FTS5 Chinese + English Search

Unlike vector DB-based systems, Hermes Memory uses SQLite FTS5 with a CJK-padding technique that lets you search mixed Chinese+English queries like `"小红书发布pending"` with zero external dependencies.

### 🧠 L5 Self-Reflection Engine

The metacognitive layer tracks which strategies succeed and fail over time. It automatically recommends optimal approaches based on historical patterns. **No other memory system has this.**

### 💭 Dream Consolidation

Automatically deduplicates, merges, and archives old memories. Keeps your knowledge base lean and relevant without manual cleanup.

### 🔐 AES-256-GCM Secrets

Store API keys and credentials encrypted at rest. No `.env` file needed.

### 💾 Auto-Backup

Every write to L3/L4/L5 is automatically backed up with 7-day retention. Transaction-safe restore.

---

## Comparison with Competitors

| Capability | Hermes Memory | Mem0 | Supermemory | Letta | KeyMemory |
|------------|:---:|:---:|:---:|:---:|:---:|
| **Stars** | New | 58K | 26K | 23K | New |
| Offline, zero deps | ✅ | ❌ | ❌ | ✅ | ✅ |
| CJK FTS5 search | ✅ | ❌ | ❌ | ❌ | ❌ |
| L5 self-reflection | ✅ | ❌ | ❌ | ❌ | ❌ |
| Dream consolidation | ✅ | ❌ | ❌ | ❌ | ✅ |
| Web dashboard | ✅ | ❌ | ✅ | ❌ | ✅ |
| MCP protocol | ✅ | ❌ | ❌ | ❌ | ✅ |
| Write backup | ✅ | ❌ | ❌ | ❌ | ✅ |
| Platform health | ✅ | ❌ | ❌ | ❌ | ❌ |
| Pitfall KB | ✅ | ❌ | ❌ | ❌ | ❌ |
| `npm install` | ✅ | ❌ | ✅ | ✅ | ❌ |

---

## License

MIT
