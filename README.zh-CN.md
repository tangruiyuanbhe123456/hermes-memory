# Hermes Memory · 五层 AI Agent 记忆系统

**为 AI Agent 打造的五层记忆系统。** 零外部依赖。FTS5 中英文全文搜索。MCP 协议支持。Web 可视化管理面板。梦境归并引擎。AES-256-GCM 加密。

> 🚀 `npx skills init` → `npx skills install memory-system`

🌐 **语言切换：** [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README_CN.md)

---

## 为什么选择 Hermes Memory？

市面上的 AI Agent 记忆系统大致分两类：

1. **依赖云端**（Mem0、Supermemory）— 需要 API Key、向量数据库、云基础设施
2. **过于简单** — 只能存和读，没有搜索、去重、策略优化

Hermes Memory 是**唯一同时具备"离线运行 + 零外部依赖 + L5 元认知自省引擎"**的记忆系统——它不仅记录，还能学习*哪些策略有效、哪些无效*，并自动推荐最优路径。

| 能力 | Hermes Memory | Mem0 | Letta | Supermemory | KeyMemory |
|------|:---:|:---:|:---:|:---:|:---:|
| 离线运行，零外部依赖 | ✅ | ❌ | ✅ | ❌ | ✅ |
| 中英文 FTS5 全文搜索 | ✅ | ❌ | ❌ | ❌ | ❌ |
| L5 元认知自省引擎 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 梦境归并（去重+合并） | ✅ | ❌ | ❌ | ❌ | ✅ |
| 写入前自动备份 | ✅ | ❌ | ❌ | ❌ | ✅ |
| Web 可视化面板 | ✅ | ❌ | ❌ | ✅ | ✅ |
| MCP 协议支持 | ✅ | ❌ | ❌ | ❌ | ✅ |
| 多 Agent 协同（Codex/Claude/Hermes） | ✅ | ❌ | ✅ | ❌ | ✅ |
| 平台健康追踪 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 踩坑知识库 | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 系统架构

```
hermes-memory/
├── engine/                # 核心引擎
│   ├── memory-db.cjs      # 核心：SQLite FTS5 引擎 + 备份 + 加密
│   ├── dashboard.cjs      # Web UI（http://127.0.0.1:3210）
│   ├── mcp-server.cjs     # MCP 协议服务器
│   ├── dream.cjs          # 梦境归并引擎
│   └── agent-config.cjs   # Agent 配置生成器
├── memory/                # 五层记忆数据
│   ├── L1_working/        # 工作记忆：当前会话状态
│   ├── L2_episodic/       # 情节记忆：操作流水（JSONL + FTS5）
│   ├── L3_semantic/       # 语义记忆：长期知识
│   ├── L4_procedural/     # 流程记忆：可复用技能
│   └── L5_metacognitive/  # 元认知：策略自省与评估
├── agent-configs/         # Claude/Codex/Hermes 即用配置
├── codex-memory/          # Codex 兼容记忆（同五层结构）
├── package.json
└── memory.db              # SQLite FTS5 索引（首次运行自动生成）
```

### 五层记忆说明

| 层级 | 名称 | 作用 | 典型场景 |
|------|------|------|----------|
| **L1** | 工作记忆 | 当前会话状态、临时草稿 | 任务上下文、待办清单 |
| **L2** | 情节记忆 | 带时间戳的操作流水 | "昨天 14:00 调了哪个 API" |
| **L3** | 语义记忆 | 长期事实、模式、知识 | "用户偏好 17px 字体" |
| **L4** | 流程记忆 | 可复用工作流与技能 | "小红书发文三关检验" |
| **L5** | 元认知 | 策略分析：什么有效、什么无效 | "DeepSeek 流式失败 → 换 CC Switch" |

---

## 快速开始

### 1. 安装

**方式 A：通过 skills.sh（推荐 AI Agent 使用）**
```bash
npx skills init
npx skills install memory-system
```

**方式 B：通过 npm（独立运行）**
```bash
npm install hermes-memory
npx hermes-memory-dashboard
```

**方式 C：从源码**
```bash
git clone https://github.com/tangruiyuanbhe123456/hermes-memory.git
cd hermes-memory
node engine/dashboard.cjs
```

### 2. 启动 Web 面板

```bash
node engine/dashboard.cjs
# → http://127.0.0.1:3210
```

### 3. 连接你的 AI Agent

