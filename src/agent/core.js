/* Agent 基建：平台适配、远程配置、事件日志、调用追踪。
 * 浏览器脚本，由 build.py 内联进 dist/index.html。挂在 window.Agent 上。 */
(function (root) {
  const A = root.Agent = root.Agent || {};
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* 忽略 */ } },
  };
  A.LS = LS;
  const uid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

  /* ---------- 平台：网页 / 安卓（Capacitor）/ 桌面（Electron） ---------- */
  const cap = root.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const has = name => native && (cap.isPluginAvailable ? cap.isPluginAvailable(name) : !!(cap.Plugins && cap.Plugins[name]));
  const plugin = name => !has(name) ? null : cap.registerPlugin ? cap.registerPlugin(name) : cap.Plugins[name];
  const Platform = {
    kind: native ? (cap.getPlatform ? cap.getPlatform() : 'android') : root.YangyizhiDesktop ? 'desktop' : 'web',
    native,
    deviceId() { let d = LS.get('yangyizhi.did'); if (!d) { d = uid(); LS.set('yangyizhi.did', d); A.Persist && A.Persist.mirror('yangyizhi.did', JSON.stringify(d)); } return d; },
    resetDeviceId() { LS.del('yangyizhi.did'); A.Persist && A.Persist.remove('yangyizhi.did'); },
    onResume(cb) { document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cb(); }); },
    notify: {
      get ln() { return plugin('LocalNotifications'); },
      available() { return !!this.ln; },
      async permission() { try { const r = await this.ln.checkPermissions(); return r.display; } catch (e) { return 'denied'; } },
      async request() { try { const r = await this.ln.requestPermissions(); return r.display; } catch (e) { return 'denied'; } },
      async channel(id, name, desc) { try { await this.ln.createChannel({ id, name, description: desc || '', importance: 3, visibility: 1 }); } catch (e) { /* 旧系统没有渠道 */ } },
      async schedule(items) {
        if (!items.length) return;
        await this.ln.schedule({ notifications: items.map(i => ({ id: i.id, title: i.title, body: i.body, largeBody: i.body, channelId: i.channel || 'nudge', schedule: { at: new Date(i.at), allowWhileIdle: true }, extra: i.extra || {}, autoCancel: true })) });
      },
      async cancel(ids) { try { await this.ln.cancel({ notifications: ids.map(id => ({ id })) }); } catch (e) { /* 没排过 */ } },
      onTap(cb) { const ln = this.ln; if (ln) ln.addListener('localNotificationActionPerformed', e => cb((e && e.notification && e.notification.extra) || {})); },
    },
    calendar: {
      // 安卓：调起系统日历的新建事件页（不需要日历权限）；其他平台：下载 .ics
      async add(ev) {
        const p = plugin('YangyizhiCalendar');
        if (p) { await p.insert({ title: ev.title, notes: ev.notes || '', begin: ev.begin, end: ev.end }); return 'native'; }
        const z = t => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        const escI = s => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
        const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//yangyizhi//CN', 'BEGIN:VEVENT', 'UID:' + uid() + '@yangyizhi', 'DTSTAMP:' + z(Date.now()), 'DTSTART:' + z(ev.begin), 'DTEND:' + z(ev.end), 'SUMMARY:' + escI(ev.title), 'DESCRIPTION:' + escI(ev.notes), 'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', 'DESCRIPTION:' + escI(ev.title), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'yangyizhi.ics'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        return 'ics';
      },
    },
  };
  A.Platform = Platform;

  /* ---------- 原生持久化：把存档镜像到安卓 SharedPreferences ----------
   * localStorage 在系统清理 WebView 数据时可能丢。原生壳里每次写入同时镜像一份到 Capacitor Preferences，
   * 启动时本地没有存档、而原生有，就恢复回来。网页和桌面端没有这个插件，什么也不做。 */
  const Persist = {
    KEYS: ['yangyizhi.save.v2', 'yangyizhi.llm.v1', 'yangyizhi.did'],
    get p() { return plugin('Preferences'); },
    available() { return !!this.p; },
    mirror(key, value) { const p = this.p; if (!p || this.KEYS.indexOf(key) < 0) return; try { Promise.resolve(p.set({ key, value })).catch(() => {}); } catch (e) { /* 忽略 */ } },
    remove(key) { const p = this.p; if (!p) return; try { Promise.resolve(p.remove({ key })).catch(() => {}); } catch (e) { /* 忽略 */ } },
    // 只补缺：本地已有的键不动。返回是否恢复了存档
    async restore() {
      const p = this.p; if (!p) return false; let got = false;
      for (const key of this.KEYS) {
        try {
          if (localStorage.getItem(key) != null) continue;
          const r = await p.get({ key }); if (r && r.value != null) { localStorage.setItem(key, r.value); if (key === this.KEYS[0]) got = true; }
        } catch (e) { /* 读不到就当没有 */ }
      }
      return got;
    },
  };
  A.Persist = Persist;

  /* ---------- 远程配置：功能开关、官方模型、上报地址、额度、公示信息 ----------
   * 先用内置默认值，再读随包发布的 config.json，再读其中 remote 指向的远程配置（缓存 6 小时）。
   * 远程配置只能改下面这些键，改不了代码。 */
  const DEFAULTS = {
    flags: { chat: true, memory: true, nudges: true, tools: true, feedback: true, officialModel: true },
    disabledPrompts: [],                    // 某个提示词出问题时，远程把它关掉，退回预写台词
    official: null,                         // { label, base, model, quick, daily }：官方模型网关
    traceUrl: '',                           // 调用追踪和反馈的上报地址（POST JSON）
    filing: '',                             // 公示：所用模型及备案号
    limits: { chatDaily: 30, chatOnlyDays: 3, useMinutes: 60, minorMinutes: 40 },
    remote: '',
  };
  const merge = (a, b) => { const o = Object.assign({}, a); for (const k in b || {}) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' ? merge(a[k], b[k]) : b[k]; return o; };
  const Config = {
    data: DEFAULTS, src: 'default',
    async load() {
      const cached = LS.get('yangyizhi.config.v1');
      if (location.protocol !== 'file:') try { const r = await fetch('config.json', { cache: 'no-cache' }); if (r.ok) { this.data = merge(DEFAULTS, await r.json()); this.src = 'bundled'; } } catch (e) { /* 没有就用默认 */ }
      if (cached && cached.data) { this.data = merge(this.data, cached.data); this.src = 'remote-cache'; }
      const url = this.data.remote;
      if (url && /^https:\/\//.test(url) && (!cached || Date.now() - cached.at > 6 * 36e5)) {
        try {
          const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 5000);
          const r = await fetch(url, { cache: 'no-cache', signal: ctl.signal }); clearTimeout(tm);
          if (r.ok) { const d = await r.json(); LS.set('yangyizhi.config.v1', { at: Date.now(), data: d }); this.data = merge(this.data, d); this.src = 'remote'; }
        } catch (e) { /* 离线照常用 */ }
      }
      return this.data;
    },
    flag(k) { return !!(this.data.flags && this.data.flags[k]); },
    get(k) { return this.data[k]; },
    promptOff(id) { return (this.data.disabledPrompts || []).includes(id); },
  };
  A.Config = Config;

  /* ---------- 事件日志：只追加，记忆、节奏、诊断都从这里读 ----------
   * 存在存档 S.events 里。不记用户原话（原话在 S.logs），只记发生了什么。 */
  const Events = {
    MAX: 2000,
    add(S, t, at, d) { S.events = S.events || []; const e = { t, at }; if (S.goal && !(d && 'g' in d)) e.g = S.goal.id; if (d) Object.assign(e, d); S.events.push(e); if (S.events.length > this.MAX) S.events = S.events.slice(-this.MAX); return e; },
    since(S, at, t) { return (S.events || []).filter(e => e.at >= at && (!t || e.t === t)); },
    last(S, t) { const ev = S.events || []; for (let i = ev.length - 1; i >= 0; i--) if (ev[i].t === t) return ev[i]; return null; },
    migrate(S) {                                                                   // 旧存档：从日记补出事件
      if (S.events) return false;
      S.events = [];
      for (const l of S.logs || []) {
        S.events.push({ t: 'report', at: l.at, g: l.goalId });
        if (l.a) S.events.push({ t: 'answer', at: l.at + 1, g: l.goalId });
        if (l.next) S.events.push({ t: 'promise', at: l.at + 2, g: l.goalId });
      }
      return true;
    },
  };
  A.Events = Events;

  /* ---------- 调用追踪：每次模型调用一条，不含用户原话 ---------- */
  const TKEY = 'yangyizhi.trace.v1';
  const Trace = {
    list() { return LS.get(TKEY, []); },
    add(rec) {
      const all = this.list(); rec.id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); rec.at = Date.now();
      all.push(rec); LS.set(TKEY, all.slice(-300)); this.soon(); return rec.id;
    },
    feedback(id, reason, text) {
      const all = this.list(), r = all.find(x => x.id === id); if (r) { r.fb = reason; r.fbText = String(text || '').slice(0, 300); r.up = false; LS.set(TKEY, all); }
      this.soon();
    },
    clear() { LS.del(TKEY); },
    timer: 0,
    soon() { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 20000); },
    async flush() {
      const url = Config.get('traceUrl'); if (!url || !/^https:\/\//.test(url)) return;
      const all = this.list(), todo = all.filter(r => !r.up).slice(-100); if (!todo.length) return;
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device: Platform.deviceId(), app: Platform.kind, items: todo }) });
        if (r.ok) { const ids = new Set(todo.map(x => x.id)); const cur = this.list(); for (const x of cur) if (ids.has(x.id)) x.up = true; LS.set(TKEY, cur); }
      } catch (e) { /* 下次再传 */ }
    },
    stats(sinceMs) {
      const all = this.list().filter(r => r.at >= sinceMs); const n = all.length || 1;
      const by = {}; for (const r of all) for (const b of r.guard || []) by[b] = (by[b] || 0) + 1;
      return { calls: all.length, ok: all.filter(r => r.ok).length / n, retry: all.filter(r => r.retry).length, fallback: all.filter(r => !r.ok).length, ms: Math.round(all.filter(r => r.ok).reduce((s, r) => s + r.ms, 0) / (all.filter(r => r.ok).length || 1)), guard: by, fb: all.filter(r => r.fb).length };
    },
  };
  A.Trace = Trace;
})(window);
