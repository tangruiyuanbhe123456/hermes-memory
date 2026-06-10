---
name: hermes-memory
description: "Five-layer AI agent memory system with FTS5 search, MCP server, Web UI, dream consolidation, self-reflection engine, and encrypted secrets. Zero external dependencies."
version: 2.0.0
author: tangruiyuanbhe123456
tags: [memory, mcp, sqlite, fts5, agent, ai-skills, cjk-search]
---

# Hermes Memory

**The only memory system with a self-reflection (L5) engine.** Install as a skill or standalone npm package.

## Quick Start

```bash
# Via skills.sh
npx skills install hermes-memory

# Via npm
npm install hermes-memory
npx hermes-memory-dashboard
```

## Features

| Feature | Description |
|---------|-------------|
| 🗄️ SQLite FTS5 | CJK + English full-text search, zero external deps |
| 🧠 L5 Self-Reflection | Tracks strategy success/failure, auto-recommends |
| 💭 Dream Consolidation | Auto-dedup, merge, archive old memories |
| 🌐 MCP Server | Connect any MCP-compatible AI agent |
| 📊 Web Dashboard | Visual memory browser at http://127.0.0.1:3210 |
| 🔐 AES-256-GCM | Encrypted secrets storage |
| 💾 Auto-Backup | Write-before-write with 7-day retention |

## GitHub

Source code, full README, and documentation: https://github.com/tangruiyuanbhe123456/hermes-memory
