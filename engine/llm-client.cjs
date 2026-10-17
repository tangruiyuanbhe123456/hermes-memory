// engine/llm-client.cjs — OpenAI-compatible LLM 客户端 (零运行时依赖)
// 用于 dream.cjs 自动摘要 L2 episodes
// 支持 provider: opencode (免费, CLI 通道) / DeepSeek / SiliconFlow / OpenRouter / Groq
// 也支持任意 OpenAI-compatible 端点: 设 HERMES_LLM_BASE_URL (+ 可选 HERMES_LLM_API_KEY / HERMES_LLM_MODEL)
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// Provider 配置 (OpenAI-compatible chat completions)
const PROVIDERS = [
  { name: "deepseek", baseUrl: "api.deepseek.com", envKey: "DEEPSEEK_API_KEY", model: "deepseek-chat" },
  { name: "siliconflow", baseUrl: "api.siliconflow.cn", envKey: "SILICONFLOW_API_KEY", model: "Qwen/Qwen2.5-7B-Instruct" },
  { name: "openrouter", baseUrl: "openrouter.ai", envKey: "OPENROUTER_API_KEY", model: "meta-llama/llama-3.1-8b-instruct:free" },
  { name: "groq", baseUrl: "api.groq.com", envKey: "GROQ_API_KEY", model: "llama-3.1-8b-instant" },
];

// OpenCode 免费模型 — 不走 HTTP, 走本机 CLI (opencode run), 零 API key
const OPENCODE_PROVIDER = { name: "opencode", model: process.env.OPENCODE_MODEL || "opencode/mimo-v2.6-flash-free" };

// 在 PATH 里找真正的 opencode.exe (npm 全局安装只有 .cmd 壳, Windows 下 execFile 无法直接 spawn .cmd)
function resolveOpenCodeBin() {
  if (process.env.OPENCODE_BIN) return process.env.OPENCODE_BIN;
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    for (const cand of [
      path.join(dir, "opencode.exe"),                                      // 直接在 PATH 目录
      path.join(dir, "node_modules", "@opencode", "cli", "bin", "opencode.exe"), // npm 全局 .cmd 同级目录
    ]) {
      try { if (fs.statSync(cand).isFile()) return cand; } catch {}
    }
  }
  return null;
}

// env override (用户可强制指定某个 provider)
function pickProvider() {
  const override = process.env.HERMES_LLM_PROVIDER;
  if (override) {
    if (override === "opencode") {
      const bin = resolveOpenCodeBin();
      if (!bin) throw new Error("[llm-client] HERMES_LLM_PROVIDER=opencode but opencode.exe not found in PATH (set OPENCODE_BIN to override)");
      return { ...OPENCODE_PROVIDER, bin };
    }
    const p = PROVIDERS.find(x => x.name === override);
    if (!p) throw new Error(`[llm-client] Unknown HERMES_LLM_PROVIDER: ${override}. Valid: opencode, ${PROVIDERS.map(x => x.name).join(", ")}`);
    const key = process.env[p.envKey];
    if (!key) throw new Error(`[llm-client] ${override} selected but ${p.envKey} not set`);
    return { ...p, key };
  }
  // 自定义 OpenAI-compatible 端点优先 (任意 baseURL)
  if (process.env.HERMES_LLM_BASE_URL) {
    return {
      name: "custom",
      baseUrl: process.env.HERMES_LLM_BASE_URL,
      key: process.env.HERMES_LLM_API_KEY || "not-needed",
      model: process.env.HERMES_LLM_MODEL || "default",
    };
  }
  // opencode 免费模型 (本机 CLI 可用即优先, 零配置)
  const ocBin = resolveOpenCodeBin();
  if (ocBin) return { ...OPENCODE_PROVIDER, bin: ocBin };
  // 自动 fallback: 第一个 env key 存在的
  for (const p of PROVIDERS) {
    const key = process.env[p.envKey];
    if (key) return { ...p, key };
  }
  return null;
}

