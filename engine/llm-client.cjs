// engine/llm-client.cjs — OpenAI-compatible LLM 客户端 (零运行时依赖)
// 用于 dream.cjs 自动摘要 L2 episodes
// 支持 provider: DeepSeek / SiliconFlow / OpenRouter / Groq (按用户优先级)
const https = require("https");

// Provider 配置 (OpenAI-compatible chat completions)
const PROVIDERS = [
  { name: "deepseek", baseUrl: "api.deepseek.com", envKey: "DEEPSEEK_API_KEY", model: "deepseek-chat" },
  { name: "siliconflow", baseUrl: "api.siliconflow.cn", envKey: "SILICONFLOW_API_KEY", model: "Qwen/Qwen2.5-7B-Instruct" },
  { name: "openrouter", baseUrl: "openrouter.ai", envKey: "OPENROUTER_API_KEY", model: "meta-llama/llama-3.1-8b-instruct:free" },
  { name: "groq", baseUrl: "api.groq.com", envKey: "GROQ_API_KEY", model: "llama-3.1-8b-instant" },
];

// env override (用户可强制指定某个 provider)
function pickProvider() {
  const override = process.env.HERMES_LLM_PROVIDER;
  if (override) {
    const p = PROVIDERS.find(x => x.name === override);
    if (!p) throw new Error(`[llm-client] Unknown HERMES_LLM_PROVIDER: ${override}. Valid: ${PROVIDERS.map(x => x.name).join(", ")}`);
    const key = process.env[p.envKey];
    if (!key) throw new Error(`[llm-client] ${override} selected but ${p.envKey} not set`);
    return { ...p, key };
  }
  // 自动 fallback: 第一个 env key 存在的
  for (const p of PROVIDERS) {
    const key = process.env[p.envKey];
    if (key) return { ...p, key };
  }
  return null;
}

function chat({ messages, maxTokens = 200, temperature = 0.3, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const provider = pickProvider();
    if (!provider) {
      reject(new Error(`[llm-client] No LLM provider configured. Set one of: ${PROVIDERS.map(p => p.envKey).join(", ")}`));
      return;
    }
    const body = JSON.stringify({
      model: provider.model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
    });
    const url = new URL(`https://${provider.baseUrl}/v1/chat/completions`);
    const req = https.request({
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

// 摘要专用 prompt (中文)
function buildSummaryPrompt(text, targetTokens = 200) {
  return [
    {
      role: "system",
      content: `你是 Hermes Memory 的记忆摘要助手。把用户提供的 episode 内容压缩到 ≤${targetTokens} token,保留关键实体(人名/数字/平台/项目)、时间节点、状态变更、错误信息。删除冗余描述、修饰语、重复内容。输出纯文本,不要 Markdown、不要解释、不要前缀。`,
    },
    { role: "user", content: text },
  ];
}

module.exports = { chat, buildSummaryPrompt, pickProvider, PROVIDERS };