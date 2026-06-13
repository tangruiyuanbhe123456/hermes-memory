// ============================================================
// engine/dashboard.cjs — Web UI 仪表盘
// Node.js 原生 http 模块，零外部依赖
// 访问: http://127.0.0.1:3211 (默认,可用 HERMES_MEMORY_PORT 覆盖)
// ============================================================
// KeyMemory 移植: Web UI 仪表盘
// ============================================================

const http = require("http");
const path = require("path");
const engine = require("./memory-db.cjs");

const PORT = parseInt(process.env.HERMES_MEMORY_PORT || "3211", 10);
const HOST = process.env.HERMES_MEMORY_HOST || "127.0.0.1";

function checkPortFree(port, host) {
  return new Promise((resolve) => {
    const net = require("net");
    const tester = net.createServer()
      .once("error", (err) => resolve(err.code === "EADDRINUSE" ? false : true))
      .once("listening", () => tester.close(() => resolve(true)))
      .listen(port, host);
  });
}

// ---- HTML 模板（内嵌，零外部文件） ----
const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hermes Memory</title>
<style>
:root {
  --bg-primary: #000814;
  --bg-secondary: rgba(28, 37, 64, 0.6);
  --bg-tertiary: rgba(44, 53, 80, 0.4);
  --blur: saturate(180%) blur(20px);
  --radius-card: 22px;
  --radius-button: 14px;
  --radius-input: 12px;
  --accent: #007aff;
  --accent-green: #30d158;
  --accent-red: #ff453a;
  --accent-orange: #ff9f0a;
  --text-primary: rgba(255,255,255,0.92);
  --text-secondary: rgba(235,235,245,0.6);
  --text-tertiary: rgba(235,235,245,0.3);
  --separator: rgba(84,84,88,0.65);
  --font-body: 17px;
  --font-display: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  background: var(--bg-primary);
  background-image: linear-gradient(135deg, #001a3d 0%, #000814 50%, #0a0a1f 100%);
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: var(--font-body);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}
.app { max-width: 1100px; margin: 0 auto; padding: 20px; }
.statusbar {
  background: var(--bg-secondary);
  -webkit-backdrop-filter: var(--blur);
  backdrop-filter: var(--blur);
  border-radius: var(--radius-card);
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  border: 1px solid rgba(255,255,255,0.08);
}
.statusbar h1 { font-size: 20px; font-weight: 600; }
.status-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
.status-dot.ok { background: var(--accent-green); box-shadow: 0 0 8px var(--accent-green); }
.status-dot.fail { background: var(--accent-red); box-shadow: 0 0 8px var(--accent-red); }
.status-info { color: var(--text-secondary); font-size: 13px; }
.tabs {
  background: var(--bg-secondary);
  -webkit-backdrop-filter: var(--blur);
  backdrop-filter: var(--blur);
  border-radius: var(--radius-card);
  padding: 6px;
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  overflow-x: auto;
}
.tab {
  flex: 1;
  min-width: 80px;
  padding: 10px 14px;
  border-radius: var(--radius-button);
  background: transparent;
  color: var(--text-secondary);
  font-size: 15px;
  font-weight: 500;
  text-align: center;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
  white-space: nowrap;
}
.tab:hover { color: var(--text-primary); }
.tab.active {
  background: var(--accent);
  color: white;
  font-weight: 600;
}
.tab .layer-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(255,255,255,0.2);
  font-size: 11px;
  margin-left: 4px;
}
.search {
  background: var(--bg-secondary);
  -webkit-backdrop-filter: var(--blur);
  backdrop-filter: var(--blur);
  border-radius: var(--radius-card);
  padding: 14px;
  margin-bottom: 16px;
  display: flex;
  gap: 10px;
  border: 1px solid rgba(255,255,255,0.08);
}
.search input {
  flex: 1;
  padding: 12px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--separator);
  border-radius: var(--radius-input);
  color: var(--text-primary);
  font-size: var(--font-body);
  outline: none;
}
.search input:focus { border-color: var(--accent); }
.search button {
  padding: 12px 24px;
  background: var(--accent);
  border: none;
  border-radius: var(--radius-button);
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.search button:hover { opacity: 0.85; }
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.stat {
  background: var(--bg-secondary);
  -webkit-backdrop-filter: var(--blur);
  backdrop-filter: var(--blur);
  border-radius: var(--radius-card);
  padding: 16px;
  border: 1px solid rgba(255,255,255,0.08);
}
.stat-num { font-size: 32px; font-weight: 700; color: var(--accent); margin-bottom: 4px; }
.stat-label { font-size: 13px; color: var(--text-secondary); }
.list {
  background: var(--bg-secondary);
  -webkit-backdrop-filter: var(--blur);
  backdrop-filter: var(--blur);
  border-radius: var(--radius-card);
  border: 1px solid rgba(255,255,255,0.08);
  overflow: hidden;
}
.episode {
  padding: 14px 18px;
  border-bottom: 1px solid var(--separator);
  cursor: pointer;
  transition: background 0.15s;
}
.episode:last-child { border-bottom: none; }
.episode:hover { background: rgba(255,255,255,0.05); }
.episode-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.episode-id { font-size: 13px; color: var(--text-tertiary); font-family: ui-monospace, monospace; }
.episode-time { font-size: 13px; color: var(--text-secondary); }
.episode-summary { font-size: 15px; line-height: 1.4; }
.episode-tags { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
.tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 12px;
  background: rgba(0,122,255,0.2);
  color: var(--accent);
}
.tag.platform { background: rgba(48,209,88,0.2); color: var(--accent-green); }
.tag.status-ok { background: rgba(48,209,88,0.2); color: var(--accent-green); }
.tag.status-pending { background: rgba(255,159,10,0.2); color: var(--accent-orange); }
.tag.status-fail { background: rgba(255,69,58,0.2); color: var(--accent-red); }
.empty { padding: 60px 20px; text-align: center; color: var(--text-secondary); font-size: 15px; }
.modal-bg {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  z-index: 100;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
}
.modal-bg.open { opacity: 1; pointer-events: auto; }
.modal {
  position: fixed;
  top: 0; right: 0; bottom: 0;
  width: 100%;
  max-width: 520px;
  background: var(--bg-primary);
  background-image: linear-gradient(135deg, #001a3d 0%, #000814 100%);
  z-index: 101;
  transform: translateX(100%);
  transition: transform 0.3s ease;
  overflow-y: auto;
  border-left: 1px solid var(--separator);
}
.modal.open { transform: translateX(0); }
.modal-head {
  position: sticky; top: 0;
  background: var(--bg-secondary);
  -webkit-backdrop-filter: var(--blur);
  backdrop-filter: var(--blur);
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--separator);
  z-index: 1;
}
.modal-head h2 { font-size: 19px; font-weight: 600; }
.modal-close {
  background: rgba(255,255,255,0.1);
  border: none;
  color: var(--text-primary);
  font-size: 18px;
  width: 32px; height: 32px;
  border-radius: 50%;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.modal-close:hover { background: rgba(255,255,255,0.2); }
.modal-body { padding: 20px; }
.field { margin-bottom: 18px; }
.field-label { font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
.field-value {
  background: var(--bg-tertiary);
  border: 1px solid var(--separator);
  border-radius: var(--radius-input);
  padding: 12px 14px;
  font-size: 15px;
  word-break: break-word;
  user-select: text;
  -webkit-user-select: text;
  font-family: ui-monospace, "SF Mono", monospace;
}
.field-value.text { font-family: var(--font-display); }
pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
.copy-btn {
  background: rgba(0,122,255,0.2);
  color: var(--accent);
  border: none;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  margin-top: 8px;
}
.copy-btn:hover { background: rgba(0,122,255,0.3); }
</style>
</head>
<body>
<div class="app">
  <div class="statusbar">
    <h1>🧠 Hermes Memory</h1>
    <div class="status-info">
      <span class="status-dot" id="statusDot"></span>
      <span id="statusText">加载中…</span>
    </div>
  </div>
  <div class="tabs">
    <button class="tab active" data-layer="">Overview</button>
    <button class="tab" data-layer="L1_working">L1 Working</button>
    <button class="tab" data-layer="L2_episodic">L2 Episodic <span class="layer-badge" id="badge-L2">…</span></button>
    <button class="tab" data-layer="L3_semantic">L3 Semantic</button>
    <button class="tab" data-layer="L4_procedural">L4 Procedural</button>
    <button class="tab" data-layer="L5_metacognitive">L5 Metacog</button>
  </div>
  <div class="search">
    <input type="text" id="searchInput" placeholder="搜索记忆 (中英文)…" />
    <button onclick="doSearch()">搜索</button>
  </div>
  <div class="stats" id="stats"></div>
  <div class="list" id="list"><div class="empty">输入关键词搜索，或切换 tab 浏览分层</div></div>
</div>
<div class="modal-bg" id="modalBg" onclick="closeModal()"></div>
<div class="modal" id="modal">
  <div class="modal-head">
    <h2 id="modalTitle">记忆详情</h2>
    <button class="modal-close" onclick="closeModal()">✕</button>
  </div>
  <div class="modal-body" id="modalBody"></div>
</div>
<script>
let currentLayer = "";
const $ = (id) => document.getElementById(id);
async function fetchHealth() {
  try {
    const r = await fetch("/api/health");
    const h = await r.json();
    $("statusDot").className = "status-dot " + (h.ok ? "ok" : "fail");
    $("statusText").textContent = h.ok ? "FTS5 ready · " + h.count + " episodes · " + h.engine.split(" ")[0] : "离线 / " + (h.engine || "未配置");
    renderStats(h);
    return h;
  } catch (e) {
    $("statusDot").className = "status-dot fail";
    $("statusText").textContent = "API 不可用: " + e.message;
    return null;
  }
}
function renderStats(h) {
  if (!h || !h.ok) return;
  $("stats").innerHTML = \`
    <div class="stat"><div class="stat-num">\${h.count}</div><div class="stat-label">Episodes</div></div>
    <div class="stat"><div class="stat-num">\${h.relations}</div><div class="stat-label">Relations</div></div>
    <div class="stat"><div class="stat-num">\${h.projects}</div><div class="stat-label">Projects</div></div>
    <div class="stat"><div class="stat-num">\${h.backups}</div><div class="stat-label">Backups</div></div>
    <div class="stat"><div class="stat-num">\${h.secrets}</div><div class="stat-label">Secrets</div></div>
    <div class="stat"><div class="stat-num">\${h.ftsReady ? "✓" : "✗"}</div><div class="stat-label">FTS5 Index</div></div>
  \`;
}
async function doSearch() {
  const q = $("searchInput").value.trim();
  const params = new URLSearchParams();
  if (q) params.set("query", q);
  if (currentLayer) params.set("project", currentLayer);
  params.set("limit", "50");
  try {
    const r = await fetch("/api/search?" + params);
    const rows = await r.json();
    renderList(rows);
  } catch (e) {
    $("list").innerHTML = '<div class="empty">搜索失败: ' + e.message + '</div>';
  }
}
function renderList(rows) {
  if (!rows || rows.length === 0) {
    $("list").innerHTML = '<div class="empty">无匹配记录</div>';
    return;
  }
  $("list").innerHTML = rows.map(ep => \`
    <div class="episode" onclick="openEpisode(\${ep.id})">
      <div class="episode-head">
        <span class="episode-id">#\${ep.id} · \${ep.source || "?"}</span>
        <span class="episode-time">\${(ep.timestamp || "").slice(0,19).replace("T"," ")}</span>
      </div>
      <div class="episode-summary">\${escapeHtml(ep.summary || ep.action || "(无内容)")}</div>
      <div class="episode-tags">
        \${ep.platform ? \`<span class="tag platform">\${escapeHtml(ep.platform)}</span>\` : ""}
        \${ep.status ? \`<span class="tag status-\${ep.status === "ok" || ep.status === "done" ? "ok" : ep.status === "fail" ? "fail" : "pending"}">\${escapeHtml(ep.status)}</span>\` : ""}
        \${ep.project ? \`<span class="tag">📁 \${escapeHtml(ep.project)}</span>\` : ""}
      </div>
    </div>
  \`).join("");
}
async function openEpisode(id) {
  try {
    const r = await fetch("/api/episodes/" + id);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const ep = await r.json();
    showModal(ep);
  } catch (e) {
    alert("加载失败: " + e.message);
  }
}
function showModal(ep) {
  $("modalTitle").textContent = "记忆 #" + ep.id;
  $("modalBody").innerHTML = \`
    <div class="field"><div class="field-label">Summary</div><div class="field-value text">\${escapeHtml(ep.summary || "")}</div><button class="copy-btn" onclick="copyText(this, '\${escapeHtml(ep.summary || "").replace(/'/g, "\\\\'")}')">复制</button></div>
    <div class="field"><div class="field-label">Source / Platform / Action</div><div class="field-value">\${escapeHtml(ep.source || "")} · \${escapeHtml(ep.platform || "")} · \${escapeHtml(ep.action || "")}</div></div>
    <div class="field"><div class="field-label">Timestamp / Status / Duration</div><div class="field-value">\${escapeHtml(ep.timestamp || "")} · \${escapeHtml(ep.status || "")} · \${ep.duration || 0}s</div></div>
    <div class="field"><div class="field-label">Project</div><div class="field-value">\${escapeHtml(ep.project || "(无)")}</div></div>
    <div class="field"><div class="field-label">Tags</div><div class="field-value text">\${escapeHtml(JSON.stringify(ep.tags || [], null, 2))}</div></div>
    <div class="field"><div class="field-label">Data (JSON)</div><div class="field-value"><pre>\${escapeHtml(JSON.stringify(ep.data || {}, null, 2))}</pre></div></div>
  \`;
  $("modalBg").classList.add("open");
  $("modal").classList.add("open");
}
function closeModal() {
  $("modalBg").classList.remove("open");
  $("modal").classList.remove("open");
}
function copyText(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = "✓ 已复制";
    setTimeout(() => btn.textContent = "复制", 1500);
  });
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentLayer = btn.dataset.layer;
    doSearch();
  });
});
$("searchInput").addEventListener("keypress", e => { if (e.key === "Enter") doSearch(); });
fetchHealth().then(h => doSearch());
</script>
</body>
</html>`;
// ---- HTTP Server ----
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const path = url.pathname;
  const params = url.searchParams;

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // JSON helper
  function json(data, code = 200) {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data, null, 2));
  }

  try {
    // ---- 主页 ----
    if (path === "/" || path === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(HTML);
      return;
    }

    // ---- API: 健康/统计 ----
    if (path === "/api/health") {
      const h = engine.dbHealth();
      const backups = engine.listBackups().length;
      const secrets = engine.secretList().length;
      json({ ...h, backups, secrets });
      return;
    }

    // ---- API: 搜索 ----
    if (path === "/api/search") {
      const opts = {};
      if (params.has("query")) opts.query = params.get("query");
      if (params.has("platform")) opts.platform = params.get("platform");
      if (params.has("source")) opts.source = params.get("source");
      if (params.has("project")) opts.project = params.get("project");
      if (params.has("days")) opts.days = parseInt(params.get("days"));
      opts.limit = parseInt(params.get("limit")) || 20;
      opts.offset = parseInt(params.get("offset")) || 0;
      json(engine.dbSearchEpisodes(opts));
      return;
    }

    // ---- API: 单条 episode 详情 ----
    if (path.startsWith("/api/episodes/")) {
      const id = parseInt(path.split("/").pop());
      if (isNaN(id)) { json({ error: "invalid id" }, 400); return; }
      try {
        const dbPath = require("path").join(engine.HERMES_HOME, "memory.db");
        const Database = require("better-sqlite3");
        const db = new Database(dbPath, { readonly: true });
        const row = db.prepare("SELECT * FROM episodic WHERE id = ?").get(id);
        db.close();
        if (!row) { json({ error: "not found" }, 404); return; }
        try { row.tags = JSON.parse(row.tags || "[]"); } catch { row.tags = []; }
        try { row.data = JSON.parse(row.data || "{}"); } catch { row.data = {}; }
        json(row);
      } catch (e) {
        json({ error: e.message }, 500);
      }
      return;
    }

    // ---- API: 计数 ----
    if (path === "/api/count") {
      const source = params.get("source") || null;
      json(engine.dbCountEpisodes(source));
      return;
    }

    // ---- API: 备份列表 ----
    if (path === "/api/backups") {
      json(engine.listBackups());
      return;
    }

    // ---- API: 项目树 ----
    if (path === "/api/projects/tree") {
      // Get tree and attach memory counts
      const tree = engine.getProjectTree();
      const projects = engine.listProjects();
      for (const p of projects) {
        p.memory_count = engine.countProjectMemories(p.path);
        // 嵌入到 tree
        const parts = p.path.split("/");
        let node = tree;
        for (const part of parts) {
          if (!node[part]) break;
          if (parts.indexOf(part) === parts.length - 1) {
            node[part].__meta = p;
          }
          node = node[part].__children || {};
        }
      }
      json(tree);
      return;
    }

    // ---- API: 创建项目 ----
    if (path === "/api/projects/create") {
      const p = params.get("path");
      if (!p) { json({ error: "path required" }, 400); return; }
      engine.ensureProject(p, params.get("desc") || "");
      json({ ok: true });
      return;
    }

    // ---- API: 关系 ----
    if (path.startsWith("/api/relations/")) {
      const id = parseInt(path.split("/").pop());
      if (isNaN(id)) { json({ error: "invalid id" }, 400); return; }
      json(engine.getRelated(id, params.get("type") || null));
      return;
    }

    // ---- API: 关系类型统计 ----
    if (path === "/api/relations/types") {
      json(engine.listRelationTypes());
      return;
    }

    // ---- API: 分配项目 ----
    if (path === "/api/assign-project") {
      const id = parseInt(params.get("id"));
      const proj = params.get("project") || "";
      if (isNaN(id)) { json({ error: "invalid id" }, 400); return; }
      engine.assignToProject(id, proj);
      json({ ok: true });
      return;
    }

    // ---- API: 梦境 ----
    if (path === "/api/dream") {
      try {
        const dream = require("./dream.cjs");
        const report = dream.runDream({ dryRun: false });
        json({ ok: true, report });
      } catch (e) {
        json({ error: "梦境执行失败: " + e.message }, 500);
      }
      return;
    }

    // ---- 404 ----
    res.writeHead(404);
    res.end("Not Found");

  } catch (e) {
    console.error("Dashboard 错误:", e.message);
    if (!res.headersSent) {
      json({ error: e.message }, 500);
    }
  }
});

checkPortFree(PORT, HOST).then((free) => {
  if (!free) {
    console.error(`[hermes-memory] FATAL: port ${PORT} on ${HOST} already in use.`);
    console.error(`Set HERMES_MEMORY_PORT=<other> or stop the conflicting process.`);
    process.exit(1);
  }
  server.listen(PORT, HOST, () => {
    console.log(`\n🧠 五层记忆仪表盘已启动`);
    console.log(`   地址: http://${HOST}:${PORT}`);
    console.log(`   搜索: 支持中英文 FTS5 全文搜索`);
    console.log(`   项目: 树形层级管理`);
    console.log(`   关系: relates_to / supersedes / references`);
    console.log(`   备份: 查看和管理备份`);
    console.log(`   梦境: 一键去重合并归档\n`);
  });
});

// ---- CLI: 直接 node dashboard.cjs ----
if (require.main === module) {
  // Just start
}