// —— 路径 A: OpenCode CLI 通道 (免费模型) ——
// 注意: 中文 prompt 必须走 stdin (Windows 下 execFile 传中文参数会被编码破坏导致 CLI 挂起)
function chatViaOpenCode({ provider, messages, timeoutMs }) {
  return new Promise((resolve, reject) => {
    // CLI 只接纯文本 prompt, 把 messages 拍平成一段话
    const prompt = messages.map(m => `${m.role}: ${m.content}`).join("\n\n");
    const child = spawn(provider.bin, [
      "run",
      "--model", provider.model,
      "--format", "json",
      "--log-level", "error",
    ], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8"); // 正确处理跨 chunk 的多字节 UTF-8 字符
    child.stderr.setEncoding("utf8");
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`[llm-client] opencode run timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", d => stdout += d);
    child.stderr.on("data", d => stderr += d);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`[llm-client] opencode spawn error: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`[llm-client] opencode run exit ${code}: ${String(stderr).slice(0, 200)}`));
        return;
      }
      try {
        // NDJSON 流: 拼接所有 type:"text" 的 part.text
        const parts = String(stdout).split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
        const content = parts.filter(p => p.type === "text" && p.part?.text).map(p => p.part.text).join("").trim();
        if (!content) {
          reject(new Error(`[llm-client] opencode returned empty content: ${String(stdout).slice(0, 200)}`));
          return;
        }
        resolve({ content, provider: "opencode", model: provider.model });
      } catch (e) {
        reject(new Error(`[llm-client] opencode JSON parse error: ${e.message}; raw: ${String(stdout).slice(0, 200)}`));
      }
    });
    child.stdin.write(prompt, "utf8");
    child.stdin.end();
  });
}

// —— 路径 B: OpenAI-compatible HTTP 通道 ——
function chatViaHttp({ provider, messages, maxTokens, temperature, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: provider.model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
    });
    const url = new URL(provider.baseUrl.includes("://") ? `${provider.baseUrl}/v1/chat/completions` : `https://${provider.baseUrl}/v1/chat/completions`);
    const req = (url.protocol === "http:" ? http : https).request({
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${provider.key}`,
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`[llm-client] ${provider.name} HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.message?.content;
          if (!content) {
            reject(new Error(`[llm-client] ${provider.name} returned empty content: ${data.slice(0, 200)}`));
            return;
          }
          resolve({ content, provider: provider.name, model: provider.model });
        } catch (e) {
          reject(new Error(`[llm-client] ${provider.name} JSON parse error: ${e.message}; raw: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on("error", e => reject(new Error(`[llm-client] ${provider.name} request error: ${e.message}`)));
    req.on("timeout", () => { req.destroy(new Error(`[llm-client] ${provider.name} timeout after ${timeoutMs}ms`)); });
    req.write(body);
    req.end();
  });
}

// 统一入口: 按 provider 类型分流 (opencode → CLI, 其他 → HTTP)
function chat(options = {}) {
  let provider;
  try {
    provider = pickProvider();
  } catch (e) {
    // pickProvider 会同步 throw (如无效 HERMES_LLM_PROVIDER), 转成 rejected promise
    // 这样调用方的 try/catch + await 能正常降级, 而不是让整个进程崩溃
    return Promise.reject(e);
  }
  if (!provider) {
    return Promise.reject(new Error(`[llm-client] No LLM provider configured. Set one of: OPENCODE_BIN/PATH, HERMES_LLM_BASE_URL, ${PROVIDERS.map(p => p.envKey).join(", ")}`));
  }
  const { maxTokens = 200, temperature = 0.3, timeoutMs = 30000 } = options;
  if (provider.name === "opencode") {
    return chatViaOpenCode({ provider, messages: options.messages, timeoutMs: Math.max(timeoutMs, 60000) });
  }
  return chatViaHttp({ provider, messages: options.messages, maxTokens, temperature, timeoutMs });
}

// 摘要专用 prompt (中文)
function buildSummaryPrompt(text, targetTokens = 200) {
  return [
    {
      role: "system",
      content: `你是 Hermes Memory 的记忆摘要助手。把用户提供的 episode 内容压缩到 ≤${targetTokens} token,保留关键实体(人名/数字/平台/项目)、时间节点、状态变更、错误信息。删除冗余描述、修饰语、重复内容。输出纯文本,不要 Markdown、不要解释、不要前缀。只用中文数字和逗号句号,禁止使用 ①②③ 等特殊符号、星号、井号。`,
    },
    { role: "user", content: text },
  ];
}

module.exports = { chat, buildSummaryPrompt, pickProvider, PROVIDERS };