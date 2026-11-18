/* 记忆、主动提醒、工具。都依赖存档 S，由 app.js 通过 Agent.bind 注入 S、语言表、当前时间。
 *
 * 记忆分三层：最近 5 条日记原文（工作记忆，现成）、目标档案、你这个人。
 * 档案存在 S.mem 里，随存档走；用户能在「它记得」里查看、修改、删除。用户改过的字段模型不再覆盖，删掉的内容告诉模型别再写回。 */
(function (root) {
  const A = root.Agent, { Brain, AI, Config, Events, Platform, Rhythm } = A;
  const S = () => A.ctxS(), L = () => A.ctxL(), now = () => A.ctxNow();
  A.bindState = o => { A.ctxS = o.S; A.ctxL = o.L; A.ctxNow = o.now; };
  const clip = (x, n) => String(x || '').replace(/\s+/g, ' ').trim().slice(0, n);

  const GOAL_FIELDS = ['progress', 'stuck', 'rhythm', 'promises'], USER_FIELDS = ['habits', 'returns', 'likes'];
  const Memory = {
    GOAL_FIELDS, USER_FIELDS,
    all() { const s = S(); s.mem = s.mem || { goals: {}, user: null }; s.mem.goals = s.mem.goals || {}; return s.mem; },
    goal(id) { return this.all().goals[id] || null; },
    user() { return this.all().user; },
    // 给提示词用的一段文字；没有就返回空串
    text(g) {
      const L0 = L(), m = g && this.goal(g.id), u = this.user(), lines = [];
      if (m) for (const k of GOAL_FIELDS) if (m[k]) lines.push('- ' + L0.memLabels[k] + '：' + m[k]);
      if (u) for (const k of USER_FIELDS) if (u[k]) lines.push('- ' + L0.memLabels[k] + '：' + u[k]);
      return lines.join('\n');
    },
    // 没有模型时的规则版：至少记住到哪了、约了什么
    ruleUpdate(g) {
      const s = S(), m = this.all().goals[g.id] = this.all().goals[g.id] || { edited: {}, forgot: [] };
      const last = s.logs.filter(l => l.goalId === g.id).slice(-1)[0];
      if (last && !m.edited.progress) m.progress = clip(L().memRule.progress + last.text, 90);
      if (!m.edited.promises) m.promises = g.promise.text ? clip(L().memRule.promises + g.promise.text, 60) : m.promises || '';
      m.at = now(); m.src = m.src === 'model' ? 'model' : 'rule';
    },
    busy: false,
    async updateGoal(g) {
      if (!g || this.busy) return false;
      this.ruleUpdate(g);
      if (!Config.flag('memory') || !AI.on) return false;
      const s = S(), m = this.goal(g.id), logs = s.logs.filter(l => l.goalId === g.id).slice(-5);
      this.busy = true;
      try {
        const r = await Brain.run('memGoal', { g, cur: m, logs: logs.map(l => ({ date: L().date(l.at), text: l.text, q: l.q, a: l.a, next: l.next })), forgot: m.forgot || [], edited: m.edited || {} });
        if (r.out && S().mem.goals[g.id] === m) {
          for (const k of GOAL_FIELDS) if (!m.edited[k] && r.out[k] != null && !(m.forgot || []).some(f => f && r.out[k].includes(f))) m[k] = r.out[k];
          m.at = now(); m.src = 'model'; m.n = (m.n || 0) + 1; return true;
        }
      } finally { this.busy = false; }
      return false;
    },
    async updateUser(archive) {
      const mem = this.all(), u = mem.user || { edited: {}, forgot: [] };
      if (!Config.flag('memory') || !AI.on) return false;
      const gm = this.goal(archive.id);
      const r = await Brain.run('memUser', { cur: u, goal: { title: archive.title, result: archive.result, days: Math.round((archive.endedAt - archive.createdAt) / 864e5), adv: archive.adv }, profile: gm, forgot: u.forgot || [], edited: u.edited || {} });
      if (!r.out) return false;
      for (const k of USER_FIELDS) if (!u.edited[k] && r.out[k] != null) u[k] = r.out[k];
      u.at = now(); mem.user = u; return true;
    },
    edit(scope, id, field, value) {
      const mem = this.all(), m = scope === 'user' ? (mem.user = mem.user || { edited: {}, forgot: [] }) : (mem.goals[id] = mem.goals[id] || { edited: {}, forgot: [] });
      const old = m[field] || ''; value = clip(value, 120);
      if (!value && old) { m.forgot = (m.forgot || []).concat([old]).slice(-20); m.edited[field] = false; }
      else m.edited[field] = true;
      m[field] = value;
    },
    clear() { const s = S(); s.mem = { goals: {}, user: null }; },
    // 睡眠时整理：打开应用时，如果档案比最新日记旧，就补一次
    async sleepTime() {
      const s = S(), g = s.goal; if (!g) return;
      const m = this.goal(g.id), last = s.logs.filter(l => l.goalId === g.id).slice(-1)[0];
      if (last && (!m || (m.at || 0) < last.at) && now() - last.at > 60e3) return this.updateGoal(g);
    },
  };

  /* ---------- 主动提醒：排程、文案、点开 ---------- */
  const IDS = [1001, 1002, 1003, 1004], TIMER_ID = 2001;
  const Nudge = {
    st() { const s = S(); s.agent = s.agent || {}; const n = s.agent.nudge = s.agent.nudge || {}; if (n.on == null) n.on = false; n.quiet = n.quiet || [22, 9]; n.sent = n.sent || []; n.queue = n.queue || []; n.texts = n.texts || {}; return n; },
    get available() { return Platform.notify.available(); },
    // 应用打开或回到前台：排好的、时间已过的算发出去了；记一次「打开」
    onOpen() {
      const n = this.st(), t = now(), s = S();
      const done = n.queue.filter(q => q.at <= t); for (const q of done) { n.sent.push({ at: q.at, kind: q.kind }); Events.add(s, 'nudge.sent', q.at, { kind: q.kind }); }
      n.queue = n.queue.filter(q => q.at > t); n.sent = n.sent.slice(-30);
      s.agent.lastActive = t; Events.add(s, 'open', t);
      return this.sync();
    },
    plan() {
      const s = S(), g = s.goal, n = this.st(); if (!g || !n.on || !Config.flag('nudges')) return [];
      return Rhythm.plan({ now: now(), tz: new Date().getTimezoneOffset(), goal: { promiseText: g.promise.text, promiseAt: g.promise.at, awakeUntil: g.awakeUntil, lastAdvAt: g.lastAdvAt, createdAt: g.createdAt },
        settings: { on: n.on, quiet: n.quiet, dueOnly: !!n.dueOnly }, reports: s.logs.filter(l => l.goalId === g.id).slice(-10).map(l => l.at), lastActive: s.agent.lastActive || 0, sent: n.sent });
    },
    textFor(kind) {
      const s = S(), g = s.goal, n = this.st(), pre = n.texts[g.id];
      if (pre && pre.promise === g.promise.text && pre[kind]) return pre[kind];
      const T = L().nudgeTpl[g.style] || L().nudgeTpl.curious;
      return T[kind].replace('{name}', g.name).replace('{promise}', clip(g.promise.text || L().nudgeNoPromise, 30));
    },
    async sync() {
      const n = this.st(), plan = this.plan(), s = S();
      n.queue = plan.map((p, i) => ({ id: IDS[i], at: p.at, kind: p.kind }));
      if (!this.available) return n.queue;
      // 时间偏移（试玩工具「过 N 天」）只影响应用内的时间；系统通知按真实时钟排，所以减掉偏移
      const off = s.offset || 0;
      await Platform.notify.cancel(IDS);
      if (n.on && n.queue.length && (await Platform.notify.permission()) === 'granted')
        await Platform.notify.schedule(n.queue.filter(q => q.at - off > Date.now()).map(q => ({ id: q.id, at: q.at - off, title: s.goal.name, body: this.textFor(q.kind), extra: { kind: q.kind, goal: s.goal.id } })));
      return n.queue;
    },
    async enable(on) {
      const n = this.st();
      if (on && this.available) {
        let p = await Platform.notify.permission(); if (p !== 'granted') p = await Platform.notify.request();
        if (p !== 'granted') { n.on = false; n.denied = true; await this.sync(); return 'denied'; }
        await Platform.notify.channel('nudge', L().nudgeChannel, L().nudgeChannelDesc);
      }
      n.on = !!on; n.denied = false; await this.sync();
      if (n.on && S().goal) this.prepare(S().goal, Memory.text(S().goal)).catch(() => {});
      return n.on ? 'on' : 'off';
    },
    // 讲述之后，顺手把接下来几条提醒的文案写好（过红线；不行就用模板）
    async prepare(g, memText) {
      const n = this.st(); if (!g || !n.on || !AI.on) return;
      const r = await Brain.run('nudge', { g, mem: memText });
      if (r.out && S().goal === g) { n.texts = { [g.id]: Object.assign({ promise: g.promise.text, at: now() }, r.out) }; await this.sync(); }
    },
  };

  /* ---------- 工具：陪你做 10 分钟、加进日历 ---------- */
  const Tools = {
    TIMER_ID,
    timer() { const s = S(); return s.agent && s.agent.timer && s.goal && s.agent.timer.g === s.goal.id ? s.agent.timer : null; },
    async startTimer(min) {
      const s = S(); s.agent = s.agent || {}; const t = { g: s.goal.id, start: now(), dur: (min || 10) * 60e3 };
      s.agent.timer = t; Events.add(s, 'timer.start', t.start, { min: min || 10 });
      if (Platform.notify.available() && (await Platform.notify.permission()) === 'granted')
        await Platform.notify.schedule([{ id: TIMER_ID, at: Date.now() + t.dur, title: s.goal.name, body: L().timerDoneNote, channel: 'nudge', extra: { kind: 'timer', goal: s.goal.id } }]);
      return t;
    },
    async stopTimer(done) {
      const s = S(), t = this.timer(); if (!t) return; s.agent.timer = null;
      Events.add(s, done ? 'timer.done' : 'timer.stop', now(), { min: Math.round((now() - t.start) / 60e3) });
      await Platform.notify.cancel([TIMER_ID]);
    },
    left() { const t = this.timer(); return t ? Math.max(0, t.start + t.dur - now()) : 0; },
    async calendar(g, hour) {
      // 默认排在明天你平时做事的钟点，半小时
      const d = new Date(Date.now() + 864e5); d.setHours(hour, 0, 0, 0);
      const r = await Platform.calendar.add({ title: g.name + '：' + clip(g.promise.text, 40), notes: L().calNotes.replace('{title}', g.title), begin: d.getTime(), end: d.getTime() + 30 * 60e3 });
      Events.add(S(), 'calendar', now()); return r;
    },
  };

  A.Memory = Memory; A.Nudge = Nudge; A.Tools = Tools;
})(window);
