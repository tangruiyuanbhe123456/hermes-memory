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
<title>🧠 五层记忆仪表盘</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
body{background:#0d1117;color:#c9d1d9;padding:20px;max-width:1200px;margin:auto}
h1{color:#58a6ff;font-size:24px;margin-bottom:20px}
h2{color:#58a6ff;font-size:18px;margin:20px 0 10px;border-bottom:1px solid #30363d;padding-bottom:5px}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;margin-bottom:16px}
.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:20px}
.stat{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px;text-align:center}
.stat-num{font-size:28px;font-weight:700;color:#58a6ff}
.stat-label{font-size:12px;color:#8b949e;margin-top:4px}
.search-box{display:flex;gap:8px;margin-bottom:16px}
.search-box input{flex:1;padding:10px 14px;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;font-size:14px}
.search-box input:focus{border-color:#58a6ff;outline:none}
.search-box button{padding:10px 20px;background:#238636;border:none;border-radius:6px;color:#fff;font-size:14px;cursor:pointer}
.search-box button:hover{background:#2ea043}
.filter-row{display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.filter-row select,.filter-row input{padding:6px 10px;background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;font-size:13px}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:8px 12px;border-bottom:2px solid #30363d;color:#8b949e;font-size:12px;text-transform:uppercase}
td{padding:8px 12px;border-bottom:1px solid #21262d;font-size:13px}
tr:hover td{background:#1c2128}
.tag{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;background:#1f6feb33;color:#58a6ff;margin:1px}
.tag-ok{background:#23863633;color:#3fb950}
.tag-pending{background:#d2992233;color:#d29922}
.tag-fail{background:#da363333;color:#f85149}
.project-path{color:#58a6ff;font-size:12px}
.actions{display:flex;gap:4px}
.actions button{background:#21262d;border:1px solid #30363d;border-radius:4px;color:#8b949e;padding:2px 8px;font-size:11px;cursor:pointer}
.actions button:hover{background:#30363d;color:#c9d1d9}
.rel-card{background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:12px;margin-bottom:8px}
.rel-card .label{color:#8b949e;font-size:11px}
.proj-tree{margin-left:16px}
.proj-item{padding:4px 0}
.proj-item .folder{color:#d29922;cursor:pointer}
.proj-item .folder:hover{color:#e3b341}
.proj-item .count{color:#8b949e;font-size:11px;margin-left:8px}
.tabs{display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid #30363d;padding-bottom:0}
.tab{padding:8px 16px;background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:14px;border-bottom:2px solid transparent;margin-bottom:-1px}
.tab.active{color:#58a6ff;border-bottom-color:#58a6ff}
.tab:hover{color:#c9d1d9}
.hidden{display:none}
.backup-table td{font-size:12px}
#loading{text-align:center;padding:40px;color:#8b949e}
.pagination{display:flex;justify-content:center;gap:8px;margin-top:12px}
.pagination button{background:#21262d;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;padding:6px 12px;cursor:pointer}
.pagination button:hover{background:#30363d}
.pagination .page-info{color:#8b949e;padding:6px 0}
</style>
</head>
<body>
<h1>🧠 五层记忆仪表盘</h1>

<div class="stats" id="stats"></div>

<div class="tabs">
  <button class="tab active" onclick="switchTab('search')">🔍 搜索</button>
  <button class="tab" onclick="switchTab('projects')">📁 项目树</button>
  <button class="tab" onclick="switchTab('relations')">🔗 关系</button>
  <button class="tab" onclick="switchTab('backups')">💾 备份</button>
  <button class="tab" onclick="switchTab('dream')">🌙 梦境</button>
</div>

<div id="tab-search">
  <div class="search-box">
    <input id="search-input" placeholder="搜索记忆关键词（中/英文）" onkeydown="if(event.key==='Enter')search()" autofocus>
    <button onclick="search()">搜索</button>
  </div>
  <div class="filter-row">
    <select id="filter-platform"><option value="">全部平台</option><option value="xhs">小红书</option><option value="douyin">抖音</option><option value="wechat">公众号</option><option value="xianyu">闲鱼</option></select>
    <select id="filter-source"><option value="">全部来源</option><option value="hermes">Hermes</option><option value="codex">Codex</option></select>
    <select id="filter-days"><option value="7">近7天</option><option value="30" selected>近30天</option><option value="90">近90天</option><option value="365">近1年</option><option value="0">全部</option></select>
    <input id="filter-project" placeholder="项目路径过滤" style="width:200px">
  </div>
  <div id="results"></div>
  <div id="pagination" class="pagination hidden"></div>
</div>

<div id="tab-projects" class="hidden">
  <div class="search-box" style="margin-bottom:12px">
    <input id="new-project-path" placeholder="新建项目路径 (如 运营/小红书/发布)" style="flex:1">
    <input id="new-project-desc" placeholder="描述" style="width:200px">
    <button onclick="createProject()">创建</button>
  </div>
  <div id="project-tree"></div>
  <div id="project-memories"></div>
</div>

<div id="tab-relations" class="hidden">
  <div class="search-box">
    <input id="rel-memory-id" placeholder="输入记忆 ID" type="number" style="width:200px">
    <button onclick="showRelations()">查看关系</button>
  </div>
  <div id="relation-list"></div>
  <div id="relation-stats"></div>
</div>

<div id="tab-backups" class="hidden">
  <div id="backup-list"></div>
</div>

<div id="tab-dream" class="hidden">
  <button class="search-box" style="background:#238636;border:none;border-radius:6px;color:#fff;padding:10px 20px;cursor:pointer;font-size:14px;width:auto" onclick="runDream()">🌙 运行梦境整理</button>
  <div id="dream-report" style="margin-top:12px"></div>
</div>

<script>
let currentPage = 0;
const PAGE_SIZE = 20;

async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// 仪表盘统计
(async function(){
  try {
    const h = await api('/api/health');
    document.getElementById('stats').innerHTML = [
      ['记忆总数', h.count],
      ['关系数', h.relations],
      ['项目数', h.projects],
      ['备份数', h.backups],
      ['密钥数', h.secrets],
      ['引擎', h.engine.split(' ').slice(0,2).join(' ')],
    ].map(([l,n]) => '<div class="stat"><div class="stat-num">'+n+'</div><div class="stat-label">'+l+'</div></div>').join('');
  } catch(e) { document.getElementById('stats').innerHTML = '<div class="card">❌ 连接失败: '+e.message+'</div>'; }
})();

async function loadBackups() {
  try {
    const b = await api('/api/backups');
    document.getElementById('backup-list').innerHTML = b.length === 0 ? '<div class="card">暂无备份</div>' :
      '<table><tr><th>备份名</th><th>大小</th><th>时间</th><th>SHA256</th></tr>' +
      b.map(x => '<tr><td>'+x.name+'</td><td>'+(x.size/1024).toFixed(1)+'KB</td><td>'+new Date(x.mtime).toLocaleString()+'</td><td style="font-size:11px;color:#8b949e">'+(x.checksum||'-').substring(0,16)+'…</td></tr>').join('') +
      '</table>';
  } catch(e) { document.getElementById('backup-list').innerHTML = '<div class="card">❌ '+e.message+'</div>'; }
}

async function loadProjects() {
  try {
    const tree = await api('/api/projects/tree');
    function renderTree(obj, depth) {
      let html = '<div class="proj-tree">';
      for (const [key, val] of Object.entries(obj)) {
        if (key === '__meta' || key === '__children') continue;
        const meta = val.__meta;
        const count = meta ? ('<span class="count">('+meta.memory_count+'条)</span>') : '';
        html += '<div class="proj-item" style="padding-left:'+(depth*20)+'px">';
        html += '<span class="folder" onclick="filterByProject(\\''+escapeStr(meta?.path||key)+'\\')">📁 '+key+'</span>'+count;
        if (meta?.description) html += '<br><span style="color:#8b949e;font-size:12px;margin-left:20px">'+meta.description+'</span>';
        if (val.__children && Object.keys(val.__children).length > 0) {
          html += renderTree(val.__children, depth + 1);
        }
        html += '</div>';
      }
      return html + '</div>';
    }
    function escapeStr(s) { return s.replace(/\\'/g,"\\\\'").replace(/'/g,"\\'"); }
    document.getElementById('project-tree').innerHTML = Object.keys(tree).length === 0 ? '<div class="card">暂无项目，创建一个开始</div>' :
      '<div class="card">'+renderTree(tree, 0)+'</div>';
  } catch(e) { document.getElementById('project-tree').innerHTML = '<div class="card">❌ '+e.message+'</div>'; }
}

function filterByProject(proj) {
  document.getElementById('filter-project').value = proj;
  switchTab('search');
  search();
}

async function createProject() {
  const p = document.getElementById('new-project-path').value.trim();
  if (!p) return alert('请输入项目路径');
  const d = document.getElementById('new-project-desc').value.trim();
  await api('/api/projects/create?path='+encodeURIComponent(p)+'&desc='+encodeURIComponent(d));
  document.getElementById('new-project-path').value = '';
  document.getElementById('new-project-desc').value = '';
  loadProjects();
}

async function showRelations() {
  const id = document.getElementById('rel-memory-id').value;
  if (!id) return;
  const r = await api('/api/relations/'+id);
  document.getElementById('relation-list').innerHTML = r.length === 0 ? '<div class="card">无相关记忆</div>' :
    r.map(x => '<div class="rel-card">🔗 <b>'+x.type+'</b> → ' +
      (x.related_memory ? '#'+x.related_memory.id+' ['+x.related_memory.platform+'] '+x.related_memory.summary : '已删除记忆') +
      (x.note ? '<br><span class="label">备注: '+x.note+'</span>' : '') +
      '</div>').join('');
  const stats = await api('/api/relations/types');
  document.getElementById('relation-stats').innerHTML = stats.length > 0 ? '<div class="card"><b>关系统计</b><br>'+stats.map(s => s.type+': '+s.count+'条').join(' | ')+'</div>' : '';
}

async function search() {
  const q = document.getElementById('search-input').value;
  const platform = document.getElementById('filter-platform').value;
  const source = document.getElementById('filter-source').value;
  const days = parseInt(document.getElementById('filter-days').value);
  const project = document.getElementById('filter-project').value.trim();
  currentPage = 0;
  await doSearch(q, platform, source, days, project, 0);
}

async function doSearch(q, platform, source, days, project, page) {
  const params = new URLSearchParams({limit:PAGE_SIZE, offset:page*PAGE_SIZE});
  if (q) params.set('query', q);
  if (platform) params.set('platform', platform);
  if (source) params.set('source', source);
  if (days > 0) params.set('days', days);
  if (project) params.set('project', project);
  
  try {
    const results = await api('/api/search?'+params.toString());
    const total = await api('/api/count?'+params.toString());
    
    const container = document.getElementById('results');
    if (results.length === 0) {
      container.innerHTML = '<div class="card">没有找到匹配的记忆</div>';
      document.getElementById('pagination').classList.add('hidden');
      return;
    }
    
    container.innerHTML = '<table><tr><th>ID</th><th>时间</th><th>平台</th><th>动作</th><th>状态</th><th>摘要</th><th>项目</th><th>操作</th></tr>' +
      results.map(r => {
        const statusClass = 'tag tag-'+({ok:'ok',pending:'pending',fail:'fail',success:'ok',error:'fail'}[r.status]||'');
        const tags = (r.tags||[]).map(t => '<span class="tag">'+t+'</span>').join('');
        const proj = r.project ? '<span class="project-path">'+r.project+'</span>' : '';
        return '<tr><td>#'+r.id+'</td><td style="font-size:11px">'+(r.timestamp||'').substring(0,16)+'</td><td>'+r.platform+'</td><td>'+r.action+'</td><td><span class="'+statusClass+'">'+r.status+'</span></td><td>'+r.summary+' '+tags+'</td><td>'+proj+'</td><td class="actions"><button onclick="showRelationFor('+r.id+')" title="查看关系">🔗</button><button onclick="assignProject('+r.id+')" title="分配项目">📁</button></td></tr>';
      }).join('') + '</table>';
    
    // Pagination
    const pag = document.getElementById('pagination');
    const totalCount = typeof total === 'number' ? total : (total?.cnt || 0);
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    if (totalPages > 1) {
      pag.classList.remove('hidden');
      pag.innerHTML = '<button onclick="goPage(-1)" '+(page===0?'disabled':'')+'>←</button>' +
        '<span class="page-info">第'+(page+1)+'/'+totalPages+'页 ('+totalCount+'条)</span>' +
        '<button onclick="goPage(1)" '+(page>=totalPages-1?'disabled':'')+'>→</button>';
    } else {
      pag.classList.add('hidden');
    }
  } catch(e) { document.getElementById('results').innerHTML = '<div class="card">❌ '+e.message+'</div>'; }
}

function goPage(delta) {
  currentPage += delta;
  if (currentPage < 0) currentPage = 0;
  const q = document.getElementById('search-input').value;
  const platform = document.getElementById('filter-platform').value;
  const source = document.getElementById('filter-source').value;
  const days = parseInt(document.getElementById('filter-days').value);
  const project = document.getElementById('filter-project').value.trim();
  doSearch(q, platform, source, days, project, currentPage);
}

async function showRelationFor(id) {
  document.getElementById('rel-memory-id').value = id;
  switchTab('relations');
  showRelations();
}

async function assignProject(id) {
  const proj = prompt('输入项目路径 (例: 运营/小红书/发布):');
  if (proj !== null) {
    await api('/api/assign-project?id='+id+'&project='+encodeURIComponent(proj));
    search();
  }
}

async function runDream() {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = '⏳ 运行中...';
  try {
    const res = await api('/api/dream');
    document.getElementById('dream-report').innerHTML = '<div class="card"><pre style="white-space:pre-wrap;font-size:13px;line-height:1.6">'+res.report+'</pre></div>';
    loadBackups();
  } catch(e) { document.getElementById('dream-report').innerHTML = '<div class="card">❌ '+e.message+'</div>'; }
  btn.disabled = false;
  btn.textContent = '🌙 运行梦境整理';
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  document.querySelectorAll('[id^="tab-"]').forEach(t => t.classList.add('hidden'));
  document.getElementById('tab-'+name).classList.remove('hidden');
  
  // Lazy load
  if (name === 'backups') loadBackups();
  if (name === 'projects') loadProjects();
  if (name === 'relations') showRelations();
}

// 初始加载备份信息
loadBackups();
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