| Agent | 接入方式 |
|-------|----------|
| **Hermes Agent** | 安装为 skill（见上方 `skills install memory-system`） |
| **Claude Code** | `cp agent-configs/CLAUDE.md /path/to/project/CLAUDE.md` |
| **Codex CLI** | MCP 服务器自动检测 Codex 会话 |
| **任何 MCP 兼容 Agent** | 在 MCP 配置中指向服务器： |

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

### 4. 运行梦境归并

```bash
# 预览（不写文件，看会合并哪些）
node engine/dream.cjs --dry-run

# 实际执行
node engine/dream.cjs
```

### 5. 健康检查

```bash
node -e "const e=require('./engine/memory-db.cjs'); console.log(JSON.stringify(e.dbHealth(),null,2))"
```

---

## 核心特性

### 🔍 FTS5 中英文全文搜索

与基于向量数据库的方案不同，Hermes Memory 使用 SQLite FTS5 配合 CJK 填充技术，无需任何外部依赖即可搜索中英文混合查询，例如：

```bash
# 同时匹配中文和英文
search "小红书发布pending"
search "DeepSeek 流式失败"
```

零嵌入模型、零向量数据库、零 API 调用——纯本地毫秒级响应。

### 🧠 L5 元认知自省引擎

元认知层持续追踪策略的成败历史，自动推荐最有效的方案。**这是其他记忆系统都没有的能力。**

示例：
> 任务：批量发布内容到小红书  
> L5 历史记录：DeepSeek 流式调用失败 3 次 → 成功率 0%  
> L5 自动推荐：改用 CC Switch（localhost:15721），历史成功率 100%

### 💭 梦境归并（Dream Consolidation）

自动去重、合并、归档旧记忆，让知识库保持精简，**无需手动整理**。

- 相似条目自动合并
- 7 天未访问的 L2 流水归档
- L3/L4 重复事实去重
- L5 策略记录自动归纳

### 🔐 AES-256-GCM 加密存储

API Key、token、密码等敏感凭据加密落盘，**不需要 `.env` 文件**，避免明文泄露。

### 💾 写入前自动备份

每次写入 L3/L4/L5 前自动备份，保留 7 天，支持事务级回滚。

### 🏥 平台健康追踪

自动监控各 Provider（DeepSeek / SiliconFlow / Gemini / OpenRouter 等）的可用性与延迟，**L5 决策时直接引用历史健康数据**。

---

## 竞品对比

| 能力 | Hermes Memory | Mem0 | Supermemory | Letta | KeyMemory |
|------|:---:|:---:|:---:|:---:|:---:|
| **GitHub Stars** | 新项目 | 58K | 26K | 23K | 新项目 |
| 离线零依赖 | ✅ | ❌ | ❌ | ✅ | ✅ |
| 中英文 FTS5 搜索 | ✅ | ❌ | ❌ | ❌ | ❌ |
| L5 元认知自省 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 梦境归并 | ✅ | ❌ | ❌ | ❌ | ✅ |
| Web 管理面板 | ✅ | ❌ | ✅ | ❌ | ✅ |
| MCP 协议 | ✅ | ❌ | ❌ | ❌ | ✅ |
| 写入前自动备份 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 平台健康追踪 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 踩坑知识库 | ✅ | ❌ | ❌ | ❌ | ❌ |
| `npm install` 一键装 | ✅ | ❌ | ✅ | ✅ | ❌ |

---

## 适用场景

- 🤖 **多 AI Agent 协同**：Codex + Claude Code + Hermes 共享同一份记忆
- 📈 **自动化运营**：长期跑 cron 任务，需要记忆历史成败
- 🔐 **本地优先**：不想把数据上云，又想要企业级记忆能力
- 🧠 **策略自省**：想知道"哪条路走过、哪条路走过但失败了"
- 🌏 **中文场景**：原生支持中英文混合搜索，无需额外处理

---

## 路线图

- [ ] 跨设备同步（端到端加密）
- [ ] Web UI 增加时间线视图
- [ ] L5 策略可视化推荐面板
- [ ] 导出 / 导入记忆包
- [ ] 多用户隔离

---

## 贡献

欢迎 PR 和 Issue！特别欢迎：
- 🐛 踩坑案例（→ L5 元认知会自动收录）
- 📚 新的工作流模板（→ L4 流程记忆）
- 🌐 翻译（README、文档、提示词）

---

## 许可证

MIT

---

<p align="center">
  Made with 🧠 for the AI Agent ecosystem
</p>
