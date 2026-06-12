// ============================================================
// engine/memory-db.cjs — SQLite 搜索引擎 + 自动备份 + 加密密钥
// ============================================================
// KeyMemory 优势移植: SQLite FTS5 | 写入前备份 | 密钥加密
// ============================================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

function resolveHermesHome() {
  if (process.env.HERMES_MEMORY_HOME) return process.env.HERMES_MEMORY_HOME;
  const cwdDefault = path.join(process.cwd(), "hermes-memory");
  if (fs.existsSync(cwdDefault)) return cwdDefault;
  const homeDefault = path.join(os.homedir(), ".hermes-memory");
  return homeDefault;
}

const HERMES_HOME = resolveHermesHome();
const DB_PATH = path.join(HERMES_HOME, "memory.db");
const BACKUP_DIR = path.join(HERMES_HOME, "backups");
const SECRETS_DIR = path.join(HERMES_HOME, ".memory-secrets");
const SECRETS_KEY_PATH = path.join(SECRETS_DIR, ".key");
const BACKUP_RETENTION_DAYS = 7;

// ---- SQLite ----
let Database = null;
try {
  Database = require("better-sqlite3");
} catch (err) {
  const msg = "[hermes-memory] FATAL: better-sqlite3 not installed or failed to load.\n" +
              "Run: npm install better-sqlite3\n" +
              "Original error: " + err.message;
  throw new Error(msg);
}

let _db = null;

function getDb() {
  if (_db) return _db;
  if (!Database) return null;
  fs.mkdirSync(HERMES_HOME, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.mkdirSync(SECRETS_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");
  initSchema(_db);
  return _db;
}

// ---- CJK 辅助：给中文间加空格，让 unicode61 tokenizer 能按字分词 ----
function padCjk(s) {
  if (!s) return s;
  // 在中日韩字符前后加空格，使其被 unicode61 识别为独立 token
  return s.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, " $& ");
}

// ================================================================
// 初始化 schema
// ================================================================

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS episodic (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT 'hermes',
      timestamp TEXT NOT NULL,
      platform TEXT DEFAULT '',
      action TEXT DEFAULT '',
      status TEXT DEFAULT '',
      duration REAL DEFAULT 0,
      summary TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      data TEXT DEFAULT '{}',
      project TEXT DEFAULT '',
      UNIQUE(source, timestamp, action)
    );
    -- FTS5 全文索引（inline 模式，手动插入 padded 数据以支持中英文混合搜索）
    CREATE VIRTUAL TABLE IF NOT EXISTS episodic_fts USING fts5(
      platform, action, summary, tags, data, status, project,
      tokenize='unicode61'
    );
    CREATE INDEX IF NOT EXISTS idx_episodic_timestamp ON episodic(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_episodic_source ON episodic(source);
    CREATE INDEX IF NOT EXISTS idx_episodic_platform ON episodic(platform);
    CREATE INDEX IF NOT EXISTS idx_episodic_project ON episodic(project);

    -- 记忆关系表
    CREATE TABLE IF NOT EXISTS relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'relates_to',
      note TEXT DEFAULT '',
      created TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_id, target_id, type)
    );
    CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_id);
    CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_id);
    CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(type);

    -- 项目树表
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      parent_path TEXT DEFAULT '',
      created TEXT NOT NULL DEFAULT (datetime('now')),
      updated TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_projects_parent ON projects(parent_path);
  `);

  // 重建 FTS 索引
  try { db.exec("INSERT INTO episodic_fts(episodic_fts) VALUES('rebuild')"); } catch {}
}

// ================================================================
// FTS5 写 + 读（支持中英文混合）
// ================================================================

/**
 * 写入一条情节记忆到 SQLite（自动建 FTS 索引）
 */
function dbRecordEpisode(record, source = "hermes") {
  const db = getDb();
  if (!db) return false;
  try {
    const insert = db.prepare(`
      INSERT OR IGNORE INTO episodic (source, timestamp, platform, action, status, duration, summary, tags, data, project)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = insert.run(
      source,
      record.timestamp || new Date().toISOString(),
      record.platform || "",
      record.action || "",
      record.status || "",
      record.duration || 0,
      record.summary || "",
      JSON.stringify(record.tags || []),
      JSON.stringify(record.data || {}),
      record.project || ""
    );
    if (info.changes > 0) {
      syncFtsRow(info.lastInsertRowid);
    }
    return true;
  } catch (e) {
    console.error("dbRecordEpisode 错误:", e.message);
    return false;
  }
}

