// ============================================================
// engine/dream.cjs — 梦境整理系统 (CommonJS)
// 去重、合并、supersedes、归档旧记忆、项目整理建议
// ============================================================

const fs = require("fs");
const path = require("path");

const engine = require("./memory-db.cjs");
// 复用 memory-db 的解析器,避免逻辑分叉
const HERMES_HOME = engine.HERMES_HOME;
const MEMORY_DIR = path.join(HERMES_HOME, "memory");
const CODEX_MEMORY_DIR = path.join(HERMES_HOME, "codex-memory");
const DREAM_REPORT = path.join(HERMES_HOME, "dream-report.md");
const SIMILARITY_THRESHOLD = 0.7;
const ARCHIVE_DAYS = 30;

// ---- 文本相似度 ----
function textSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const features = (s) => {
    const lower = s.toLowerCase();
    const set = new Set();
    // bigrams (中英文通用,显著提升长句召回率)
    for (let i = 0; i < lower.length - 1; i++) {
      const bg = lower.slice(i, i + 2);
      if (bg.trim()) set.add(bg);
    }
    // 单字 (中文单字召回兜底)
    for (const ch of lower) {
      if (ch >= '\u4e00' && ch <= '\u9fff') set.add(ch);
    }
    return set;
  };
  const setA = features(a);
  const setB = features(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) { if (setB.has(t)) inter++; }
  // 保留 Jaccard 系数以维持向后兼容 (阈值 SIMILARITY_THRESHOLD=0.7 不变)
  return inter / new Set([...setA, ...setB]).size;
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch { return null; }
}

// ---- L3 去重 ----
function dedupSemantic(filePath) {
  const data = loadJson(filePath);
  if (!data) return { merged: 0, report: [] };
  const report = [];
  let merged = 0;

  for (const domain of Object.keys(data)) {
    const facts = data[domain];
    if (typeof facts !== "object") continue;
    const keys = Object.keys(facts);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = facts[keys[i]], b = facts[keys[j]];
        const va = typeof a === "object" ? (a.value || "") : String(a);
        const vb = typeof b === "object" ? (b.value || "") : String(b);
        if (textSimilarity(va, vb) >= SIMILARITY_THRESHOLD) {
          const ta = a.updated || a.learned || "";
          const tb = b.updated || b.learned || "";
          if (ta >= tb) facts[keys[j]] = { ...facts[keys[j]], superseded_by: keys[i], superseded_at: new Date().toISOString() };
          else facts[keys[i]] = { ...facts[keys[i]], superseded_by: keys[j], superseded_at: new Date().toISOString() };
          merged++;
          report.push(`  🔗 合并: ${domain}.${keys[i]} ↔ ${domain}.${keys[j]}`);
        }
      }
    }
  }
  if (merged > 0) fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  return { merged, report };
}

// ---- L4 去重 ----
function dedupArrayField(filePath, type) {
  const data = loadJson(filePath);
  if (!data || !Array.isArray(data[type])) return { merged: 0, report: [] };
  const items = data[type];
  const report = [];
  let merged = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const da = items[i].description || items[i].tip || items[i].name || "";
      const db = items[j].description || items[j].tip || items[j].name || "";
      if (textSimilarity(da, db) >= SIMILARITY_THRESHOLD) {
        items[j].superseded_at = new Date().toISOString();
        items[j].superseded_by = i;
        merged++; report.push(`  🔗 合并 ${type}: 第${i+1}条 ↔ 第${j+1}条`);
      }
    }
  }
  if (merged > 0) fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  return { merged, report };
}

// ---- 归档旧条目 ----
function archiveOldItems(filePath, type, ageField = "learned") {
  const data = loadJson(filePath);
  if (!data || !Array.isArray(data[type])) return { archived: 0, report: [] };
  const cutoff = Date.now() - ARCHIVE_DAYS * 86400000;
  const items = data[type];
  const report = [];
  let archived = 0;
  const keep = [], arch = [];

  for (const item of items) {
    if (item.superseded_by !== undefined) { arch.push(item); archived++; continue; }
    const t = item[ageField] || item.learned || "";
    const age = t ? new Date(t).getTime() : 0;
    if (age > 0 && age < cutoff && (item.used === 0 || item.used === undefined)) {
      arch.push(item); archived++;
      report.push(`  📦 归档: ${item.name || item.description || item.tip || "(未知)"}`);
    } else { keep.push(item); }
  }
  if (archived > 0) {
    data[type] = keep;
    if (!data._archived) data._archived = [];
    data._archived.push(...arch.map(a => ({ ...a, archived_at: new Date().toISOString() })));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  }
  return { archived, report };
}

