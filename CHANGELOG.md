# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2026-06-13

### Added

- **Portable install path** via `HERMES_MEMORY_HOME` env var. Resolution chain: env → `cwd/hermes-memory` (if exists) → `~/.hermes-memory` (cross-platform default). Windows fallback `D:\hermes-hermes` preserved for backward compat when env is set.
- **Dashboard port configurability** via `HERMES_MEMORY_PORT` (default `3211`) and `HERMES_MEMORY_HOST` (default `127.0.0.1`). Port 3211 chosen to avoid conflict with [KeyMemory](https://github.com/digibeing1001/KeyMemory) which defaults to 3210.
- **Pre-bind port-conflict detection** in dashboard. If target port is in use, process exits with `FATAL: port <N> on <host> already in use` hint instead of crashing later.
- **Configuration section** in README documenting all three env vars with Linux + Windows examples.
- **Unit test suite** at `test/test-similarity.js` with 7 cases validating the new bigram-based text similarity. Run with `npm test`.

### Changed

- **textSimilarity algorithm upgraded** from character + word Jaccard to **bigram + character Jaccard**. Significantly improves recall on Chinese long sentences (e.g. "我的持仓是京东方A 200股" vs "持仓包括京东方" now returns 0.296 vs old ~0.1). Jaccard coefficient preserved (intersection / union), so `SIMILARITY_THRESHOLD = 0.7` in dream.cjs unchanged.
- **better-sqlite3 load failure** now throws explicit `[hermes-memory] FATAL: better-sqlite3 not installed or failed to load. Run: npm install better-sqlite3. Original error: <msg>` instead of silently returning null and crashing later in `getDb()`.
- **mkDirSync ordering** in `getDb()`: directory creation moved before `new Database(DB_PATH)` to eliminate "directory does not exist" race when running against a fresh `HERMES_MEMORY_HOME`.
- **Runtime dependencies reduced**: only `better-sqlite3` remains in `dependencies`. `playwright` and `ws` moved to `devDependencies` (audit confirmed zero usage in `engine/`). `npm install --omit=dev` install footprint drops from ~310MB to ~10MB.
- **Dashboard default port**: 3210 → 3211. Existing users can restore old port with `HERMES_MEMORY_PORT=3210`.

### Fixed

- Race condition in `engine/memory-db.cjs` where `new Database(DB_PATH)` would throw on a fresh `HERMES_MEMORY_HOME` because directories were created after the constructor ran.

### Migration notes

- **Port change**: dashboards on `http://127.0.0.1:3210` must either restart with `HERMES_MEMORY_PORT=3210` or update bookmarks to 3211.
- **Data path**: users with existing `D:\hermes-hermes` data must set `HERMES_MEMORY_HOME=D:\hermes-hermes` before launching, otherwise engine defaults to `~/.hermes-memory` (cross-platform).
- **MCP client cache**: Claude Desktop / Codex may cache old mcp-server paths from `agent-config.cjs`. Re-run `node engine/agent-config.cjs <target>` and re-apply config.

## [2.0.0] - 2026-06-12

### Added

- Five-layer memory architecture (L1 working / L2 episodic / L3 semantic / L4 procedural / L5 metacognitive).
- SQLite FTS5 search engine (Chinese + English).
- MCP server (`engine/mcp-server.cjs`) for agent integration.
- Web dashboard (`engine/dashboard.cjs`) on port 3210.
- Dream consolidation engine (`engine/dream.cjs`) for dedup, merge, archive.
- AES-256-GCM encryption for secrets.
- Write-before-write auto-backup with 7-day retention.
- Multi-agent config generator for Hermes / Codex / Claude Code / OpenClaw / Cursor / Gemini.

[Unreleased]: https://github.com/tangruiyuanbhe123456/hermes-memory/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/tangruiyuanbhe123456/hermes-memory/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/tangruiyuanbhe123456/hermes-memory/releases/tag/v2.0.0