/**
 * 同步一行到 FTS 索引（inline FTS，先删后插）
 */
function syncFtsRow(rowid) {
  const db = getDb();
  if (!db) return;
  const row = db.prepare("SELECT * FROM episodic WHERE id = ?").get(rowid);
  if (!row) return;
  try {
    db.exec(`DELETE FROM episodic_fts WHERE rowid = ${rowid}`);
    db.prepare("INSERT INTO episodic_fts(rowid, platform, action, summary, tags, data, status, project) VALUES(?,?,?,?,?,?,?,?)").run(
      rowid,
      padCjk(row.platform),
      padCjk(row.action),
      padCjk(row.summary),
      padCjk(JSON.stringify(row.tags)),
      padCjk(JSON.stringify(row.data)),
      padCjk(row.status),
      padCjk(row.project)
    );
  } catch (e) {
    console.error("syncFtsRow 错误:", e.message);
  }
}

function rebuildAllFts() {
  const db = getDb();
  if (!db) return;
  try {
    db.exec("DELETE FROM episodic_fts");
    const rows = db.prepare("SELECT id, platform, action, summary, tags, data, status, project FROM episodic").all();
    const insert = db.transaction((items) => {
      for (const r of items) {
        db.prepare("INSERT INTO episodic_fts(rowid, platform, action, summary, tags, data, status, project) VALUES(?,?,?,?,?,?,?,?)").run(
          r.id, padCjk(r.platform), padCjk(r.action), padCjk(r.summary), padCjk(r.tags), padCjk(r.data), padCjk(r.status), padCjk(r.project)
        );
      }
    });
    insert(rows);
  } catch (e) {
    console.error("FTS 重建失败:", e.message);
  }
}

/**
 * FTS5 全文搜索（自动处理 CJK 查询）
 */
function dbSearchEpisodes(opts = {}) {
  const db = getDb();
  if (!db) return [];
  const { query = "", platform = "", source = "", days = 0, limit = 20, offset = 0 } = opts;
  const conditions = [];
  const params = [];

  // FTS5 MATCH（已 padding CJK 所以搜索也要 padding）
  if (query.trim()) {
    const padded = padCjk(query).trim().replace(/\s+/g, " ");
    conditions.push("e.rowid IN (SELECT rowid FROM episodic_fts WHERE episodic_fts MATCH ?)");
    params.push(padded);
  }

  if (platform) { conditions.push("e.platform = ?"); params.push(platform); }
  if (source) { conditions.push("e.source = ?"); params.push(source); }
  if (days > 0) { conditions.push("e.timestamp >= datetime('now', ? || ' days')"); params.push(`-${days}`); }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const sql = `SELECT e.* FROM episodic e ${where} ORDER BY e.timestamp DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  try {
    const rows = db.prepare(sql).all(...params);
    return rows.map(r => ({ ...r, tags: safeJson(r.tags, []), data: safeJson(r.data, {}) }));
  } catch (e) {
    console.error("dbSearchEpisodes 错误:", e.message);
    // Fallback: LIKE 搜索（兜底）
    if (query.trim()) {
      return dbFallbackSearch(query, platform, source, days, limit, offset);
    }
    return [];
  }
}

/**
 * Fallback：LIKE 搜索（FTS5 出问题时）
 */
function dbFallbackSearch(query, platform, source, days, limit, offset) {
  const db = getDb();
  if (!db) return [];
  const conditions = [];
  const params = [];
  const q = `%${query}%`;
  conditions.push("(e.summary LIKE ? OR e.action LIKE ? OR e.platform LIKE ? OR e.tags LIKE ?)");
  params.push(q, q, q, q);
  if (platform) { conditions.push("e.platform = ?"); params.push(platform); }
  if (source) { conditions.push("e.source = ?"); params.push(source); }
  if (days > 0) { conditions.push("e.timestamp >= datetime('now', ? || ' days')"); params.push(`-${days}`); }
  const sql = `SELECT e.* FROM episodic e WHERE ${conditions.join(" AND ")} ORDER BY e.timestamp DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  try {
    const rows = db.prepare(sql).all(...params);
    return rows.map(r => ({ ...r, tags: safeJson(r.tags, []), data: safeJson(r.data, {}) }));
  } catch { return []; }
}

function safeJson(str, fallback) { try { return JSON.parse(str); } catch { return fallback; } }

