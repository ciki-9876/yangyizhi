/* 养一只 · 模型网关（Cloudflare Worker；逻辑是标准 fetch，也能搬到阿里云函数计算、腾讯云云函数）
 *
 * 作用：
 *  1. 把 API 密钥留在服务器上，网页和 App 里不出现密钥；
 *  2. 给不允许网页直连的服务商补上跨域头；
 *  3. 只放行你的来源和指定模型、限制单次长度；
 *  4. 每台设备每天限额（需要绑定 KV：QUOTA），超额返回 429 + code=quota，App 会退回预写台词；
 *  5. 主模型出错（超时、5xx、429）时自动换备用模型。
 *
 * 环境变量：
 *  UPSTREAM_BASE / UPSTREAM_KEY / UPSTREAM_MODEL     主模型（OpenAI 兼容）。UPSTREAM_MODEL 留空则用请求里的模型名
 *  FALLBACK_BASE / FALLBACK_KEY / FALLBACK_MODEL     备用模型（可选）
 *  ALLOWED_ORIGINS  允许的来源，逗号分隔。安卓 App 的来源是 https://localhost
 *  ALLOWED_MODELS   可选，允许的模型名（App 里配置的名字），逗号分隔
 *  MAX_TOKENS       单次最大输出，默认 1200
 *  DAILY_LIMIT      每台设备每天的调用次数，默认 80；需要绑定 KV 命名空间 QUOTA，不绑定就不限
 *
 * App 侧：在 config.json（或远程配置）里写
 *  "official": { "label": "养一只", "base": "https://<网关域名>/v1", "model": "main", "quick": "main" }
 *  App 会带上请求头 x-yz-device（设备号）。
 *
 * 注意：设备号由客户端生成，可以伪造；正式上线要换成账号登录后按用户限额（见 docs/dev-plan.md M2）。
 */
export default {
  async fetch(req, env) {
    const origin = req.headers.get('origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const okOrigin = allowed.length === 0 || allowed.includes(origin);
    const cors = {
      'access-control-allow-origin': okOrigin && origin ? origin : (allowed[0] || '*'),
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization, x-yz-device',
      'access-control-max-age': '86400',
      vary: 'origin',
    };
    const reply = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'content-type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response(null, { status: okOrigin ? 204 : 403, headers: cors });
    if (!okOrigin) return reply(403, { error: { message: 'origin not allowed' } });
    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    if (req.method !== 'POST' || !/\/chat\/completions$/.test(path)) return reply(404, { error: { message: 'POST /v1/chat/completions only' } });

    const raw = await req.text();
    if (raw.length > 64 * 1024) return reply(413, { error: { message: 'request too large' } });
    let body;
    try { body = JSON.parse(raw); } catch (e) { return reply(400, { error: { message: 'bad json' } }); }

    const models = (env.ALLOWED_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (models.length && !models.includes(body.model)) return reply(403, { error: { message: 'model not allowed' } });

    // 每台设备每天限额
    const device = (req.headers.get('x-yz-device') || '').slice(0, 64);
    if (env.QUOTA) {
      if (!/^[0-9a-f-]{16,64}$/.test(device)) return reply(400, { error: { message: 'missing device id' } });
      const day = new Date().toISOString().slice(0, 10), key = 'q:' + day + ':' + device, limit = +env.DAILY_LIMIT || 80;
      const used = +(await env.QUOTA.get(key)) || 0;
      if (used >= limit) return reply(429, { error: { code: 'quota', message: 'daily quota reached' } });
      await env.QUOTA.put(key, String(used + 1), { expirationTtl: 2 * 86400 });
    }

    const cap = +env.MAX_TOKENS || 1200;
    body.max_tokens = Math.min(+body.max_tokens || cap, cap);
    body.stream = false;

    const call = async (base, key, model, ms) => {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
      try {
        return await fetch(String(base).replace(/\/+$/, '') + '/chat/completions', {
          method: 'POST', signal: ctl.signal,
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
          body: JSON.stringify({ ...body, model: model || body.model }),
        });
      } finally { clearTimeout(timer); }
    };
    let up = null;
    try { up = await call(env.UPSTREAM_BASE, env.UPSTREAM_KEY, env.UPSTREAM_MODEL, 30000); } catch (e) { up = null; }
    if ((!up || up.status >= 500 || up.status === 429) && env.FALLBACK_BASE) {
      try { up = await call(env.FALLBACK_BASE, env.FALLBACK_KEY, env.FALLBACK_MODEL, 30000); } catch (e) { /* 两个都不行 */ }
    }
    if (!up) return reply(504, { error: { message: 'upstream timeout' } });
    return new Response(up.body, { status: up.status, headers: { ...cors, 'content-type': up.headers.get('content-type') || 'application/json' } });
  },
};