// ---- 项目活跃度分析 ----
function generateProjectSuggestions() {
  const suggestions = [];
  for (const memDir of [MEMORY_DIR, CODEX_MEMORY_DIR]) {
    const l2Dir = path.join(memDir, "L2_episodic");
    if (!fs.existsSync(l2Dir)) continue;
    const files = fs.readdirSync(l2Dir).filter(f => f.endsWith(".jsonl")).sort().reverse().slice(0, 7);
    const platforms = {};
    let total = 0;
    for (const file of files) {
      const content = fs.readFileSync(path.join(l2Dir, file), "utf-8").trim();
      if (!content) continue;
      for (const line of content.split("\n").filter(Boolean)) {
        try { const e = JSON.parse(line); const p = e.platform || e.source || "unknown"; platforms[p] = (platforms[p] || 0) + 1; total++; } catch {}
      }
    }
    const top = Object.entries(platforms).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length > 0) {
      suggestions.push({
        source: path.basename(memDir),
        totalActions: total,
        topPlatforms: top,
        suggestion: top.map(([p, c]) => `${p}: ${c} 次（${(c/total*100).toFixed(0)}%）`).join("；"),
      });
    }
  }
  return suggestions;
}

// ---- 运行完整梦境 ----
function runDream(opts = {}) {
  const { dryRun = false } = opts;
  const report = [];
  let totalMerged = 0, totalArchived = 0;

  report.push("# 🌙 梦境整理报告");
  report.push("");
  report.push(`> 运行时间: ${new Date().toLocaleString("zh-CN")}`);
  report.push(`> 模式: ${dryRun ? "🔍 预览" : "✅ 执行"}`);
  report.push("");

  // L3
  report.push("## L3 语义记忆去重");
  for (const [label, filePath] of [["Hermes", path.join(MEMORY_DIR, "L3_semantic", "knowledge.json")], ["Codex", path.join(CODEX_MEMORY_DIR, "L3_semantic", "about-user.json")]]) {
    if (fs.existsSync(filePath)) {
      const { merged, report: r } = dedupSemantic(filePath);
      totalMerged += merged;
      report.push(`### ${label}`, ...(r.length > 0 ? r : ["  ✅ 无重复"]));
    } else report.push(`### ${label}`, "  ⏭️ 不存在");
  }

  // L4
  report.push("## L4 程序记忆去重");
  const l4Checks = [
    ["Hermes skills", path.join(MEMORY_DIR, "L4_procedural", "skills.json"), null],
    ["Codex pitfalls", path.join(CODEX_MEMORY_DIR, "L4_procedural", "learnings.json"), "pitfalls"],
    ["Codex patterns", path.join(CODEX_MEMORY_DIR, "L4_procedural", "learnings.json"), "patterns"],
  ];
  for (const [label, fp, field] of l4Checks) {
    if (!fs.existsSync(fp)) { report.push(`### ${label}`, "  ⏭️ 不存在"); continue; }
    if (field) {
      const { merged, report: r } = dedupArrayField(fp, field);
      totalMerged += merged;
      report.push(`### ${label}`, ...(r.length > 0 ? r : ["  ✅ 无重复"]));
    } else {
      // Hermes skills.json: object-based, check steps similarity
      const data = loadJson(fp);
      if (data) {
        const keys = Object.keys(data);
        let dup = 0;
        for (let i = 0; i < keys.length; i++) {
          for (let j = i + 1; j < keys.length; j++) {
            if (textSimilarity(String(data[keys[i]]?.steps||""), String(data[keys[j]]?.steps||"")) >= SIMILARITY_THRESHOLD) {
              report.push(`  🔗 技能重复: ${keys[i]} ↔ ${keys[j]}`);
              dup++; totalMerged++;
            }
          }
        }
        if (dup === 0) report.push("  ✅ 无重复");
      }
    }
  }

  // 归档
  if (!dryRun) {
    report.push("## 归档旧记忆");
    const archChecks = [
      ["Codex pitfalls", path.join(CODEX_MEMORY_DIR, "L4_procedural", "learnings.json"), "pitfalls"],
    ];
    for (const [label, fp, field] of archChecks) {
      if (!fs.existsSync(fp)) continue;
      const { archived, report: ar } = archiveOldItems(fp, field);
      totalArchived += archived;
      report.push(...(ar.length > 0 ? ar : [`  ✅ ${label} 无需归档`]));
    }
  }

  // 项目活跃度
  report.push("## 项目活跃度");
  const suggestions = generateProjectSuggestions();
  if (suggestions.length > 0) {
    for (const s of suggestions) report.push(`- **${s.source}**: ${s.totalActions} 条操作`, `  ${s.suggestion}`);
  } else report.push("  ℹ️ 数据不足");

  // 总结
  report.push("", "## 📊 梦境总结", "", `| 指标 | 值 |`, `|------|-----|`, `| 合并重复 | ${totalMerged} 条 |`, `| 归档旧记忆 | ${totalArchived} 条 |`, `| 活跃项目 | ${suggestions.length} 个 |`);

  const full = report.join("\n");
  if (!dryRun) fs.writeFileSync(DREAM_REPORT, full, "utf-8");
  return full;
}

// ---- CLI ----
if (require.main === module) {
  const isDry = process.argv.includes("--dry-run") || process.argv.includes("--preview");
  console.log(isDry ? "🔍 预览模式..." : "🌙 运行梦境整理...");
  console.log(runDream({ dryRun: isDry }));
}

module.exports = { runDream, textSimilarity };