function dbCountEpisodes(source) {
  const db = getDb();
  if (!db) return 0;
  const where = source ? "WHERE source = ?" : "";
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM episodic ${where}`).get(...(source ? [source] : []));
  return row ? row.cnt : 0;
}

// ================================================================
// 备份系统
// ================================================================

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function fileChecksum(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function backupBeforeWrite(filePath, label = "unknown") {
  if (!fs.existsSync(filePath)) return null;
  ensureBackupDir();
  const baseName = path.basename(filePath);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const chk = fileChecksum(filePath);
  const bp = path.join(BACKUP_DIR, `${ts}__${label}__${baseName}`);
  fs.copyFileSync(filePath, bp);
  fs.writeFileSync(bp + ".sha256", chk, "utf-8");
  cleanupOldBackups();
  return bp;
}

function cleanupOldBackups() {
  ensureBackupDir();
  const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 86400000;
  for (const f of fs.readdirSync(BACKUP_DIR)) {
    try {
      const fp = path.join(BACKUP_DIR, f);
      if (fs.statSync(fp).isFile() && fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp);
    } catch {}
  }
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter(f => !f.endsWith(".sha256")).map(f => {
    const fp = path.join(BACKUP_DIR, f);
    const st = fs.statSync(fp);
    const sp = fp + ".sha256";
    const c = fs.existsSync(sp) ? fs.readFileSync(sp, "utf-8").trim() : null;
    return { name: f, size: st.size, mtime: st.mtime, checksum: c };
  }).sort((a, b) => b.mtime - a.mtime);
}

function restoreBackup(backupName, targetPath) {
  const bp = path.join(BACKUP_DIR, backupName);
  if (!fs.existsSync(bp)) { console.error("备份不存在:", bp); return false; }
  if (fs.existsSync(targetPath)) backupBeforeWrite(targetPath, "pre-restore");
  fs.copyFileSync(bp, targetPath);
  return true;
}

// ================================================================
// 密钥存储 (AES-256-GCM)
// ================================================================

function ensureSecretsDir() {
  if (!fs.existsSync(SECRETS_DIR)) fs.mkdirSync(SECRETS_DIR, { recursive: true });
}

function getSecretKey() {
  ensureSecretsDir();
  if (fs.existsSync(SECRETS_KEY_PATH)) return fs.readFileSync(SECRETS_KEY_PATH);
  const key = crypto.randomBytes(32);
  fs.writeFileSync(SECRETS_KEY_PATH, key);
  return key;
}

function encrypt(text) {
  const key = getSecretKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let enc = cipher.update(text, "utf-8", "hex");
  enc += cipher.final("hex");
  return JSON.stringify({ iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), data: enc });
}

function decrypt(encStr) {
  const key = getSecretKey();
  const { iv, tag, data } = JSON.parse(encStr);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  let dec = decipher.update(data, "hex", "utf-8");
  dec += decipher.final("utf-8");
  return dec;
}

function secretSet(name, value) {
  ensureSecretsDir();
  fs.writeFileSync(path.join(SECRETS_DIR, name + ".enc"), encrypt(value), "utf-8");
  return true;
}

function secretGet(name) {
  const fp = path.join(SECRETS_DIR, name + ".enc");
  if (!fs.existsSync(fp)) return null;
  try { return decrypt(fs.readFileSync(fp, "utf-8")); } catch { return null; }
}

function secretList() {
  if (!fs.existsSync(SECRETS_DIR)) return [];
  return fs.readdirSync(SECRETS_DIR).filter(f => f.endsWith(".enc")).map(f => ({
    name: f.replace(".enc", ""),
    size: fs.statSync(path.join(SECRETS_DIR, f)).size,
  }));
}

function secretDelete(name) {
  const fp = path.join(SECRETS_DIR, name + ".enc");
  if (!fs.existsSync(fp)) return false;
  fs.unlinkSync(fp);
  return true;
}

// ================================================================
// 导入旧 JSONL
// ================================================================

function importJsonlToSqlite(l2Dir, source = "hermes") {
  const db = getDb();
  if (!db) { console.log("SQLite 不可用，跳过导入"); return 0; }
  if (!fs.existsSync(l2Dir)) return 0;

  let total = 0;
  const files = fs.readdirSync(l2Dir).filter(f => f.endsWith(".jsonl")).sort();
  const insert = db.prepare(`INSERT OR IGNORE INTO episodic (source, timestamp, platform, action, status, duration, summary, tags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const batch = db.transaction((rows) => {
    for (const r of rows) insert.run(
      source, r.timestamp || "", r.platform || r.source || "", r.action || "",
      r.status || "", r.duration || 0, r.summary || "",
      JSON.stringify(r.tags || []), JSON.stringify(r.data || {})
    );
  });

  for (const file of files) {
    const content = fs.readFileSync(path.join(l2Dir, file), "utf-8").trim();
    if (!content) continue;
    const rows = content.split("\n").filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
    if (rows.length > 0) { batch(rows); total += rows.length; }
  }

  if (total > 0) rebuildAllFts();
  return total;
}

// ================================================================
// 记忆关系系统 (relates_to / supersedes / references)
// ================================================================

/**
 * 创建记忆关系
 * @param {number} sourceId - 源记忆 ID
 * @param {number} targetId - 目标记忆 ID
 * @param {string} type - 关系类型: 'relates_to', 'supersedes', 'references'
 * @param {string} note - 可选备注
 * @returns {boolean}
 */
function addRelation(sourceId, targetId, type = "relates_to", note = "") {
  const db = getDb();
  if (!db) return false;
  try {
    db.prepare("INSERT OR IGNORE INTO relations (source_id, target_id, type, note) VALUES (?, ?, ?, ?)").run(sourceId, targetId, type, note);
    return true;
  } catch (e) { console.error("addRelation 错误:", e.message); return false; }
}

/**
 * 查询与某记忆相关的记忆
 * @param {number} memoryId
 * @param {string} type - 可选，按关系类型过滤
 * @returns {object[]} [{ id, type, note, created, related_memory: {...} }]
 */
function getRelated(memoryId, type) {
  const db = getDb();
  if (!db) return [];
  try {
    const cond = ["r.source_id = ? OR r.target_id = ?"];
    const params = [memoryId, memoryId];
    if (type) { cond.push("r.type = ?"); params.push(type); }
    const sql = `
      SELECT r.id, r.type, r.note, r.created,
        CASE WHEN r.source_id = ? THEN r.target_id ELSE r.source_id END AS related_id
      FROM relations r WHERE ${cond.join(" AND ")}
    `;
    params.unshift(memoryId); // for the CASE source
    const rows = db.prepare(sql).all(...params);
    // 查找关联记忆的详情
    return rows.map(r => {
      const mem = db.prepare("SELECT id, source, platform, action, summary, project, timestamp FROM episodic WHERE id = ?").get(r.related_id);
      return { relation_id: r.id, type: r.type, note: r.note, created: r.created, related_memory: mem || null };
    });
  } catch (e) { console.error("getRelated 错误:", e.message); return []; }
}

/**
 * 删除记忆关系
 */
function removeRelation(sourceId, targetId, type) {
  const db = getDb();
  if (!db) return false;
  const cond = ["source_id = ? AND target_id = ?"];
  const params = [sourceId, targetId];
  if (type) { cond.push("type = ?"); params.push(type); }
  db.prepare(`DELETE FROM relations WHERE ${cond.join(" AND ")}`).run(...params);
  return true;
}

/**
 * 列出所有关系类型及其统计
 */
function listRelationTypes() {
  const db = getDb();
  if (!db) return [];
  return db.prepare("SELECT type, COUNT(*) as count FROM relations GROUP BY type ORDER BY count DESC").all();
}

// ================================================================
// 项目树系统 (Project Tree + 嵌套层级)
// ================================================================

/**
 * 创建或确保项目路径存在（自动创建父级）
 * @param {string} path - 如 "运营/小红书/发布"
 * @param {string} description
 * @returns {boolean}
 */
function ensureProject(path, description = "") {
  const db = getDb();
  if (!db) return false;
  try {
    const parts = path.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const parent = current.substring(0, current.lastIndexOf("/"));
      db.prepare("INSERT OR IGNORE INTO projects (path, description, parent_path) VALUES (?, ?, ?)").run(current, description || "", parent);
      db.prepare("UPDATE projects SET updated = datetime('now') WHERE path = ?").run(current);
    }
    return true;
  } catch (e) { console.error("ensureProject 错误:", e.message); return false; }
}

