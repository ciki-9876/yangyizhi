/* 外部大模型接入：OpenAI 兼容协议 + Anthropic 原生协议。
   只负责「把消息发出去、把文字拿回来」，不关心游戏。app.js 里的 AI 适配器决定用 Claude（artifact 宿主）还是这里。
   配置存在本机 localStorage（与存档分开，复制存档时不会带出密钥）。 */
const LLM = (() => {
  const KEY = 'yangyizhi.llm.v1';

  // 预设只是填好地址和建议模型，全部可改。模型名以服务商文档为准。
  const PRESETS = {
    deepseek:   { name: 'DeepSeek',  proto: 'openai',    base: 'https://api.deepseek.com',                           model: 'deepseek-chat', direct: false, doc: 'https://platform.deepseek.com' },
    qwen:       { name: '通义千问',   proto: 'openai',    base: 'https://dashscope.aliyuncs.com/compatible-mode/v1',  model: 'qwen-plus',     direct: false, doc: 'https://bailian.console.aliyun.com' },
    kimi:       { name: 'Kimi',      proto: 'openai',    base: 'https://api.moonshot.cn/v1',                         model: '',              direct: false, doc: 'https://platform.moonshot.cn' },
    zhipu:      { name: '智谱 GLM',   proto: 'openai',    base: 'https://open.bigmodel.cn/api/paas/v4',               model: '',              direct: false, doc: 'https://open.bigmodel.cn' },
    openrouter: { name: 'OpenRouter', proto: 'openai',   base: 'https://openrouter.ai/api/v1',                        model: '',              direct: true,  doc: 'https://openrouter.ai/models' },
    anthropic:  { name: 'Claude API', proto: 'anthropic', base: 'https://api.anthropic.com',                          model: 'claude-sonnet-5-5', quick: 'claude-haiku-5-5', direct: true, doc: 'https://docs.claude.com' },
    openai:     { name: 'OpenAI',    proto: 'openai',    base: 'https://api.openai.com/v1',                          model: '',              direct: false, doc: 'https://platform.openai.com' },
    custom:     { name: '自建代理 / 其他', proto: 'openai', base: '',                                                 model: '',              direct: true,  doc: '' },
  };

  function load() { try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && c.base && c.model ? c : null; } catch (e) { return null; } }
  function save(c) { const P = typeof window !== 'undefined' && window.Agent && window.Agent.Persist; try { if (c) { localStorage.setItem(KEY, JSON.stringify(c)); P && P.mirror(KEY, JSON.stringify(c)); } else { localStorage.removeItem(KEY); P && P.remove(KEY); } return true; } catch (e) { return false; } }
  const trimBase = b => String(b || '').trim().replace(/\/+$/, '');
  const label = c => c ? ((PRESETS[c.preset] && c.preset !== 'custom' ? PRESETS[c.preset].name : '') || hostOf(c.base)) : '';
  function hostOf(u) { try { return new URL(u).host; } catch (e) { return u; } }

  function err(code, detail) { const e = new Error(code + (detail ? ': ' + detail : '')); e.code = code; e.detail = detail || ''; return e; }

  // 统一成 [{role, content}]；第一条 user 里通常装着人设和规则，Anthropic 也照样作为 user 发。
  function toMessages(input) {
    if (Array.isArray(input)) return input.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));
    return [{ role: 'user', content: String(input) }];
  }

  async function post(url, headers, body, ms) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms || 45000);
    let res;
    try { res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal }); }
    catch (e) { clearTimeout(timer); if (e && e.name === 'AbortError') throw err('timeout'); throw err('network', e && e.message); }
    clearTimeout(timer);
    let data = null, raw = '';
    try { raw = await res.text(); data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
    if (!res.ok) {
      const msg = (data && (data.error && (data.error.message || data.error.msg) || data.message)) || raw.slice(0, 160) || ('HTTP ' + res.status);
      const code = data && data.error && data.error.code === 'quota' ? 'quota' : res.status === 401 || res.status === 403 ? 'auth' : res.status === 404 ? 'not_found' : res.status === 429 ? 'rate_limited' : res.status === 402 ? 'quota' : res.status >= 500 ? 'upstream' : 'bad_request';
      throw err(code, String(msg).slice(0, 200));
    }
    if (!data) throw err('bad_response', raw.slice(0, 120));
    return data;
  }

  async function complete(c, input, opt) {
    opt = opt || {};
    const base = trimBase(c.base), model = (opt.tier === 'quick' && c.quick) ? c.quick : c.model, msgs = toMessages(input);
    const maxTokens = opt.maxTokens || (opt.tier === 'quick' ? 700 : 1200);
    if (c.proto === 'anthropic') {
      const h = Object.assign({ 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, c.headers || {});
      if (c.key) h['x-api-key'] = c.key;
      const d = await post(base + '/v1/messages', h, { model, max_tokens: maxTokens, messages: msgs, temperature: opt.temperature != null ? opt.temperature : 0.8 }, opt.timeout);
      const text = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      if (!text && d.stop_reason === 'refusal') throw err('refused');
      return { text: text.trim(), usage: d.usage || null };
    }
    const h = Object.assign({ 'content-type': 'application/json' }, c.headers || {});
    if (c.key) h.authorization = 'Bearer ' + c.key;
    const url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
    const d = await post(url, h, { model, messages: msgs, max_tokens: maxTokens, temperature: opt.temperature != null ? opt.temperature : 0.8, stream: false }, opt.timeout);
    const ch = d.choices && d.choices[0], m = ch && ch.message;
    let text = m ? (typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map(p => p.text || '').join('') : '') : '';
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();   // 部分推理模型把思考过程放在正文里
    if (!text && ch && ch.finish_reason === 'content_filter') throw err('refused');
    if (!text) throw err('bad_response', 'empty');
    return { text, usage: d.usage || null };
  }

  // 宽松解析：去掉 ```json 围栏，截取第一个 { 或 [ 到最后一个对应括号。
  function parseJSON(s) {
    let t = String(s || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { return JSON.parse(t); } catch (e) { /* 继续 */ }
    const i = t.search(/[\[{]/); if (i < 0) throw err('invalid_json');
    const close = t[i] === '{' ? '}' : ']', j = t.lastIndexOf(close);
    if (j <= i) throw err('invalid_json');
    try { return JSON.parse(t.slice(i, j + 1)); } catch (e) { throw err('invalid_json'); }
  }

  async function json(c, input, opt) {
    const r = await complete(c, input, Object.assign({ temperature: 0.6 }, opt));
    try { return parseJSON(r.text); }
    catch (e) {   // 再给一次机会，明确要求只回 JSON
      const msgs = toMessages(input).concat([{ role: 'assistant', content: r.text }, { role: 'user', content: '格式不对。只回复 JSON 本身，不要任何其他文字。' }]);
      const r2 = await complete(c, msgs, Object.assign({ temperature: 0.2 }, opt));
      return parseJSON(r2.text);
    }
  }

  async function test(c) {
    const t0 = Date.now();
    const r = await complete(c, '这是一次连通测试。只回复两个字：收到', { maxTokens: 20, timeout: 20000, temperature: 0 });
    return { ms: Date.now() - t0, text: r.text.slice(0, 40) };
  }

  return { KEY, PRESETS, load, save, label, hostOf, complete, json, test, parseJSON, trimBase };
})();
if (typeof module !== 'undefined') module.exports = LLM;
