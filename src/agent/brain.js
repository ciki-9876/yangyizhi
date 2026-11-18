/* Agent 运行时：它的脑子从哪来（AI）、有哪些提示词（Prompts）、一次调用怎么走（Brain.run）。
 * 界面代码只调用 Brain.run，不直接碰模型。任何一步失败都返回 null，由界面退回预写台词。 */
(function (root) {
  const A = root.Agent, { Config, Trace, Platform } = A, Guard = A.Guard;
  let ctx = { L: null };                                         // app.js 启动时注入：当前语言表
  A.bind = o => { ctx = Object.assign(ctx, o); };
  const L = () => ctx.L();

  /* ---------- 它的脑子从哪来：自带密钥 > 官方网关 > claude.ai 宿主 > 无 ---------- */
  const AI = {
    fn: null, ext: null, off: false,
    get official() {
      const o = Config.flag('officialModel') && Config.get('official');
      return o && o.base && o.model ? { preset: 'official', proto: o.proto || 'openai', base: o.base, model: o.model, quick: o.quick || '', key: '', headers: { 'x-yz-device': Platform.deviceId() }, label: o.label || '养一只' } : null;
    },
    get cfg() { return this.ext || this.official; },
    get src() { return this.ext ? 'ext' : this.official ? 'official' : this.fn ? 'host' : ''; },
    get on() { return !!this.src && !this.off; },
    get who() { return this.ext ? LLM.label(this.ext) : this.official ? this.official.label : 'Claude'; },
    async init() {
      this.ext = LLM.load();
      try { this.fn = (root.claude && root.claude.use) ? (await root.claude.use('sample')) || null : null; } catch (e) { this.fn = null; }
      this.sync();
    },
    use(cfg) { this.ext = cfg || null; this.off = false; LLM.save(this.ext); this.sync(); },
    sync() { document.body.classList.toggle('ai-on', this.on); },
    message(e) {
      const c = e && e.code, err = L().err;
      if (this.src === 'host' && ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(c)) { this.off = true; this.sync(); return this.fillWho(err.off); }
      if (c === 'cancelled') return '';
      return this.fillWho(err[c] || err.other);
    },
    fillWho(s) { return String(s).replace(/\{who\}/g, this.who); },
    async text(input, tier, max) {
      const c = this.cfg; if (c) return (await LLM.complete(c, input, { tier, maxTokens: max })).text;
      const r = await this.fn(input, { modelTier: tier || 'default', cache: false }); return String(r.text || '').trim();
    },
    async json(input, tier, max) {
      const c = this.cfg; if (c) return await LLM.json(c, input, { tier, maxTokens: max });
      return await this.fn.json(input, { modelTier: tier || 'default', cache: false });
    },
  };

  /* ---------- 提示词注册表：编号、版本、档位、格式、整理函数、哪些字段要过红线 ----------
   * 提示词正文在 strings.js 的 P 里（按语言）；这里只管元数据。改了正文就把 v 加一，追踪里能看出是哪一版。 */
  const s = (x, n) => String(x == null ? '' : x).trim().slice(0, n);
  const Prompts = {
    plan: { v: 1, tier: 'default', fmt: 'json', norm: r => {
      const ms = (r && Array.isArray(r.milestones) ? r.milestones : []).map(m => ({ name: s(m && m.name, 20), doneWhen: s(m && m.doneWhen, 50) })).filter(m => m.name).slice(0, 5);
      return ms.length >= 2 ? { miles: ms, first: s(r.firstStep, 100), kind: r.kind } : null; }, check: o => [o.first] },
    react: { v: 2, tier: 'quick', fmt: 'json', norm: r => r && r.say ? { say: s(r.say, 80), ask: s(r.ask, 60), next: s(r.next, 40) } : null, check: o => [o.say, o.ask] },
    welcome: { v: 2, tier: 'default', fmt: 'text', norm: t => s(t, 400) || null, check: o => [o] },
    shrink: { v: 1, tier: 'quick', fmt: 'json', norm: r => { const o = (Array.isArray(r) ? r : []).map(x => s(x, 40)).filter(Boolean).slice(0, 3); return o.length ? o : null; }, check: o => o },
    shell: { v: 1, tier: 'default', fmt: 'text', norm: t => s(t, 300) || null, check: o => [o] },
    chat: { v: 2, tier: 'quick', fmt: 'text', norm: t => s(t, 600) || null, check: o => [o] },
    memGoal: { v: 1, tier: 'quick', fmt: 'json', norm: r => r && typeof r === 'object' ? { progress: s(r.progress, 90), stuck: s(r.stuck, 90), rhythm: s(r.rhythm, 60), promises: s(r.promises, 60) } : null, check: () => [] },
    memUser: { v: 1, tier: 'quick', fmt: 'json', norm: r => r && typeof r === 'object' ? { habits: s(r.habits, 70), returns: s(r.returns, 70), likes: s(r.likes, 70) } : null, check: () => [] },
    nudge: { v: 1, tier: 'quick', fmt: 'json', norm: r => r && r.due ? { due: s(r.due, 40), drowsy: s(r.drowsy, 40), sleep: s(r.sleep, 40) } : null, check: o => [o.due, o.drowsy, o.sleep] },
  };

  const WHY = { clingy: '不能表现出想念、依恋或离不开主人', suffer: '你不会饿、不会难过、不会孤单', guilt: '不能提主人多久没来、不能让主人内疚', flatter: '不能吹捧', long: '太长了' };
  function retryInput(input, raw, why) {
    const said = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const fix = '你上一次的回复不符合要求（' + why + '），按原来的规则重写，只回复要求的内容。';
    if (Array.isArray(input)) return input.concat([{ role: 'assistant', content: said }, { role: 'user', content: fix }]);
    return input + '\n\n（你上一次回复的是：' + said.slice(0, 400) + '）\n' + fix;
  }

  /* ---------- 一次调用：装配 → 调用 → 整理 → 红线后检（不过就重试一次）→ 记追踪 ---------- */
  const Brain = {
    Prompts,
    async run(id, data, opt) {
      opt = opt || {}; const p = Prompts[id];
      if (!p || !AI.on || Config.promptOff(id)) return { out: null, err: '', tr: '' };
      const built = opt.messages || L().P[id](data);
      let input = built, out = null, err = '', tries = 0; const t0 = Date.now(), rec = { p: id, v: p.v, src: AI.src, model: AI.cfg ? (p.tier === 'quick' && AI.cfg.quick) || AI.cfg.model : 'host', guard: [] };
      for (; tries < 2 && !out; tries++) {
        let raw;
        try { raw = p.fmt === 'json' ? await AI.json(input, p.tier, opt.max) : await AI.text(input, p.tier, opt.max); }
        catch (e) {
          rec.err = (e && e.code) || 'other';
          if (tries === 0 && ['invalid_json', 'bad_response', 'timeout', 'upstream'].includes(rec.err)) continue;
          err = AI.message(e); break;
        }
        const n = p.norm(raw);
        if (!n) { rec.err = 'format'; input = retryInput(built, raw, '格式不对'); continue; }
        const bad = [...new Set(p.check(n).flatMap(x => Guard.checkOut(x).bad))];
        if (bad.length) { rec.guard.push(...bad); input = retryInput(built, raw, bad.map(b => WHY[b] || b).join('；')); continue; }
        out = n; delete rec.err;
      }
      rec.ms = Date.now() - t0; rec.ok = !!out; rec.retry = tries > 1;
      const tr = Trace.add(rec);
      return { out, err, tr };
    },
  };

  A.AI = AI; A.Brain = Brain;
})(window);