/**
 * 列出所有项目（树形）
 * @param {string} parentPath - 可选，只列出某父级下的
 */
function listProjects(parentPath) {
  const db = getDb();
  if (!db) return [];
  if (parentPath !== undefined) {
    return db.prepare("SELECT * FROM projects WHERE parent_path = ? ORDER BY path").all(parentPath);
  }
  return db.prepare("SELECT * FROM projects ORDER BY path").all();
}

/**
 * 获取项目树（嵌套结构）
 */
function getProjectTree() {
  const db = getDb();
  if (!db) return {};
  const all = db.prepare("SELECT * FROM projects ORDER BY path").all();
  // 构建嵌套树
  const tree = {};
  for (const p of all) {
    const parts = p.path.split("/");
    let node = tree;
    for (const part of parts) {
      if (!node[part]) node[part] = { __meta: null, __children: {} };
      if (!node[part].__children) node[part].__children = {};
      if (parts.indexOf(part) === parts.length - 1) node[part].__meta = p;
      node = node[part].__children;
    }
  }
  return tree;
}

/**
 * 获取某项目下的记忆数量
 */
function countProjectMemories(projectPath) {
  const db = getDb();
  if (!db) return 0;
  const row = db.prepare("SELECT COUNT(*) as cnt FROM episodic WHERE project = ?").get(projectPath);
  return row ? row.cnt : 0;
}

/**
 * 将记忆分配到项目
 */
function assignToProject(memoryId, projectPath) {
  const db = getDb();
  if (!db) return false;
  try {
    if (projectPath) ensureProject(projectPath);
    db.prepare("UPDATE episodic SET project = ? WHERE id = ?").run(projectPath || "", memoryId);
    // 同步 FTS
    syncFtsRow(memoryId);
    return true;
  } catch (e) { console.error("assignToProject 错误:", e.message); return false; }
}

// ================================================================
// 更新 dbSearchEpisodes 支持 project 过滤
// ================================================================

function dbSearchEpisodes(opts = {}) {
  const db = getDb();
  if (!db) return [];
  const { query = "", platform = "", source = "", project = "", days = 0, limit = 20, offset = 0 } = opts;
  const conditions = [];
  const params = [];

  if (query.trim()) {
    const padded = padCjk(query).trim().replace(/\s+/g, " ");
    conditions.push("e.rowid IN (SELECT rowid FROM episodic_fts WHERE episodic_fts MATCH ?)");
    params.push(padded);
  }
  if (platform) { conditions.push("e.platform = ?"); params.push(platform); }
  if (source) { conditions.push("e.source = ?"); params.push(source); }
  if (project) { conditions.push("e.project = ?"); params.push(project); }
  if (days > 0) { conditions.push("e.timestamp >= datetime('now', ? || ' days')"); params.push(`-${days}`); }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const sql = `SELECT e.* FROM episodic e ${where} ORDER BY e.timestamp DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  try {
    const rows = db.prepare(sql).all(...params);
    return rows.map(r => ({ ...r, tags: safeJson(r.tags, []), data: safeJson(r.data, {}) }));
  } catch (e) {
    console.error("dbSearchEpisodes 错误:", e.message);
    if (query.trim()) return dbFallbackSearch(query, platform, source, days, limit, offset);
    return [];
  }
}

// ================================================================
// 自检（升级版，含关系+项目统计）
// ================================================================

function dbHealth() {
  const db = getDb();
  if (!db) return { ok: false, engine: "降级 (better-sqlite3 未安装)", count: 0 };
  try {
    const count = dbCountEpisodes();
    const ftsOk = db.prepare("SELECT name FROM sqlite_master WHERE name='episodic_fts' AND type='table'").get();
    const relCount = db.prepare("SELECT COUNT(*) as cnt FROM relations").get()?.cnt || 0;
    const projCount = db.prepare("SELECT COUNT(*) as cnt FROM projects").get()?.cnt || 0;
    return { ok: true, engine: "SQLite + FTS5 + CJK padding", count, ftsReady: !!ftsOk, relations: relCount, projects: projCount, path: DB_PATH };
  } catch (e) {
    return { ok: false, engine: e.message, count: 0 };
  }
}

// ================================================================
// 导出（新增关系 + 项目函数）
// ================================================================

module.exports = {
  // 核心
  dbRecordEpisode, dbRecordEpisodes: (records, s) => { const db = getDb(); if (!db) return 0; const t = db.transaction((items) => { for (const r of items) dbRecordEpisode(r, s); }); t(records); return records.length; },
  dbSearchEpisodes, dbCountEpisodes, dbHealth,
  // 备份
  backupBeforeWrite, listBackups, restoreBackup, fileChecksum, cleanupOldBackups,
  // 密钥
  secretSet, secretGet, secretList, secretDelete,
  // 导入/重建
  importJsonlToSqlite, rebuildAllFts,
  // 记忆关系
  addRelation, getRelated, removeRelation, listRelationTypes,
  // 项目树
  ensureProject, listProjects, getProjectTree, countProjectMemories, assignToProject,
  // 常量
  DB_PATH, BACKUP_DIR, SECRETS_DIR, HERMES_HOME,
};
