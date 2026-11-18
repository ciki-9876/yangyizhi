/* 养一只 · 界面（第三版：它是活的）
 * 主界面只有三样东西：它、它说的话、一个主按钮。
 * 这一版的重心是质感：它会看着你、说话有声音、你讲的事会变成一颗光点飞进它嘴里、每个关键时刻都有一段演出。
 * 可替换的三块收在适配器里：Store（存档放哪）、AI（它的脑子）、LANGS（什么语言）。
 */
(function () {
  'use strict';
  const P = window.Pet, C = window.Critter, Sfx = window.Sfx, Fx = window.Fx, DAY = P.DAY, KEY = 'yangyizhi.save.v2';
  const nativeUpdateBridge = window.Capacitor?.registerPlugin ? window.Capacitor.registerPlugin('YangyizhiUpdates') : window.Capacitor?.Plugins?.YangyizhiUpdates;
  const Cloud = window.YangyizhiCloud;
  let S = P.create();
  const ui = { looking: false, draft: null, thread: [], from: 0, shown: 0, step: 'idle', busy: false, lastLog: null, promiseLog: null, askQ: '', suggest: '', woke: false, justWoke: false, mood: '', moodT: 0, chat: [], chatN: 0, greetedFor: '', newItems: 0, dropN: 0, freshPart: '', pokes: [], lock: false, cloudMode: 'login', cloudMessage: '', cloudPending: null };
  const $ = id => document.getElementById(id);
  const L = () => window.LANGS[S.lang] || window.LANGS.zh;
  const t = (k, v) => { let s = L()[k]; if (v) for (const x in v) s = s.split('{' + x + '}').join(v[x]); return s; };
  const fill = (s, v) => { for (const x in v) s = s.split('{' + x + '}').join(v[x]); return s; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => Date.now() + (S.offset || 0);
  const tz = () => new Date().getTimezoneOffset();
  const clone = o => JSON.parse(JSON.stringify(o));
  const mulStr = m => (Math.round(m * 10) / 10).toString();
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let x = Math.imul(a ^ a >>> 15, 1 | a); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }

  /* ---------- 存档：账号云端优先，浏览器兜底 ---------- */
  const Store = {
    ref: null, kind: 'none', timer: 0, writing: false, pending: false, cloudUser: null, cloudRevision: 0, cloudError: '', cloudQueue: Promise.resolve(),
    localKey(userId = this.cloudUser?.id) { return userId ? KEY + '.user.' + userId : KEY; },
    loadLocal(userId = null) { try { const r = localStorage.getItem(this.localKey(userId)); return r ? JSON.parse(r) : null; } catch (e) { return null; } },
    saveLocal() {
      try { const j = JSON.stringify(S), key = this.localKey(); localStorage.setItem(key, j); if (!this.cloudUser) localStorage.setItem(KEY, j); window.Agent.Persist.mirror(KEY, j); if (this.kind === 'none') this.kind = 'local'; } catch (e) { /* 存不了就只在内存里 */ }
    },
    hasData(value) { return !!(value && (value.goal || value.logs?.length || value.habitat?.length)); },
    async accountData(user, { importAnonymous = false } = {}) {
      this.cloudUser = user; this.kind = 'cloud'; this.cloudError = '';
      const local = this.loadLocal(user.id) || (importAnonymous ? this.loadLocal(null) : null);
      const remote = await Cloud.loadWorkspace(); this.cloudRevision = remote.revision;
      if (remote.state && local && JSON.stringify(remote.state) !== JSON.stringify(local)) {
        this.pendingSync = { user, local: clone(local), remote: clone(remote.state), revision: remote.revision };
        return 'conflict';
      }
      if (remote.state) { adopt(remote.state); this.saveLocal(); return 'cloud'; }
      if (local && this.hasData(local)) {
        adopt(local); const result = await Cloud.saveWorkspace(user.id, clone(S), remote.revision); this.cloudRevision = result.revision; this.saveLocal(); return 'uploaded';
      }
      return 'empty';
    },
    async connect() {
      if (Cloud && Cloud.isConfigured()) {
        try {
          const { user } = await Cloud.account(); const result = await this.accountData(user);
          if (result === 'conflict') { ui.cloudPending = this.pendingSync; }
          if (result !== 'empty') return null; // accountData adopted remote/local as needed
        } catch (error) { if (![401, 404].includes(error.status)) this.cloudError = error.message; }
      }
      try {
        if (!window.claude || !window.claude.use) return null;
        const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
        if (!db || !user) return null;
        const uid = await user.id(); if (!uid) return null;
        const ref = db.doc('data/users/' + uid + '/pet');
        const snap = await Promise.race([ref.get(), new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout' }), 8000))]);
        this.ref = ref; if (!this.cloudUser) this.kind = 'cloud';
        return snap.exists ? clone(snap.data()) : null;
      } catch (e) { this.ref = null; return null; }
    },
    save() {
      S.rev = (S.rev || 0) + 1; S.savedAt = Date.now();
      if (S.logs.length > 400) S.logs = S.logs.slice(-400);
      this.saveLocal();
      if (this.ref) { this.pending = true; clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 700); }
      if (this.cloudUser && !this.pendingSync) { clearTimeout(this.timer); this.timer = setTimeout(() => this.flushCloud(), 700); }
    },
    async flush() {
      if (this.writing || !this.ref) return; this.writing = true;
      try { while (this.pending) { this.pending = false; await this.ref.set(clone(S)); } }
      catch (e) { if (!e || e.code !== 'unavailable') { this.ref = null; if (!this.cloudUser && this.kind === 'cloud') this.kind = 'local'; } }
      this.writing = false;
    },
    flushCloud() {
      if (!this.cloudUser || this.pendingSync) return;
      const user = this.cloudUser;
      this.cloudQueue = this.cloudQueue.then(async () => {
        if (this.cloudUser !== user || this.pendingSync) return;
        const snapshot = clone(S), expected = this.cloudRevision;
        try { const result = await Cloud.saveWorkspace(user.id, snapshot, expected); if (this.cloudUser === user) { this.cloudRevision = result.revision; this.cloudError = ''; this.saveLocal(); } }
        catch (error) {
          this.cloudError = error.message;
          if (error.status === 409 && this.cloudUser === user) {
            try { const remote = await Cloud.loadWorkspace(); this.pendingSync = { user, local: clone(S), remote: clone(remote.state), revision: remote.revision }; ui.cloudPending = this.pendingSync; }
            catch (_) { /* 离线时保留本机存档，稍后重试 */ }
          }
        }
      }).catch(error => { this.cloudError = error.message; });
    },
    async login(mode, username, password) {
      if (!Cloud?.isConfigured()) throw new Error('云同步服务尚未配置。');
      const { user } = await Cloud.authenticate(mode, { username, password });
      const result = await this.accountData(user, { importAnonymous: true });
      return this.pendingSync ? 'conflict' : result;
    },
    async resolveCloudConflict(choice) {
      const pending = this.pendingSync; if (!pending || pending.user !== this.cloudUser) return;
      if (choice === 'cloud') {
        adopt(pending.remote || P.create()); this.cloudRevision = pending.revision; this.saveLocal();
      } else {
        const result = await Cloud.saveWorkspace(pending.user.id, pending.local, pending.revision);
        adopt(pending.local); this.cloudRevision = result.revision; this.saveLocal();
      }
      this.pendingSync = null; ui.cloudPending = null; ui.cloudMessage = ''; closeSheet(); render();
    },
    async logout() {
      const user = this.cloudUser; if (!user) return;
      this.saveLocal();
      clearTimeout(this.timer); this.flushCloud(); await this.cloudQueue;
      if (this.pendingSync) throw new Error('本机与云端存档尚有冲突，请先选择要保留的版本。');
      await Cloud.logout(); this.cloudUser = null; this.cloudRevision = 0; this.kind = 'local'; this.pendingSync = null;
      const local = this.loadLocal(null); adopt(local?.v === 2 ? local : P.create()); this.saveLocal();
    },
    async deleteAccount(password) {
      const user = this.cloudUser; if (!user) return;
      this.flushCloud(); await this.cloudQueue;
      if (this.pendingSync) throw new Error('本机与云端存档尚有冲突，请先选择要保留的版本。');
      await Cloud.deleteAccount(password);
      try { localStorage.removeItem(this.localKey(user.id)); } catch (_) {}
      this.cloudUser = null; this.cloudRevision = 0; this.pendingSync = null; this.kind = 'local';
      window.Agent.Persist.remove(KEY); adopt(P.create()); this.saveLocal();
    },
  };

  /* ---------- Agent 基建（src/agent/）：脑子、记忆、提醒、工具、事件、追踪、配置 ---------- */
  const { AI, Brain, Memory, Nudge, Tools, Events, Trace, Config, Guard, Platform } = window.Agent;
  window.Agent.bind({ L: () => L() });
  window.Agent.bindState({ S: () => S, L: () => L(), now: () => now() });
  const ev = (type, d) => Events.add(S, type, now(), d);
  const memText = g => Memory.text(g);
  const lastLogs = g => forPrompt(goalLogs(g).slice(-5));
  const dayNow = () => P.dayKey(now(), tz());
  const minorNight = () => S.agent && S.agent.minor && (hour() >= 22 || hour() < 6);

  /* ---------- 小工具 ---------- */
  let toastT = 0;
  function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 3600); }
  function openSheet(html, focusId) { const w = $('sheet'); w.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + '</div>'; w.hidden = false; const f = focusId && $(focusId); if (f) setTimeout(() => f.focus(), 30); }
  function closeSheet() { const w = $('sheet'); w.hidden = true; w.innerHTML = ''; }
  const sheetOpen = () => !$('sheet').hidden;
  const curMile = g => g.miles[g.cur];
  const goalLogs = (g, stage) => S.logs.filter(l => l.goalId === g.id && (stage == null || l.stage === stage));
  const forPrompt = logs => logs.map(l => ({ date: L().date(l.at), text: l.text, q: l.q, a: l.a, next: l.next }));
  const awayDays = g => (now() - (g.lastAdvAt || g.createdAt)) / DAY;
  const hour = () => new Date(now()).getHours();
  const phase = () => C.phaseOf(hour());
  function say(k, style) {
    const T = L().say[style || (S.goal ? S.goal.style : 'curious')]; let v = T[k];
    if (k === 'hello') { const h = hour(); if (h >= 5 && h < 10 && Math.random() < 0.6) v = T.helloAM; else if ((h >= 23 || h < 5) && Math.random() < 0.7) v = T.helloLate; }
    return Array.isArray(v) ? pick(v) : v;
  }
  function itemId(g, i) { const list = C.ITEMS.slice(), r = rng(g.createdAt % 2147483647); for (let k = list.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [list[k], list[j]] = [list[j], list[k]]; } return list[i % list.length]; }
  const itemName = id => L().trinkets[id] || id;
  function guessKind(title) { const w = L().kindWords; for (const k of ['read', 'learn', 'body', 'make']) if (w[k].test(title)) return k; return 'make'; }
  const voiceOf = g => 470 + ((g.shape * 3 + g.hue * 2) % 7) * 48;                    // 每只伙伴说话的音高不一样
  const sizeOf = text => text.length < 12 ? 's' : text.length > 40 ? 'l' : 'm';      // 只用来决定它长出什么，不影响成长多少
  const tipOnce = k => { S.tips = S.tips || {}; if (S.tips[k]) return false; S.tips[k] = 1; return true; };
  const stageBox = (look, moodName, o) => '<div class="stage ' + (o.phase || 'day') + ' ' + (o.cls || '') + '">' + C.scene(o.phase || 'day', look.hue, null, { noNest: true }) + '<div class="actor">' + C.critter(look, moodName, { fresh: o.fresh }) + '</div></div>';

  /* ---------- 它的身体：表情、动作、眼神 ---------- */
  const svgEl = () => { const a = $('actor'); return a && a.firstElementChild; };
  function mood() { const g = S.goal; if (ui.mood) return ui.mood; if (!P.isAwake(g, now()) && !ui.woke) return 'sleep'; if (ui.busy) return 'think'; return ui.step === 'answer' ? 'ask' : 'awake'; }
  function setMood() { const s = svgEl(); if (s && S.goal) { s.dataset.mood = mood(); if (ui.busy) setLook(3, -3.5); } }
  function flash(m, ms) { ui.mood = m; clearTimeout(ui.moodT); ui.moodT = setTimeout(() => { ui.mood = ''; setMood(); }, ms || 2200); setMood(); }
  const animT = {};
  function anim(cls, ms) { const s = svgEl(); if (!s) return; s.classList.remove(cls); void s.getBoundingClientRect(); s.classList.add(cls); clearTimeout(animT[cls]); animT[cls] = setTimeout(() => { const x = svgEl(); if (x) x.classList.remove(cls); }, ms); }
  function setLook(x, y) { const s = svgEl(); if (s) { s.style.setProperty('--px', x.toFixed(1)); s.style.setProperty('--py', y.toFixed(1)); } }
  let lastPtr = 0, aimRaf = 0;
  function aim(cx, cy) { const a = $('actor'); if (!a || ui.busy) return; const r = a.getBoundingClientRect(), dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height * 0.45), d = Math.hypot(dx, dy) || 1, m = Math.min(1, d / 140) * 4.2; setLook(dx / d * m, dy / d * m * 0.8); }
  document.addEventListener('pointermove', e => { lastPtr = Date.now(); if (!aimRaf) aimRaf = requestAnimationFrame(() => { aimRaf = 0; aim(e.clientX, e.clientY); }); }, { passive: true });
  setInterval(() => {                                                                 // 没人动鼠标的时候，它自己东看看西看看；你在打字，它就看着输入框
    if (Date.now() - lastPtr < 2500 || ui.busy || !svgEl()) return;
    const f = document.activeElement; if (f && f.tagName === 'INPUT' && f.closest('#f-talk')) { const r = f.getBoundingClientRect(); aim(r.left + r.width * 0.3, r.top); return; }
    if (Math.random() < 0.5) setLook((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 3); else setLook(0, 0);
  }, 2300);
  const talkOn = v => { const s = svgEl() || ($('ob-pet') && $('ob-pet').firstElementChild); if (s) s.classList.toggle('talking', v); };
  const mouth = () => { const r = $('actor').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.6]; };

  /* ---------- 打字机：它的话一个字一个字出来，边说边嘟嘟 ---------- */
  let typeGen = 0, typing = [];
  function finishTyping() { typeGen++; for (const x of typing) { x.tx.textContent = x.full; if (x.rest) x.rest.textContent = ''; if (x.acts) x.acts.hidden = false; } typing = []; talkOn(false); }
  async function typeInto(tx, rest, full, pitch, style, gen) {
    for (let i = 1; i <= full.length; i++) {
      if (gen !== typeGen || !tx.isConnected) return false;
      tx.textContent = full.slice(0, i); if (rest) rest.textContent = full.slice(i);
      const ch = full[i - 1]; if (i % 2 === 1 && /\S/.test(ch)) Sfx.blip(pitch, style);
      await sleep('，。！？…：\n'.includes(ch) ? 120 : 30);
    }
    return true;
  }
  function typeNew() {
    const els = Array.from(document.querySelectorAll('#thread .msg.pet[data-full]')); if (!els.length) return;
    finishTyping(); const gen = ++typeGen, g = S.goal;
    typing = els.map(el => ({ el, full: el.dataset.full, tx: el.querySelector('.tx'), rest: el.querySelector('.rest'), acts: el.querySelector('.acts') }));
    for (const x of typing) { x.el.removeAttribute('data-full'); if (x.acts) x.acts.hidden = true; }
    $('live').textContent = typing.map(x => x.full).join(' ');
    if (reduce()) { finishTyping(); return; }
    (async () => {
      for (const x of typing.slice()) {
        talkOn(true); const ok = await typeInto(x.tx, x.rest, x.full, g ? voiceOf(g) : 600, g ? g.style : 'curious', gen); if (!ok) return;
        talkOn(false); if (x.acts) x.acts.hidden = false; await sleep(180); if (gen !== typeGen) return;
      }
      typing = [];
    })();
  }

  /* ---------- 对话 ---------- */
  const push = (kind, text, acts, tr) => { ui.thread.push({ t: kind, text, acts: acts || null, tr: tr || '' }); };
  function fresh() { ui.from = ui.thread.length; }                                   // 新的一轮对话：屏幕上只留这一轮
  function announceFound() {
    const g = S.goal; if (!g || !g.unseen) return;
    const n = g.unseen, names = []; for (let i = g.trinkets - n; i < g.trinkets; i++) names.push(itemName(itemId(g, i)));
    push('sys', t('sysFound', { name: esc(g.name), list: names.slice(-3).join('、') + (n > 3 ? ' ' + t('sysMore', { n }) : '') }));
    if (tipOnce('treasure')) push('pet', L().tips.treasure);
    ui.newItems = Math.min(24, ui.newItems + n); ui.dropN = Math.min(7, n); g.unseen = 0; Store.save(); Sfx.found();
  }
  function greet() {
    const g = S.goal; if (!g || ui.greetedFor === g.id) return; ui.greetedFor = g.id; fresh();
    P.tick(S, now());
    const away = awayDays(g), last = goalLogs(g).slice(-1)[0], m = P.litterMul(S, now());
    if (g.adv === 0 && tipOnce('intro')) {
      const T = L().tips; push('pet', fill(T.intro1, { name: g.name, title: g.title })); if (g.promise.text) push('pet', T.intro3);
      Store.save(); return;
    }
    if (away >= 2) {
      push('pet', say('back').replace('{d}', L().days(Math.floor(away))) + (last ? '\n' + say('backLast').replace('{x}', last.text.slice(0, 50)) : ''),
        [{ act: 'welcomeAI', label: t('welcomeAI'), ai: true }].concat(away >= 10 ? [{ act: 'release', label: t('rtRelease') }] : []));
      if (m > 1.05) push('sys', t('sysLitter', { m: mulStr(m) }));
    } else push('pet', say(ui.justWoke ? 'woke' : 'hello'));
    if (ui.justWoke && tipOnce('sleep')) push('pet', L().tips.sleep);
    ui.justWoke = false; announceFound(); Store.saveLocal();
  }

  /* ---------- 路由与导航 ---------- */
  function route() { const h = location.hash.replace('#', ''); return h === 'diary' || h === 'home' ? h : 'pet'; }
  function navHTML(v) {
    if (!S.goal && !S.habitat.length) return '';                                       // 第一次来：什么导航都不需要
    const link = (id, label) => '<a class="navlink" href="#' + id + '"' + (v === id ? ' aria-current="page"' : '') + '>' + label + '</a>';
    return (S.logs.length ? link('diary', t('navDiary')) : '') + (S.habitat.length ? link('home', t('navHome')) : '') + '<button type="button" class="navlink" data-act="settings" id="btn-settings">' + t('navSet') + '</button>';
  }
  function render() {
    finishTyping(); const v = route(); $('nav').innerHTML = navHTML(v);
    if (S.goal) { P.tick(S, now()); if (P.isAwake(S.goal, now()) || ui.woke) greet(); }
    $('view').innerHTML = v === 'diary' ? viewDiary() : v === 'home' ? viewHome() : S.goal ? viewPet() : viewOnboard();
    ui.dropN = 0; ui.freshPart = ''; afterThread();
  }
  function afterThread() { ui.shown = ui.thread.length; typeNew(); }

  /* ---------- 引导：一屏一问 ---------- */
  const newDraft = () => ({ step: 1, title: '', kind: 'make', miles: null, first: '', edit: false, cracks: 0, hatched: false, name: pick(L().names), style: 'curious', hue: Math.floor(Math.random() * C.HUES.length), shape: Math.floor(Math.random() * C.SHAPES), busy: false, err: '' });
  const draftLook = d => ({ name: d.name, shape: d.shape, hue: d.hue, stage: 0, level: 0, parts: [], patches: 0 });
  const eggStage = (d, cls, inner) => '<div class="stage eggstage ' + phase() + ' ' + (cls || '') + '">' + C.scene(phase(), d.hue, null, { noNest: true }) + inner + '</div>';
  function viewOnboard() {
    const d = ui.draft || (ui.draft = newDraft()), again = S.habitat.length > 0;
    const dots = '<div class="dots" aria-hidden="true">' + [1, 2, 3].map(i => '<i' + (i <= d.step ? ' class="on"' : '') + '></i>').join('') + '</div>';
    const eggCard = eggStage(d, '', '<div class="actor" id="egg">' + C.egg(d.hue, d.kind, 0) + '</div>');
    if (ui.looking) return '<div class="ob">' + eggCard + '<p class="note">' + t('obLooking') + '</p></div>';
    if (d.step === 1) return '<form class="ob" id="f-ob1" novalidate>' + dots + '<h1>' + t(again ? 'ob1Again' : 'ob1Title') + '</h1><p class="lead">' + t(again ? 'ob1AgainLead' : 'ob1Lead') + '</p>' + eggCard +
      '<div class="field"><label for="ob-title">' + t('ob1Q') + '</label><input type="text" id="ob-title" data-bind="title" maxlength="60" autocomplete="off" placeholder="' + esc(t('ob1Ph')) + '" value="' + esc(d.title) + '">' +
      '<div class="chips">' + L().ob1Ex.map(x => '<button type="button" class="chip" data-act="obEx" data-x="' + esc(x) + '">' + esc(x) + '</button>').join('') + '</div></div>' +
      (d.err ? '<p class="err">' + esc(d.err) + '</p>' : '') +
      '<button type="submit" class="btn primary cta"' + (d.busy ? ' disabled' : '') + '>' + t(d.busy ? 'ob1Busy' : 'ob1Next') + '</button>' +
      (AI.on ? '' : '<div class="sublinks"><button type="button" class="linkbtn" data-act="llm">' + t('obLLM') + '</button></div>') + '</form>';
    if (d.step === 2) {
      const rows = d.miles.map((m, i) => d.edit
        ? '<div class="level"><span class="i num">' + (i + 1) + '</span><div class="two"><input type="text" id="ob-m' + i + '" data-mi="' + i + '" data-mf="name" maxlength="20" aria-label="' + esc(t('ob2MileName')) + '" placeholder="' + esc(t('ob2MileName')) + '" value="' + esc(m.name) + '"><input type="text" id="ob-w' + i + '" data-mi="' + i + '" data-mf="doneWhen" maxlength="50" aria-label="' + esc(t('ob2MileWhen')) + '" placeholder="' + esc(t('ob2MileWhen')) + '" value="' + esc(m.doneWhen) + '"></div>' + (d.miles.length > 2 ? '<button type="button" class="linkbtn" data-act="obDelMile" data-i="' + i + '">' + t('ob2Del') + '</button>' : '<span></span>') + '</div>'
        : '<div class="level"><span class="i num">' + (i + 1) + '</span><div><div class="nm">' + esc(m.name) + '</div>' + (m.doneWhen ? '<div class="dw">' + esc(m.doneWhen) + '</div>' : '') + '</div><span></span></div>').join('');
      return '<form class="ob" id="f-ob2" novalidate>' + dots + '<h1>' + t('ob2Title', { n: d.miles.length }) + '</h1><p class="lead">' + t('ob2Lead') + '</p><div class="levels">' + rows + '</div>' +
        '<div class="btns" style="margin-top:-6px">' + (d.edit && d.miles.length < 5 ? '<button type="button" class="linkbtn" data-act="obAddMile">' + t('ob2Add') + '</button>' : '') + '<button type="button" class="linkbtn" data-act="obEdit">' + t(d.edit ? 'ob2EditDone' : 'ob2Edit') + '</button></div>' +
        '<div class="field"><label for="ob-first">' + t('ob2First') + '</label><input type="text" id="ob-first" data-bind="first" maxlength="100" autocomplete="off" placeholder="' + esc(t('ob2FirstPh')) + '" value="' + esc(d.first) + '"><span class="hint">' + t('ob2FirstHint') + '</span></div>' +
        (d.err ? '<p class="err">' + esc(d.err) + '</p>' : '') + '<button type="submit" class="btn primary cta">' + t('ob2Go') + '</button><div style="text-align:center"><button type="button" class="linkbtn" data-act="obBack">' + t('ob2Back') + '</button></div></form>';
    }
    if (!d.hatched) return '<div class="ob">' + dots + '<h1>' + t('ob3Tap') + '</h1><p class="lead">' + t('ob3TapLead') + '</p>' +
      eggStage(d, 'big', '<button type="button" class="actor" id="eggbtn" data-act="crack" aria-label="' + esc(t('ob3Egg')) + '">' + C.egg(d.hue, d.kind, d.cracks) + '</button><div class="taphint" id="taphint">' + L().ob3TapHint[Math.min(2, d.cracks)] + '</div>') + '</div>';
    return '<form class="ob" id="f-ob3" novalidate>' + dots + '<h1>' + t('ob3Title') + '</h1>' +
      '<div class="stage wide ' + phase() + '">' + C.scene(phase(), d.hue, null, { noNest: true }) + '<div class="actor" id="ob-pet">' + C.critter(draftLook(d), 'awake') + '</div></div>' +
      '<div class="thread" style="margin-top:0"><div class="msg pet lead"><span class="tx" id="ob-sample">' + esc(say('sample', d.style)) + '</span></div></div>' +
      '<div class="field"><span class="lab">' + t('ob3Voice') + '</span><div class="chips">' + Object.keys(L().styles).map(k => '<button type="button" class="chip" data-act="obStyle" data-x="' + k + '" aria-pressed="' + (d.style === k) + '">' + L().styles[k] + '</button>').join('') + '</div></div>' +
      '<div class="field"><label for="ob-name">' + t('ob3Name') + '</label><div class="namerow"><input type="text" id="ob-name" data-bind="name" maxlength="8" autocomplete="off" value="' + esc(d.name) + '"><button type="button" class="btn small" data-act="obReroll">' + t('ob3Reroll') + '</button></div></div>' +
      '<button type="submit" class="btn primary cta">' + t('ob3Go') + '</button></form>';
  }
  const defMiles = () => L().obDefault.map(x => ({ name: x[0], doneWhen: x[1] }));
  async function ob1Submit() {
    const d = ui.draft; if (d.busy) return; d.title = $('ob-title').value.trim(); if (!d.title) { d.err = t('ob1Need'); render(); $('ob-title').focus(); return; }
    d.err = ''; d.kind = guessKind(d.title);
    if (AI.on) {
      d.busy = true; render();
      const r = await Brain.run('plan', { title: d.title });
      if (r.out) { d.miles = r.out.miles; d.first = r.out.first; if (L().kinds[r.out.kind]) d.kind = r.out.kind; }
      d.busy = false; if (S.goal) return;
    }
    if (!d.miles) d.miles = defMiles();                                                // 连不上就给一份通用的三关，照样能往下走
    d.step = 2; render(); window.scrollTo({ top: 0 }); if (!d.first) $('ob-first').focus();
  }
  function ob2Submit() {
    const d = ui.draft; d.miles = d.miles.map(m => ({ name: m.name.trim(), doneWhen: m.doneWhen.trim() })).filter(m => m.name);
    if (d.miles.length < 2) { d.err = t('ob2NeedMiles'); d.edit = true; while (d.miles.length < 2) d.miles.push({ name: '', doneWhen: '' }); render(); return; }
    if (!d.first.trim()) { d.err = t('ob2NeedFirst'); render(); $('ob-first').focus(); return; }
    d.err = ''; d.edit = false; d.step = 3; d.cracks = 0; d.hatched = false; render(); window.scrollTo({ top: 0 }); $('eggbtn').focus({ preventScroll: true });
  }
  function actCrack() {
    const d = ui.draft, b = $('eggbtn'); if (!b || d.hatched || d.cracks >= 3) return;
    d.cracks++; b.innerHTML = C.egg(d.hue, d.kind, d.cracks); b.firstElementChild.classList.add('hit'); Sfx.crack(d.cracks); Sfx.buzz(14);
    const [x, y] = Fx.center(b), hue = C.HUES[d.hue]; Fx.burst(x, y - 20, { kind: 'shard', colors: [hue[1], '#fff', hue[0]], count: 5, speed: 200, size: 6, life: 0.6 });
    if (d.cracks < 3) { $('taphint').textContent = L().ob3TapHint[d.cracks]; return; }
    $('taphint').hidden = true;
    setTimeout(() => {
      if (ui.draft !== d || S.goal) return;
      Sfx.hatch(); Sfx.buzz(30); Fx.burst(x, y, { kind: 'shard', colors: [hue[1], hue[0], '#fff', hue[2]], count: 26, speed: 380, size: 11 }); Fx.ring(x, y, '#fff');
      d.hatched = true; render(); const s = $('ob-pet').firstElementChild; s.classList.add('popin'); setTimeout(() => { s.classList.remove('popin'); s.classList.add('jump'); setTimeout(() => s.classList.remove('jump'), 760); }, 620);
      sampleSay(d);
    }, reduce() ? 0 : 340);
  }
  function sampleSay(d) { const el = $('ob-sample'); if (!el) return; finishTyping(); const gen = ++typeGen, full = say('sample', d.style); if (reduce()) { el.textContent = full; return; } talkOn(true); typeInto(el, null, full, voiceOf(d), d.style, gen).then(() => { if (gen === typeGen) talkOn(false); }); }
  function ob3Submit() {
    const d = ui.draft;
    P.newGoal(S, now(), { title: d.title, kind: d.kind, style: d.style, name: d.name.trim() || L().names[0], hue: d.hue, shape: d.shape, miles: d.miles, promise: d.first.trim() });
    ui.draft = null; ui.thread = []; ui.from = 0; ui.step = 'idle'; ui.woke = true; ui.greetedFor = ''; ui.chat = []; ui.chatN = 0; if (S.tips) delete S.tips.intro;
    Store.save(); render(); window.scrollTo({ top: 0 }); anim('jump', 760);
  }

  /* ---------- 主界面 ---------- */
  function sceneItems(g) { const out = []; for (let i = Math.max(0, g.trinkets - 7); i < g.trinkets; i++) out.push({ id: itemId(g, i), fresh: i >= g.trinkets - ui.dropN }); return out; }
  const barPct = li => li.max ? 100 : Math.max(5, li.into / li.need * 100);
  function petHTML() {
    const g = S.goal, n = now(), li = P.levelInfo(g.xp), awake = P.isAwake(g, n);
    return C.scene(phase(), g.hue, sceneItems(g)) +
      '<div class="nameplate"><h1>' + esc(g.name) + '</h1><span class="pill' + (awake ? '' : ' sleep') + '" id="pill">' + t(awake ? 'stAwake' : ui.woke ? 'stGroggy' : 'stAsleep') + '</span></div>' +
      '<button type="button" class="actor" id="actor" data-act="poke" aria-label="' + esc(g.name) + '">' + C.critter(P.lookOf(g), mood(), { fresh: ui.freshPart }) + '</button>' +
      '<div class="growbar" id="growbar"><span>' + t(li.max ? 'growMax' : 'grow') + '</span>' + (li.max ? '' : '<div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="' + li.need + '" aria-valuenow="' + li.into + '"><i id="growfill" style="width:' + barPct(li) + '%"></i></div>') + '</div>';
  }
  const stageCls = () => 'stage ' + phase() + (ui.step !== 'idle' ? ' compact' : '');
  function renderPet() { const el = $('pet'); if (el) { el.className = stageCls(); el.innerHTML = petHTML(); ui.dropN = 0; ui.freshPart = ''; } }
  function gainBar(pct) { const f = $('growfill'), b = $('growbar'); if (!f) return; f.style.width = pct + '%'; b.classList.remove('gain'); void b.offsetWidth; b.classList.add('gain'); }
  function celebrate() { const a = $('actor'); if (!a) return; anim('jump', 760); const [x, y] = Fx.center(a); Fx.ring(x, y, '#FFD23F'); Fx.burst(x, y, { kind: 'star', count: 14, up: true, speed: 340, spread: 2.6 }); Sfx.levelUp(); Sfx.buzz(24); flash('happy', 2200); }
  /* 你讲的事变成一颗光点，飞进它嘴里；它咽下去，长一点 */
  function feed(from, r) {
    const g = S.goal; if (!r.xp) return;
    const land = () => {
      if (!S.goal || S.goal.id !== g.id || !$('actor')) return;
      anim('gulp', 560); Sfx.gulp(); Sfx.buzz(12);
      const b = $('growbar'); if (b) { const p = Fx.center(b); Fx.text(p[0], p[1] - 16, '+' + r.xp); }
      if (r.up) { gainBar(100); setTimeout(() => { if (S.goal && S.goal.id === g.id && $('pet')) { renderPet(); celebrate(); } }, 520); }
      else { const li = P.levelInfo(g.xp); if (li.max !== !$('growfill')) renderPet(); else gainBar(barPct(li)); Sfx.grow(); flash('happy', 1500); }
    };
    if (!from || !$('actor')) { land(); return; }
    Sfx.send(); Fx.orb(from, mouth(), C.HUES[g.hue % C.HUES.length][0], land);
  }
  function threadHTML() {
    let h = '', prevPet = false;
    for (let i = ui.from; i < ui.thread.length; i++) {
      const m = ui.thread[i], isNew = i >= ui.shown, nw = isNew ? ' new' : '';
      const acts = m.acts ? '<div class="acts">' + m.acts.map(a => '<button type="button" class="chip' + (a.ai ? ' ai-only' : '') + '" data-act="' + a.act + '" data-i="' + i + '"' + (a.x != null ? ' data-x="' + esc(a.x) + '"' : '') + '>' + esc(a.label) + '</button>').join('') + '</div>' : '';
      if (m.t === 'sys') h += '<div class="sys' + nw + '">' + m.text + '</div>';
      else if (m.t === 'pet') h += '<div class="msg pet' + (prevPet ? '' : ' lead') + nw + '"' + (m.tr ? ' data-tr="' + m.tr + '" data-ti="' + i + '"' : '') + (isNew ? ' data-full="' + esc(m.text) + '"' : '') + '><span class="tx">' + (isNew ? '' : esc(m.text)) + '</span>' + (isNew ? '<span class="rest" aria-hidden="true">' + esc(m.text) + '</span>' : '') + acts + '</div>';
      else h += '<div class="msg me' + nw + '">' + esc(m.text) + '</div>';
      prevPet = m.t === 'pet';
    }
    if (ui.busy) h += '<div class="msg pet thinking' + (prevPet ? '' : ' lead') + '" role="status" aria-label="' + esc(t('thinking', { name: S.goal.name })) + '"><i></i><i></i><i></i></div>';
    return h;
  }
  function composerHTML() {
    const g = S.goal, st = ui.step;
    const inrow = (id, ph, label, val) => '<div class="inrow"><input type="text" id="' + id + '" maxlength="300" autocomplete="off" enterkeyhint="send" aria-label="' + esc(ph) + '" placeholder="' + esc(ph) + '" value="' + esc(val || '') + '"><button type="submit" class="btn primary">' + label + '</button></div>';
    const sub = (act, label) => '<div class="sublinks"><button type="button" class="linkbtn" data-act="' + act + '">' + label + '</button></div>';
    if (ui.busy) return '';
    const tm = Tools.timer();
    if (tm && st === 'idle') return '<div class="timer" role="timer"><div class="k">' + t('timerLabel') + '</div><div class="clock num" id="clock">' + mmss(Tools.left()) + '</div><p class="hint">' + t('timerHint') + '</p><div class="btns"><button type="button" class="btn primary" data-act="timerDone">' + t('timerDone') + '</button><button type="button" class="btn" data-act="timerStop">' + t('timerStop') + '</button></div></div>';
    if (minorNight() && st === 'idle') return '<p class="note" style="text-align:center">' + t('minorNight') + '</p>';
    if (st === 'report') return inrow('rp-text', t('rpPh'), t('send')) + sub('cancelTalk', t('cancel'));
    if (st === 'answer') return inrow('an-text', t('anPh'), t('send')) + sub('skipAnswer', t('skip'));
    if (st === 'promise') {
      const chips = []; if (ui.suggest) chips.push(['pickSuggest', ui.suggest]); if (g.promise.text && g.promise.text !== ui.suggest) chips.push(['keepPromise', t('pmKeep', { x: g.promise.text })]);
      return (chips.length ? '<div class="chips">' + chips.map(c => '<button type="button" class="chip" data-act="' + c[0] + '">' + esc(c[1]) + '</button>').join('') + '</div>' : '') + inrow('pm-text', t('pmPh'), t('pmOk')) + sub('skipPromise', t('pmSkip'));
    }
    if (st === 'editPromise') return inrow('pm-text', t('pmPh'), t('pmOk'), g.promise.text) + sub('cancelTalk', t('cancel'));
    if (st === 'chat') return inrow('ch-text', t('chPh'), t('send')) + '<p class="hint">' + t('chHint') + '</p>' + sub('cancelTalk', t('chEnd'));
    if (!P.isAwake(g, now()) && !ui.woke) return '<button type="button" class="btn primary cta" data-act="wake">' + t('btnWake') + '</button>';
    return '<button type="button" class="btn primary cta" data-act="report">' + t('btnReport') + '</button><div class="sublinks">' + (g.promise.text ? '<button type="button" class="linkbtn" data-act="stuck">' + t('btnStuck') + '</button>' : '') + (Config.flag('chat') && !(S.agent && S.agent.minor) ? '<button type="button" class="linkbtn ai-only" data-act="chat">' + t('btnChat') + '</button>' : '') + '</div>';
  }
  const mmss = ms => { const x = Math.ceil(ms / 1000); return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };
  function talkHTML() {
    const g = S.goal, has = !!g.promise.text, showNote = ui.step === 'idle' && !ui.busy && (P.isAwake(g, now()) || ui.woke);
    return '<div class="thread" id="thread">' + threadHTML() + '</div>' +
      (showNote ? '<div class="nextnote"><div><div class="k">' + t('nextLabel') + '</div><div class="v' + (has ? '' : ' empty') + '">' + esc(has ? g.promise.text : t('nextEmpty')) + '</div></div><button type="button" class="linkbtn" data-act="editPromise">' + t('nextEdit') + '</button></div>' : '') +
      '<form class="composer" id="f-talk" novalidate>' + composerHTML() + '</form>';
  }
  function rowsHTML() {
    const g = S.goal; let ic = ''; for (let i = Math.max(0, g.trinkets - 3); i < g.trinkets; i++) ic += C.glyph(itemId(g, i), 26);
    return '<button type="button" class="row" data-act="route"><span class="t">' + t('stageRow', { i: g.cur + 1, name: esc(curMile(g).name) }) + '</span><span class="c num">' + t('stageCount', { a: g.cur + 1, b: g.miles.length }) + '</span></button>' +
      (g.trinkets ? '<button type="button" class="row" data-act="treasure"><span class="t">' + t('treasRow') + '</span><span class="ic">' + ic + '</span><span class="c num">' + g.trinkets + '</span></button>' : '');
  }
  function viewPet() { return '<div class="stagewrap"><section class="' + stageCls() + '" id="pet">' + petHTML() + '</section></div><section id="talk">' + talkHTML() + '</section><section class="rows" id="rows">' + rowsHTML() + '</section>'; }
  function renderTalk(focusId) {
    const el = $('talk'); if (!el) return; finishTyping(); el.innerHTML = talkHTML(); const grew = ui.thread.length > ui.shown; afterThread();
    const st = $('pet'); if (st) st.className = stageCls(); setMood();
    const r = $('rows'); if (r) r.innerHTML = rowsHTML();
    const f = focusId && $(focusId); if (f) f.focus({ preventScroll: true });
    if (grew || focusId) { const tgt = $('f-talk'); if (tgt) setTimeout(() => tgt.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60); }
  }
  function tickLive() {
    const tm = Tools.timer();
    if (tm) { const left = Tools.left(), c = $('clock'); if (c) c.textContent = mmss(left); if (left <= 0 && !ui.timerEnding) { ui.timerEnding = true; timerEnd(true).finally(() => { ui.timerEnding = false; }); } }
    const g = S.goal; if (!g || route() !== 'pet' || sheetOpen() || ui.lock || !$('pet')) return; const was = P.isAwake(g, now() - 1000), found = P.tick(S, now());
    if (found && ui.step === 'idle' && !ui.busy && (P.isAwake(g, now()) || ui.woke)) { announceFound(); renderPet(); renderTalk(); }
    if (was !== P.isAwake(g, now())) { renderPet(); renderTalk(); }
    const ph = phase(); if (!$('pet').classList.contains(ph)) renderPet();                // 天色变了
  }

  /* ---------- 对话流程：讲一句 → 它回一句并问一句 → 约下一小步 ---------- */
  const origin = id => { const el = id && $(id); return el ? Fx.center(el) : null; };
  function sysBonus(r, mult) { const g = S.goal, bits = []; if (mult > 1.05) bits.push(t('sysBonus', { m: mulStr(mult) })); if (r.up) bits.push('<b>' + t('sysUp', { name: esc(g.name) }) + '</b>'); if (bits.length) push('sys', bits.join(' · ')); }
  async function submitReport() {
    const g = S.goal, text = $('rp-text').value.trim(); if (!text) { $('rp-text').focus(); return; }
    const lv = Guard.crisis(text); if (lv === 2) { crisisStop(text); return; }
    const from = origin('rp-text'), prior = lastLogs(g);
    const r = P.report(S, now(), { text, size: sizeOf(text), tz: tz() }), log = r.log; ui.lastLog = ui.promiseLog = log.id; ui.woke = true; ui.suggest = ''; ev('report', { xp: log.xp }); Store.save();
    push('me', text); sysBonus({ up: r.up }, log.mult); if (log.patched) push('sys', t('sysPatch', { name: esc(g.name) }));
    let sayText = say('react'), ask = L().askFallback[(g.adv - 1) % L().askFallback.length];
    ui.step = 'answer'; ui.busy = true; renderTalk(); feed(from, { xp: log.xp, up: r.up });
    const wait = sleep(reduce() ? 0 : 900);                                            // 至少等它把这一口咽下去
    let tr = '';
    if (AI.on) { const r = await Brain.run('react', { g, mile: curMile(g).name, text, logs: prior, mem: memText(g) }); tr = r.tr; if (r.out) { sayText = r.out.say; if (r.out.ask) ask = r.out.ask; if (r.out.next) ui.suggest = r.out.next; } }
    await wait; if (!S.goal || S.goal.id !== g.id) return;
    log.reply = sayText; ui.askQ = ask; ui.busy = false; Store.save();
    push('pet', sayText + '\n' + ask, null, tr); if (lv === 1) crisisLow(); renderTalk('an-text');
  }
  function toPromise() { ui.step = 'promise'; push('pet', say('askPromise')); renderTalk('pm-text'); }
  function submitAnswer() {
    const a = $('an-text').value.trim(); if (a.length < 2) { $('an-text').focus(); return; }
    const lv = Guard.crisis(a); if (lv === 2) { crisisStop(a); return; }
    const from = origin('an-text'), r = P.answer(S, now(), ui.lastLog, ui.askQ, a); ev('answer'); Store.save();
    push('me', a); sysBonus(r, 1); if (lv === 1) crisisLow(); toPromise(); feed(from, r);
  }
  function finishPromise(text, fromLog) {
    const g = S.goal, from = origin('pm-text'), r = P.promise(S, now(), text, fromLog ? ui.promiseLog : null); ev('promise'); Store.save();
    push('me', text); const keep = ui.thread.length; sysBonus(r, 1);
    push('pet', say('promised'), toolActs()); if (g.cur === 0 && g.stageAdv >= 2 && tipOnce('stage')) push('pet', fill(L().tips.stage, { mile: curMile(g).name }));
    const ns = Nudge.st(); if (Nudge.available && Config.flag('nudges') && !ns.on && !ns.asked) { ns.asked = true; push('pet', t('nudgeAsk'), [{ act: 'nudgeYes', label: t('nudgeYes') }, { act: 'nudgeNo', label: t('nudgeNo') }]); }
    ui.step = 'idle'; ui.promiseLog = null; Store.save();
    if (fromLog) { ui.from = keep; ui.shown = keep; }                                  // 一轮讲完，屏幕回到最简单的样子；整段对话在日记里
    renderTalk(); if (fromLog) window.scrollTo({ top: 0, behavior: 'smooth' });
    if (r.xp) feed(from, r); else { const p = $('pill'); if (p) { p.textContent = t('stAwake'); p.classList.remove('sleep'); } flash('happy', 1400); }
    afterRound(g);
  }
  const toolActs = () => Config.flag('tools') ? [{ act: 'timerStart', label: t('toolTimer') }, { act: 'calAdd', label: t('toolCal') }] : null;
  // 一轮讲完：后台整理记忆、写好提醒文案、重排提醒。都不阻塞界面，失败也不影响什么。
  function afterRound(g) {
    Nudge.sync().catch(() => {});
    Memory.updateGoal(g).then(() => { Store.save(); return Nudge.prepare(g, memText(g)); }).then(() => Store.save()).catch(() => {});
  }
  /* ---------- 安全：危机、依赖、时长 ---------- */
  function crisisStop(text) {
    const inp = $('rp-text') || $('an-text') || $('ch-text') || $('pm-text'); if (inp) inp.value = '';
    push('me', text); push('pet', t('crisisBody'), [{ act: 'crisisHelp', label: t('crisisHelp') }]); ui.step = 'idle'; ui.busy = false;
    ev('crisis', { lv: 2 }); Store.save(); renderTalk(); sheetCrisis();
  }
  function crisisLow() { push('pet', t('crisisLow'), [{ act: 'crisisHelp', label: t('crisisHelp') }]); ev('crisis', { lv: 1 }); }
  function sheetCrisis() {
    openSheet('<h2>' + t('crisisTitle') + '</h2><p>' + t('crisisBody') + '</p><div class="lines">' + L().crisisLines.map(x => '<a class="line" href="tel:' + x[1].split(' ')[0] + '"><span>' + esc(x[0]) + '</span><b class="num">' + esc(x[1]) + '</b></a>').join('') + '</div><p class="note">' + t('crisisOther') + '</p><button type="button" class="btn primary cta" data-act="close">' + t('crisisOk') + '</button>');
  }
  function submitPromise() { const x = $('pm-text').value.trim(); if (!x) { $('pm-text').focus(); return; } finishPromise(x, ui.step === 'promise'); }
  async function submitChat() {
    const g = S.goal, text = $('ch-text').value.trim(); if (!text || !AI.on) return;
    const lv = Guard.crisis(text); if (lv === 2) { crisisStop(text); return; }
    push('me', text); ui.busy = true; ev('chat'); renderTalk();
    const turns = [{ role: 'user', content: L().P.chatRules({ g, mile: curMile(g).name, logs: lastLogs(g), mem: memText(g) }) }].concat(ui.chat, [{ role: 'user', content: text }]);
    const r = await Brain.run('chat', null, { messages: turns }); if (!S.goal || S.goal.id !== g.id) return;
    if (r.out) { ui.chat.push({ role: 'user', content: text }, { role: 'assistant', content: r.out }); if (ui.chat.length > 12) ui.chat = ui.chat.slice(-12); ui.chatN++; push('pet', r.out, null, r.tr); }
    else push('sys', esc(r.err || AI.fillWho(L().err.other)));
    if (lv === 1) crisisLow();
    ui.busy = false;
    if (ui.chatN >= 6 || !AI.on) { if (ui.chatN >= 6) push('pet', say('chatEnd')); ui.step = 'idle'; renderTalk(); } else { ui.step = 'chat'; renderTalk('ch-text'); }
  }
  async function actStuck() {
    const g = S.goal; let opts = L().stuckFallback; fresh();
    if (AI.on) {
      ui.busy = true; renderTalk();
      const r = await Brain.run('shrink', { g, mem: memText(g) }); if (r.out) opts = r.out;
      if (!S.goal || S.goal.id !== g.id) return; ui.busy = false;
    }
    ui.step = 'idle'; push('pet', say('stuck'), opts.map(o => ({ act: 'pickPromise', label: o, x: o })).concat(Config.flag('tools') ? [{ act: 'timerStart', label: t('toolTimer') }] : [])); renderTalk();
  }
  async function actWelcomeAI(el) {
    const g = S.goal, msg = ui.thread[+el.dataset.i]; if (!AI.on || ui.busy) return; if (msg) msg.acts = null;
    ui.busy = true; renderTalk();
    const r = await Brain.run('welcome', { g, mile: curMile(g).name, gap: Math.floor(awayDays(g)), logs: lastLogs(g), mem: memText(g) });
    if (S.goal && S.goal.id === g.id) { if (r.out) push('pet', r.out, null, r.tr); else if (r.err) push('sys', esc(r.err)); }
    ui.busy = false; ui.step = 'idle'; renderTalk();
  }
  function actPoke() {
    const g = S.goal; if (!g || ui.lock) return; const awake = P.isAwake(g, now()) || ui.woke;
    anim('poke', 460); Sfx.poke(awake ? voiceOf(g) : voiceOf(g) * 0.6); Sfx.buzz(8);
    const tn = Date.now(); ui.pokes = ui.pokes.filter(x => tn - x < 4000); ui.pokes.push(tn);
    const T = L().say[g.style], text = !awake ? 'Zzz…' : ui.pokes.length >= 5 ? T.quipMany : pick(T.quip); if (ui.pokes.length >= 5) ui.pokes = [];
    if (awake && !ui.busy) flash('happy', 1100);
    const old = $('quip'); if (old) old.remove(); const q = document.createElement('div'); q.className = 'quip'; q.id = 'quip'; q.textContent = text; $('pet').appendChild(q); setTimeout(() => { if (q.isConnected) q.remove(); }, 1700);
  }

  /* ---------- 二级：路线、宝贝、证书、放归、设置 ---------- */
  const shellIcon = hue => { const h = C.HUES[hue % C.HUES.length]; return '<svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true"><path d="M6,18 L11,12 L16,18 L20,11 L25,18 L29,12 L34,18 C34,30 28,35 20,35 C12,35 6,30 6,18Z" fill="' + h[1] + '" stroke="' + C.INK + '" stroke-width="3" stroke-linejoin="round"/><path d="M12,26 Q20,31 28,26" fill="none" stroke="' + h[0] + '" stroke-width="3" stroke-linecap="round"/></svg>'; };
  function trailHTML(miles, cur, look, hue) {
    return '<ol class="trail">' + miles.map((m, i) => { const st = i < cur ? 'done' : i === cur ? 'cur' : 'todo';
      return '<li class="' + st + '"><span class="node num">' + (st === 'done' ? shellIcon(hue) : st === 'cur' && look ? C.critter(look, 'happy', { plain: true }) : i + 1) + '</span><div><div class="nm">' + esc(m.name) + (st === 'cur' && look ? '<span class="tagnow">' + t('rtCur') + '</span>' : '') + '</div>' +
        (st === 'done' ? '<div class="dw">' + t('rtDone', { date: L().date(m.doneAt), part: m.card && m.card.part ? L().parts[m.card.part][0] : '' }) + '</div>' + (m.card && m.card.text ? '<div class="shell">' + esc(m.card.text) + '</div>' : '') : m.doneWhen ? '<div class="dw">' + esc(m.doneWhen) + '</div>' : '') + '</div></li>'; }).join('') + '</ol>';
  }
  function sheetRoute() {
    const g = S.goal;
    openSheet('<h2>' + t('rtTitle') + '</h2>' + trailHTML(g.miles, g.cur, P.lookOf(g), g.hue) +
      '<button type="button" class="btn primary cta" data-act="moltGo"' + (g.stageAdv > 0 ? '' : ' disabled') + '>' + t('rtBtn') + '</button>' + (g.stageAdv > 0 ? '' : '<p class="note" style="text-align:center">' + t('rtNeed') + '</p>') +
      '<div class="sublinks"><button type="button" class="linkbtn" data-act="close">' + t('close') + '</button><button type="button" class="linkbtn" data-act="release">' + t('rtRelease') + '</button></div>');
  }
  function certHTML(a) {
    const days = Math.max(1, Math.round((a.endedAt - a.createdAt) / DAY)), parts = a.look.parts.map(p => L().parts[p][0]);
    return '<div class="cert">' + stageBox(a.look, a.result === 'grown' ? 'happy' : 'awake', { cls: 'wide' }) + '<div><div class="who">' + esc(a.look.name) + '</div><div class="what"><span class="tag ' + a.result + '">' + t(a.result === 'grown' ? 'certDone' : 'certLeft') + '</span>' + esc(a.title) + '</div></div>' +
      '<div class="facts"><span class="fact">' + L().date(a.createdAt) + ' – ' + L().date(a.endedAt) + '</span><span class="fact num">' + L().days(days) + '</span><span class="fact num">' + t('certAdv', { n: a.adv }) + '</span><span class="fact num">' + t('certItems', { n: a.trinkets }) + '</span>' + (parts.length ? '<span class="fact">' + t('certParts', { list: parts.join('、') }) + '</span>' : '') + '</div>' +
      (a.reason ? '<p class="note">' + esc(a.reason) + '</p>' : '') + '</div>';
  }
  async function actMoltGo() {
    const g = S.goal; if (!g || g.stageAdv === 0 || ui.lock) return;
    const stage = g.cur, mileName = curMile(g).name, info = { name: g.name, title: g.title, hue: g.hue, id: g.id }, hues = C.HUES[g.hue % C.HUES.length];
    const logs = forPrompt(goalLogs(g, stage).slice(-30));
    ui.lock = true; closeSheet(); window.scrollTo({ top: 0 }); finishTyping();
    const r = P.molt(S, now(), {}); Store.save();                                     // 状态先落盘；屏幕上还是旧的样子，下面演给人看
    ev('molt', { stage });
    if (AI.on) Brain.run('shell', { g: { title: info.title }, mile: mileName, logs }).then(x => {
      const ms = S.goal && S.goal.id === info.id ? S.goal.miles : (S.habitat.find(h => h.id === info.id) || {}).miles; if (x.out && ms && ms[stage] && ms[stage].card) { ms[stage].card.text = x.out; Store.save(); }
    });
    if (r.done) { const a = S.habitat[S.habitat.length - 1]; if (a) Memory.updateUser(a).then(ok => { if (ok) Store.save(); }); Nudge.sync().catch(() => {}); }
    if (!reduce() && $('actor')) {
      anim('shakey', 1100); Sfx.rumble(); flash('ask', 1100); await sleep(1000);
      const st = $('pet'), a = $('actor'); if (st && a) { st.classList.add('flash'); const [x, y] = Fx.center(a); Fx.burst(x, y, { kind: 'shard', colors: [hues[1], hues[0], '#fff', hues[2]], count: 28, speed: 380, size: 11 }); Fx.ring(x, y, '#fff'); }
      Sfx.molt(); Sfx.buzz(40); await sleep(220);
    } else Sfx.molt();
    ui.thread = []; ui.from = 0; ui.shown = 0; ui.step = 'idle'; ui.mood = ''; ui.lock = false;
    const part = r.part ? L().parts[r.part] : null;
    if (r.done) {
      const a = S.habitat[S.habitat.length - 1]; ui.draft = null; ui.greetedFor = ''; render(); Fx.confetti(); Sfx.grown();
      openSheet('<h2>' + t('grownTitle', { name: esc(info.name) }) + '</h2>' + certHTML(a) + '<p class="note">' + t('grownBody') + '</p><button type="button" class="btn primary cta" data-act="goHome">' + t('grownGo') + '</button><div class="sublinks"><button type="button" class="linkbtn" data-act="close">' + t('grownNew') + '</button></div>');
    } else {
      ui.woke = true; ui.greetedFor = info.id; ui.freshPart = r.part || ''; push('pet', say('afterMolt')); render();
      setTimeout(() => { anim('jump', 760); const a = $('actor'); if (a) { const [x, y] = Fx.center(a); Fx.burst(x, y, { kind: 'star', count: 16, up: true, speed: 360, spread: 2.8 }); } Sfx.sparkle(); }, reduce() ? 0 : 700);
      await sleep(reduce() ? 0 : 1700); if (!S.goal || S.goal.id !== info.id || sheetOpen()) return;
      openSheet('<p class="eyebrow">' + t('mlPassed', { i: stage + 1 }) + '</p><h2>' + t('mlGot', { name: esc(info.name), part: part ? part[0] : '' }) + '</h2>' + stageBox(P.lookOf(S.goal), r.part === 'eyes' ? 'ask' : 'happy', { cls: 'wide', fresh: r.part }) + '<p>' + (part ? part[1] : '') + '</p><button type="button" class="btn primary cta" data-act="close">' + t('ok') + '</button>');
    }
  }
  function sheetTreasure() {
    const g = S.goal, total = C.ITEMS.length; let h = '';
    for (let i = 0; i < total; i++) h += i < g.trinkets ? '<div class="slot' + (i >= g.trinkets - ui.newItems ? ' new' : '') + '">' + C.glyph(itemId(g, i), 36) + '<span>' + esc(itemName(itemId(g, i))) + '</span></div>' : '<div class="slot none">?</div>';
    openSheet('<div style="display:flex;justify-content:space-between;align-items:baseline"><h2>' + t('trTitle') + '</h2><span class="note num">' + t('trCount', { a: Math.min(g.trinkets, total), b: total }) + '</span></div><p class="note">' + t('trLead') + '</p><div class="grid4">' + h + '</div><div class="sublinks"><button type="button" class="linkbtn" data-act="close">' + t('close') + '</button></div>');
    ui.newItems = 0;
  }
  function sheetBuddy(i) { const a = S.habitat[i]; if (!a) return; openSheet(certHTML(a) + (a.miles.some(m => m.doneAt) ? '<div class="lab">' + t('certShells') + '</div>' + trailHTML(a.miles, a.result === 'grown' ? a.miles.length : a.look.stage, null, a.look.hue) : '') + '<div class="sublinks"><button type="button" class="linkbtn" data-act="close">' + t('close') + '</button></div>'); }
  function sheetRelease() {
    const g = S.goal;
    openSheet('<h2>' + t('rlTitle', { name: esc(g.name) }) + '</h2><p>' + t('rlLead') + '</p><div class="field"><label for="rl-reason" style="font:inherit;font-size:.9rem">' + t('rlReason') + '</label><input type="text" id="rl-reason" maxlength="100"></div>' +
      '<div class="btns"><button type="button" class="btn hot" data-act="releaseGo">' + t('rlGo') + '</button><button type="button" class="btn" data-act="close">' + t('rlKeep') + '</button></div>');
  }
  function sheetSettings(confirmReset) {
    const g = S.goal, sw = (act, onNow) => '<div class="switch">' + [[true, t('setOn')], [false, t('setOff')]].map(o => '<button type="button" data-act="' + act + '" data-x="' + (o[0] ? 1 : 0) + '" aria-pressed="' + (onNow === o[0]) + '">' + o[1] + '</button>').join('') + '</div>';
    const updateBridge = window.YangyizhiDesktop || nativeUpdateBridge;
    openSheet('<h2>' + t('setTitle') + '</h2>' +
      '<section style="grid-template-columns:1fr auto;align-items:center"><div class="lab">' + t('setSound') + '</div>' + sw('setSound', !S.mute) + '</section>' +
      (g ? '<section><div class="lab">' + t('setVoice') + '</div><div class="chips">' + Object.keys(L().styles).map(k => '<button type="button" class="chip" data-act="setStyle" data-x="' + k + '" aria-pressed="' + (g.style === k) + '">' + L().styles[k] + '</button>').join('') + '</div></section>' : '') +
      (g ? '<section><div class="lab">' + t('setTime') + '</div><p class="note">' + t('setTimeHint') + '</p><div class="btns">' + [1, 3, 7, 14].map(d => '<button type="button" class="btn small" data-act="skip" data-d="' + d + '">' + t('setTimeBtn', { d }) + '</button>').join('') + '</div></section>' : '') +
      '<section><div class="lab">' + t('setBrain') + '</div><p class="note">' + (AI.on ? t('setAIOn', { who: esc(AI.who) }) : t('setAIOff')) + '</p><div class="btns"><button type="button" class="btn small" data-act="llm">' + t(AI.ext ? 'llmChange' : 'llmConnect') + '</button></div></section>' +
      nudgeSection() +
      '<section><div class="lab">' + t('setMem') + '</div><div class="btns"><button type="button" class="btn small" data-act="memOpen">' + t('setMemBtn') + '</button></div></section>' +
      '<section><div class="lab">云端同步</div><p class="note">' + (Store.cloudUser ? '已登录：' + esc(Store.cloudUser.username) + '。存档会在此设备本地保存并同步到云端。' : '登录养一只账号后，可在 Web、Android 和桌面端继续使用同一份存档。') + (Store.cloudError ? '<br><span class="err">' + esc(Store.cloudError) + '</span>' : '') + '</p><button type="button" class="btn small" data-act="cloudOpen">' + (Store.cloudUser ? '账号与同步' : '登录 / 注册') + '</button></section>' +
      '<section style="grid-template-columns:1fr auto;align-items:center"><div><div class="lab">' + t('minorTitle') + '</div><p class="note">' + t('minorLead') + '</p></div>' + sw('setMinor', !!(S.agent && S.agent.minor)) + '</section>' +
      (updateBridge ? '<section><div class="lab">软件更新</div><p class="note">检查当前客户端版本和兼容的更新。</p><button type="button" class="btn small" data-act="updateCheck">检查更新</button></section>' : '') +
      '<section><div class="lab">' + t('setAbout') + '</div><p class="note">' + t(Store.kind === 'cloud' ? 'setSaveCloud' : Store.kind === 'local' ? 'setSaveLocal' : 'setSaveNone') + (Config.get('filing') ? ' ' + esc(t('filing', { x: Config.get('filing') })) : '') + '</p>' +
      '<div class="btns"><button type="button" class="btn small" data-act="export" id="btn-export">' + t('setExport') + '</button><button type="button" class="btn small" data-act="privOpen">' + t('privTitle') + '</button><button type="button" class="btn small" data-act="diagOpen">' + t('diagTitle') + '</button>' + (confirmReset ? '<button type="button" class="btn small hot" data-act="resetGo">' + t('setResetGo') + '</button>' : '<button type="button" class="btn small" data-act="reset">' + t('setReset') + '</button>') + '</div>' +
      (confirmReset ? '<p class="err">' + t('setResetLead') + '</p>' : '') + '<input type="text" id="export-box" readonly hidden aria-label="' + esc(t('setExport')) + '"></section>' +
      '<div class="sublinks"><button type="button" class="linkbtn" data-act="close">' + t('close') + '</button></div>');
  }

  function sheetCloud() {
    if (Store.cloudUser) {
      if (ui.cloudMode === 'delete') {
        openSheet('<h2>删除云端账号</h2><p class="err">这会永久删除账号和腾讯云存档，无法撤销。请输入当前密码确认。</p><form id="f-cloud-delete"><div class="field"><label for="cloud-delete-pass">当前密码</label><input id="cloud-delete-pass" type="password" autocomplete="current-password" required></div>' +
          '<p class="err" aria-live="polite">' + esc(ui.cloudMessage || '') + '</p><div class="btns"><button class="btn hot" type="submit">永久删除账号和云存档</button><button class="btn" type="button" data-act="cloudOpen">取消</button></div></form>');
        return;
      }
      openSheet('<h2>云端账号</h2><p class="note">已登录 <strong>' + esc(Store.cloudUser.username) + '</strong>。账号存档版本：' + Store.cloudRevision + '。</p>' +
        (Store.cloudError ? '<p class="err">' + esc(Store.cloudError) + '</p>' : '<p class="note">每次保存会在本机先落盘，再同步到腾讯云。离线时保留本机数据，联网后可重试。</p>') +
        '<div class="btns"><button type="button" class="btn primary" data-act="cloudSync">立即同步</button><button type="button" class="btn" data-act="cloudLogout">退出账号</button></div><div class="sublinks"><button type="button" class="linkbtn" data-act="cloudDeleteMode">删除云端账号和存档</button></div>' +
        '<div class="sublinks"><button type="button" class="linkbtn" data-act="settings">返回设置</button></div>');
      return;
    }
    const d = ui.cloudMessage;
    openSheet('<h2>' + (ui.cloudMode === 'register' ? '创建养一只账号' : '登录养一只账号') + '</h2>' +
      '<p class="note">账号用于在你的设备间同步养一只存档。密码只以加盐哈希保存在养一只独立服务中。</p>' +
      '<form id="f-cloud-auth" autocomplete="on"><div class="field"><label for="cloud-user">用户名</label><input id="cloud-user" name="username" autocomplete="username" minlength="3" maxlength="32" required></div>' +
      '<div class="field"><label for="cloud-pass">密码</label><input id="cloud-pass" name="password" type="password" autocomplete="' + (ui.cloudMode === 'register' ? 'new-password' : 'current-password') + '" minlength="12" maxlength="128" required><span class="hint">请使用 12 位或更长、未在其他网站使用的密码。</span></div>' +
      '<p class="' + (d ? 'err' : 'note') + '" aria-live="polite">' + esc(d || '') + '</p><div class="btns"><button class="btn primary" type="submit">' + (ui.cloudMode === 'register' ? '注册并同步' : '登录并同步') + '</button><button class="btn" type="button" data-act="cloudMode">' + (ui.cloudMode === 'register' ? '已有账号，去登录' : '创建新账号') + '</button></div></form>' +
      '<div class="sublinks"><button type="button" class="linkbtn" data-act="settings">返回设置</button></div>');
  }

  function sheetCloudConflict() {
    const pending = Store.pendingSync; if (!pending) return sheetCloud();
    openSheet('<h2>选择要保留的存档</h2><p class="note">本机存档与云端版本不同。为避免覆盖数据，请选择这一份账号要继续使用的版本。</p>' +
      '<section><div class="lab">本机</div><p class="note">' + (pending.local.goal ? '有正在进行的目标' : '没有正在进行的目标') + '；记录 ' + (pending.local.logs?.length || 0) + ' 条；完成记录 ' + (pending.local.habitat?.length || 0) + ' 条。</p>' +
      '<button type="button" class="btn primary" data-act="cloudKeepLocal">保留本机，上传到云端</button></section>' +
      '<section><div class="lab">腾讯云</div><p class="note">当前云端版本 ' + pending.revision + '；' + (pending.remote?.goal ? '有正在进行的目标' : '没有正在进行的目标') + '；记录 ' + (pending.remote?.logs?.length || 0) + ' 条；完成记录 ' + (pending.remote?.habitat?.length || 0) + ' 条。</p>' +
      '<button type="button" class="btn" data-act="cloudKeepRemote">载入云端到本机</button></section>' +
      '<div class="sublinks"><button type="button" class="linkbtn" data-act="close">暂不选择</button></div>');
  }

  /* ---------- 接入外部大模型 ---------- */
  function sheetLLM(d) {
    const cur = AI.ext || {};
    d = d || ui.llm || (ui.llm = { preset: cur.preset || 'deepseek', base: cur.base || LLM.PRESETS.deepseek.base, key: cur.key || '', model: cur.model || LLM.PRESETS.deepseek.model, quick: cur.quick || '', proto: cur.proto || 'openai', msg: '', ok: false, busy: false });
    const pr = LLM.PRESETS[d.preset] || LLM.PRESETS.custom;
    const inp = (id, k, lab, ph, type, hint) => '<div class="field"><label for="' + id + '" style="font:inherit;font-size:.92rem;font-weight:500">' + lab + '</label><input type="' + (type || 'text') + '" id="' + id + '" data-llm="' + k + '" autocomplete="off" spellcheck="false" placeholder="' + esc(ph || '') + '" value="' + esc(d[k] || '') + '">' + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</div>';
    openSheet('<h2>' + t('llmTitle') + '</h2><p class="note">' + t('llmLead') + '</p>' +
      '<div class="field"><span class="lab" style="font:inherit;font-size:.92rem;font-weight:500">' + t('llmProvider') + '</span><div class="chips">' + Object.keys(LLM.PRESETS).map(k => '<button type="button" class="chip" data-act="llmPreset" data-x="' + k + '" aria-pressed="' + (d.preset === k) + '">' + esc(LLM.PRESETS[k].name) + '</button>').join('') + '</div>' +
      (pr.direct ? '' : '<span class="hint">' + t('llmNoDirect') + '</span>') + '</div>' +
      inp('llm-base', 'base', t('llmBase'), 'https://…/v1', 'url', d.preset === 'custom' ? t('llmBaseHint') : '') +
      inp('llm-key', 'key', t('llmKey'), d.preset === 'custom' ? t('llmKeyOpt') : 'sk-…', 'password', t('llmKeyHint')) +
      inp('llm-model', 'model', t('llmModel'), t('llmModelPh'), 'text', pr.doc ? t('llmModelHint', { url: '<a href="' + pr.doc + '" target="_blank" rel="noopener">' + esc(LLM.hostOf(pr.doc)) + '</a>' }) : '') +
      inp('llm-quick', 'quick', t('llmQuick'), t('llmQuickPh'), 'text', '') +
      (d.preset === 'custom' ? '<div class="field"><span class="lab" style="font:inherit;font-size:.92rem;font-weight:500">' + t('llmProto') + '</span><div class="chips" role="radiogroup" aria-label="' + esc(t('llmProto')) + '">' + [['openai', t('llmProtoOpenAI')], ['anthropic', t('llmProtoAnthropic')]].map(o => '<button type="button" class="chip" data-act="llmProto" data-x="' + o[0] + '" aria-pressed="' + (d.proto === o[0]) + '">' + o[1] + '</button>').join('') + '</div></div>' : '') +
      '<p class="' + (d.ok ? 'note' : 'err') + '" id="llm-msg" aria-live="polite">' + (d.busy ? t('llmTesting') : esc(d.msg || '')) + '</p>' +
      '<div class="btns"><button type="button" class="btn primary" data-act="llmSave"' + (d.busy ? ' disabled' : '') + '>' + t('llmSave') + '</button><button type="button" class="btn" data-act="llmTest"' + (d.busy ? ' disabled' : '') + '>' + t('llmTest') + '</button></div>' +
      '<div class="sublinks">' + (AI.ext ? '<button type="button" class="linkbtn" data-act="llmOff">' + t('llmOff') + '</button>' : '') + '<button type="button" class="linkbtn" data-act="llmBack">' + t(S.goal ? 'back' : 'close') + '</button></div>');
  }
  function llmRead() {
    const d = ui.llm; for (const el of document.querySelectorAll('[data-llm]')) d[el.dataset.llm] = el.value.trim();
    const pr = LLM.PRESETS[d.preset] || LLM.PRESETS.custom;
    return { preset: d.preset, proto: d.preset === 'custom' ? d.proto : pr.proto, base: LLM.trimBase(d.base), key: d.key, model: d.model, quick: d.quick };
  }
  function llmCheck(c) {
    if (!/^https?:\/\/[^\s]+$/.test(c.base)) return t('llmNeedBase');
    if (location.protocol === 'https:' && /^http:\/\//.test(c.base) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(c.base)) return t('llmMixed');
    if (!c.model) return t('llmNeedModel');
    if (!c.key && c.preset !== 'custom') return t('llmNeedKey');
    return '';
  }
  function llmErr(e) {
    const c = e && e.code, map = { auth: 'llmEAuth', not_found: 'llmENotFound', rate_limited: 'llmERate', quota: 'llmEQuota', network: 'llmENetwork', timeout: 'llmETimeout', upstream: 'llmEUpstream', refused: 'llmERefused' };
    return t(map[c] || 'llmEOther') + (e && e.detail && c !== 'network' ? '（' + e.detail + '）' : '');
  }
  async function llmRun(save) {
    const d = ui.llm, c = llmRead(), bad = llmCheck(c);
    if (bad) { d.msg = bad; d.ok = false; sheetLLM(d); return; }
    d.busy = true; d.msg = ''; sheetLLM(d);
    try {
      const r = await LLM.test(c);
      d.ok = true; d.msg = t(save ? 'llmSaved' : 'llmOk', { ms: r.ms, who: LLM.label(c) });
      if (save) { AI.use(c); Sfx.sparkle && Sfx.sparkle(); }
    } catch (e) { d.ok = false; d.msg = llmErr(e); }
    d.busy = false; if (sheetOpen() && $('llm-msg')) sheetLLM(d);
    if (save && d.ok) { render(); }
  }

  /* ---------- 提醒、它记得、隐私、诊断、反馈 ---------- */
  function nudgeSection() {
    if (!Config.flag('nudges') || !S.goal) return '';
    const n = Nudge.st(), sw = (act, onNow) => '<div class="switch">' + [[true, t('setOn')], [false, t('setOff')]].map(o => '<button type="button" data-act="' + act + '" data-x="' + (o[0] ? 1 : 0) + '" aria-pressed="' + (onNow === o[0]) + '">' + o[1] + '</button>').join('') + '</div>';
    if (!Nudge.available) return '<section><div class="lab">' + t('setNudge') + '</div><p class="note">' + t('setNudgeWeb') + '</p></section>';
    const q = n.queue[0], when = q ? new Date(q.at - (S.offset || 0)).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    return '<section style="grid-template-columns:1fr auto;align-items:center"><div><div class="lab">' + t('setNudge') + '</div><p class="note">' + t('setNudgeLead') + '</p></div>' + sw('nudgeSet', !!n.on) + '</section>' +
      (n.denied ? '<p class="err">' + t('setNudgeDenied') + '</p>' : '') +
      (n.on ? '<section><div class="lab" style="font-size:.95rem">' + t('setQuiet') + '</div><div class="chips">' + L().quietOpts.map((o, i) => '<button type="button" class="chip" data-act="nudgeQuiet" data-x="' + i + '" aria-pressed="' + (n.quiet[0] === o[0][0] && n.quiet[1] === o[0][1]) + '">' + o[1] + '</button>').join('') + '</div>' +
        '<div class="chips"><button type="button" class="chip" data-act="nudgeDue" aria-pressed="' + !!n.dueOnly + '">' + t('setDueOnly') + '</button></div><p class="note">' + (q ? t('setNudgeNext', { when }) : t('setNudgeNone')) + '</p></section>' : '');
  }
  function sheetMem() {
    const g = S.goal, mem = Memory.all(), gm = g ? Memory.goal(g.id) : null, u = mem.user, L0 = L();
    const field = (scope, id, k, v) => '<div class="field"><label for="mem-' + scope + '-' + k + '" style="font:inherit;font-size:.9rem;font-weight:500">' + L0.memLabels[k] + '</label><input type="text" id="mem-' + scope + '-' + k + '" data-mem="' + scope + '" data-mid="' + esc(id || '') + '" data-mk="' + k + '" maxlength="120" value="' + esc(v || '') + '"></div>';
    let h = '<h2>' + t('memTitle') + '</h2><p class="note">' + t('memLead') + '</p>';
    if (g) h += '<div class="lab">' + t('memGoalHead', { title: esc(g.title) }) + (gm && gm.src ? ' <span class="note">· ' + L0.memSrc[gm.src] + '</span>' : '') + '</div>' + Memory.GOAL_FIELDS.map(k => field('goal', g.id, k, gm && gm[k])).join('');
    h += '<div class="lab">' + t('memUserHead') + '</div>' + (u || S.habitat.length ? Memory.USER_FIELDS.map(k => field('user', '', k, u && u[k])).join('') : '<p class="note">' + t('memEmpty') + '</p>');
    h += '<div class="btns"><button type="button" class="btn primary" data-act="memSave">' + t('memSave') + '</button><button type="button" class="btn hot" data-act="memClear">' + t('memClear') + '</button></div><div class="sublinks"><button type="button" class="linkbtn" data-act="settings">' + t('back') + '</button></div>';
    openSheet(h);
  }
  function sheetPriv(mode) {
    let h = '<h2>' + t('privTitle') + '</h2><p class="note">' + t('privLead') + '</p>';
    if (mode === 'import') h += '<div class="field"><label for="imp-box" style="font:inherit;font-size:.92rem;font-weight:500">' + t('privImport') + '</label><textarea id="imp-box" rows="5" spellcheck="false"></textarea><span class="hint">' + t('privImportLead') + '</span></div><p class="err" id="imp-err"></p><div class="btns"><button type="button" class="btn primary" data-act="importGo">' + t('privImportGo') + '</button><button type="button" class="btn" data-act="privOpen">' + t('cancel') + '</button></div>';
    else if (mode === 'delete') h += '<p class="err">' + t('privDeleteLead') + '</p><div class="btns"><button type="button" class="btn hot" data-act="deleteGo">' + t('privDeleteGo') + '</button><button type="button" class="btn" data-act="privOpen">' + t('cancel') + '</button></div>';
    else h += '<div class="btns"><button type="button" class="btn small" data-act="importOpen">' + t('privImport') + '</button><button type="button" class="btn small hot" data-act="deleteOpen">' + t('privDelete') + '</button></div>';
    openSheet(h + '<div class="sublinks"><button type="button" class="linkbtn" data-act="settings">' + t('back') + '</button></div>');
  }
  function sheetDiag() {
    const since = Date.now() - 7 * DAY, st = Trace.stats(since), evs = (S.events || []).filter(e => e.at >= now() - 7 * DAY);
    const days = new Set(evs.filter(e => e.t === 'open' || e.t === 'report').map(e => P.dayKey(e.at, tz()))).size;
    const gn = L().guardNames, gl = Object.keys(st.guard).map(k => (gn[k] || k) + ' ' + st.guard[k]).join('，');
    openSheet('<h2>' + t('diagTitle') + '</h2><p class="note">' + t('diagLead') + '</p><ul class="diag">' +
      '<li>' + t('diagCalls', { n: st.calls, ok: Math.round(st.ok * 100), ms: st.ms }) + '</li><li>' + t('diagRetry', { r: st.retry, f: st.fallback }) + '</li>' +
      '<li>' + (gl ? t('diagGuard', { list: gl }) : t('diagGuardNone')) + '</li><li>' + t('diagNudge', { s: evs.filter(e => e.t === 'nudge.sent').length, o: evs.filter(e => e.t === 'nudge.open').length }) + '</li>' +
      '<li>' + t('diagActive', { d: days }) + '</li><li>' + t('diagFb', { n: st.fb }) + '</li><li>' + t('diagSrc', { src: Config.src }) + '</li></ul>' +
      '<div class="btns"><button type="button" class="btn small" data-act="diagExport" id="btn-diag">' + t('diagExport') + '</button></div><input type="text" id="diag-box" readonly hidden aria-label="' + esc(t('diagExport')) + '"><div class="sublinks"><button type="button" class="linkbtn" data-act="settings">' + t('back') + '</button></div>');
  }
  function sheetFeedback(i) {
    const m = ui.thread[i]; if (!m || !m.tr || !Config.flag('feedback')) return;
    openSheet('<h2>' + t('fbTitle') + '</h2><blockquote class="quote">' + esc(m.text) + '</blockquote><p class="note">' + t('fbLead') + '</p><div class="chips">' + L().fbReasons.map(r => '<button type="button" class="chip" data-act="fbGo" data-i="' + i + '" data-x="' + r[0] + '">' + r[1] + '</button>').join('') + '</div><div class="sublinks"><button type="button" class="linkbtn" data-act="close">' + t('cancel') + '</button></div>');
  }
  async function timerEnd(auto) {
    const g = S.goal; await Tools.stopTimer(true); if (!g) return;
    Sfx.sparkle(); Sfx.buzz(20); fresh(); push('pet', t('timerEnd')); ui.step = 'report'; Store.save(); render(); setTimeout(() => { const f = $('rp-text'); if (f) f.focus(); }, 60);
  }

  /* ---------- 日记、栖地 ---------- */
  const backLink = () => '<div><a class="linkbtn" href="#pet" style="padding-left:0">' + t('back') + '</a></div>';
  function viewDiary() {
    const goals = []; if (S.goal) goals.push({ id: S.goal.id, title: S.goal.title, miles: S.goal.miles, name: S.goal.name });
    for (const a of S.habitat.slice().reverse()) goals.push({ id: a.id, title: a.title, miles: a.miles, name: a.look.name });
    let h = '<div class="page">' + backLink() + '<h1>' + t('dyTitle') + '</h1>', any = false;
    for (const g of goals) {
      const logs = S.logs.filter(l => l.goalId === g.id); if (!logs.length) continue; any = true;
      h += '<section><h2>' + esc(g.name) + ' · ' + esc(g.title) + '</h2>';
      for (let i = g.miles.length - 1; i >= 0; i--) {
        const ls = logs.filter(l => l.stage === i).reverse(), m = g.miles[i]; if (!ls.length && !m.card) continue;
        h += '<h3 class="stagehead">' + t('dyStage', { i: i + 1, name: esc(m.name) }) + '</h3>';
        if (m.card) h += '<div class="shellcard"><div class="k">' + t('dyShell', { date: L().date(m.doneAt) }) + (m.card.part ? ' · ' + t('mlGot', { name: esc(g.name), part: L().parts[m.card.part][0] }) : '') + '</div>' + (m.card.text ? '<p>' + esc(m.card.text) + '</p>' : '') + '</div>';
        for (const l of ls) h += '<div class="log"><div class="when">' + L().date(l.at) + '</div><div class="tx">' + esc(l.text) + '</div>' + (l.a ? '<div class="qa"><div class="qq">' + esc(g.name) + '：' + esc(l.q) + '</div><div>' + esc(l.a) + '</div></div>' : '') + (l.next ? '<div class="nx">' + t('dyNext') + esc(l.next) + '</div>' : '') + '</div>';
      }
      h += '</section>';
    }
    return h + (any ? '' : '<p class="note">' + t('dyEmpty') + '</p>') + '</div>';
  }
  function viewHome() {
    const cards = [];
    if (S.goal) cards.push({ look: P.lookOf(S.goal), title: S.goal.title, tag: 'now', label: t('hmNow'), mood: P.isAwake(S.goal, now()) ? 'awake' : 'sleep', line: '', act: 'goPet', i: -1 });
    for (let i = S.habitat.length - 1; i >= 0; i--) { const a = S.habitat[i]; cards.push({ look: a.look, title: a.title, tag: a.result, label: t(a.result === 'grown' ? 'hmGrown' : 'hmReleased'), mood: a.result === 'grown' ? 'happy' : 'awake', line: t('hmLine', { from: L().date(a.createdAt), to: L().date(a.endedAt), adv: a.adv }), act: 'buddy', i }); }
    return '<div class="page">' + backLink() + '<h1>' + t('hmTitle') + '</h1><div><div class="bondbig num">' + t('hmBond', { n: S.bond }) + '</div><p class="note">' + t('hmLead') + '</p></div><div class="homes">' +
      cards.map(c => '<button type="button" class="home" data-act="' + c.act + '" data-i="' + c.i + '">' + stageBox(c.look, c.mood, { cls: 'mini', phase: c.tag === 'now' ? phase() : 'day' }) + '<div class="nm">' + esc(c.look.name) + '</div><div class="d"><span class="tag ' + c.tag + '">' + c.label + '</span>' + esc(c.title) + '</div>' + (c.line ? '<div class="d">' + c.line + '</div>' : '') + '</button>').join('') + '</div></div>';
  }

  /* ---------- 动作 ---------- */
  const acts = {
    close() { closeSheet(); }, settings() { ui.llm = null; sheetSettings(false); },
    cloudOpen() { ui.cloudMessage = ''; ui.cloudMode = 'login'; sheetCloud(); },
    cloudMode() { ui.cloudMode = ui.cloudMode === 'login' ? 'register' : 'login'; ui.cloudMessage = ''; sheetCloud(); },
    async cloudAuth() {
      const username = $('cloud-user')?.value.trim(), password = $('cloud-pass')?.value;
      if (!username || !password) return;
      try {
        const result = await Store.login(ui.cloudMode, username, password);
        ui.cloudMessage = '';
        if (result === 'conflict') { ui.cloudPending = Store.pendingSync; sheetCloudConflict(); }
        else { closeSheet(); render(); toast(result === 'uploaded' ? '本机存档已同步到云端。' : Store.cloudUser ? '已连接云端存档。' : '已登录。'); }
      } catch (error) { ui.cloudMessage = error.message || '登录失败，请稍后重试。'; sheetCloud(); }
    },
    async cloudSync() {
      if (!Store.cloudUser) return;
      Store.flushCloud(); await Store.cloudQueue;
      if (Store.pendingSync) { ui.cloudPending = Store.pendingSync; sheetCloudConflict(); }
      else { ui.cloudMessage = Store.cloudError || '已完成同步。'; sheetCloud(); }
    },
    async cloudLogout() {
      try { await Store.logout(); closeSheet(); render(); toast('已退出养一只账号。'); }
      catch (error) { Store.cloudError = error.message || '退出失败，请检查网络。'; sheetCloud(); }
    },
    cloudDeleteMode() { ui.cloudMode = 'delete'; ui.cloudMessage = ''; sheetCloud(); },
    async cloudDelete() {
      try { await Store.deleteAccount($('cloud-delete-pass')?.value || ''); closeSheet(); render(); toast('云端账号和存档已删除。'); }
      catch (error) { ui.cloudMessage = error.message || '删除失败，账号和数据仍保留。'; sheetCloud(); }
    },
    async cloudKeepLocal() {
      try { await Store.resolveCloudConflict('local'); toast('本机存档已上传。'); }
      catch (error) { Store.cloudError = error.message || '上传失败，双方存档都已保留。'; sheetCloudConflict(); }
    },
    async cloudKeepRemote() {
      try { await Store.resolveCloudConflict('cloud'); toast('已载入云端存档。'); }
      catch (error) { Store.cloudError = error.message || '读取失败。'; sheetCloudConflict(); }
    },
    llm() { ui.llm = null; sheetLLM(); },
    llmPreset(el) { const d = ui.llm; llmRead(); const k = el.dataset.x, p = LLM.PRESETS[k], was = LLM.PRESETS[d.preset]; d.preset = k; d.proto = p.proto; if (k !== 'custom' || !d.base || (was && d.base === was.base)) d.base = p.base; d.model = p.model; d.quick = p.quick || ''; d.msg = ''; d.ok = false; sheetLLM(d); },
    llmProto(el) { llmRead(); ui.llm.proto = el.dataset.x; sheetLLM(ui.llm); },
    llmBack() { ui.llm = null; if (S.goal) sheetSettings(false); else closeSheet(); },
    llmTest() { llmRun(false); }, llmSave() { llmRun(true); },
    llmOff() { AI.use(null); ui.llm = null; render(); sheetSettings(false); toast(t('llmOffDone')); }, goHome() { closeSheet(); location.hash = 'home'; }, goPet() { location.hash = 'pet'; },
    async updateCheck() {
      const bridge = window.YangyizhiDesktop || nativeUpdateBridge;
      if (!bridge) return;
      openSheet('<h2>软件更新</h2><p class="note">正在检查更新…</p>');
      try {
        const result = window.YangyizhiDesktop ? await bridge.checkUpdate() : await bridge.checkForUpdate();
        if (!result.available) {
          openSheet('<h2>软件更新</h2><p class="note">当前版本：' + esc(result.currentVersion || '未知') + '。' + esc(result.message || '已是最新版本') + '</p><div class="sublinks"><button type="button" class="linkbtn" data-act="close">关闭</button></div>');
          return;
        }
        openSheet('<h2>发现新版本</h2><p class="note">当前版本：' + esc(result.currentVersion || '未知') + '</p><p>可用版本：' + esc(result.version) + '</p><p class="note">最低兼容版本：' + esc(result.minimumCompatible) + '</p><p>' + esc(result.releaseNotes) + '</p><button type="button" class="btn primary cta" data-act="updateInstall">下载并安装更新</button><div class="sublinks"><button type="button" class="linkbtn" data-act="close">稍后</button></div>');
      } catch (error) {
        openSheet('<h2>暂时无法检查更新</h2><p class="err">' + esc(error.message || '检查失败，请检查网络后重试。') + '</p><div class="btns"><button type="button" class="btn small" data-act="updateCheck">重试</button><button type="button" class="btn small" data-act="close">关闭</button></div>');
      }
    },
    async updateInstall() {
      const bridge = window.YangyizhiDesktop || nativeUpdateBridge;
      if (!bridge) return;
      try {
        const result = window.YangyizhiDesktop ? await bridge.downloadUpdate() : await bridge.installUpdate();
        if (result.canceled) return;
        if (result.permissionRequired) {
          openSheet('<h2>需要允许安装更新</h2><p class="note">请在 Android 设置中允许“养一只”安装此来源的应用，返回后再次点击安装。已下载的文件已通过完整性与签名校验。</p><div class="sublinks"><button type="button" class="linkbtn" data-act="close">关闭</button></div>');
          return;
        }
        openSheet('<h2>更新文件已校验</h2><p class="note">文件大小与 SHA-256 校验通过。' + (result.path ? '打开保存的安装包后继续安装。' : '请按 Android 系统安装提示继续。') + '</p>' + (result.path ? '<button type="button" class="btn primary cta" data-act="updateOpen">打开更新文件</button>' : '') + '<div class="sublinks"><button type="button" class="linkbtn" data-act="close">关闭</button></div>');
      } catch (error) {
        openSheet('<h2>更新未安装</h2><p class="err">' + esc(error.message || '下载或校验失败，当前版本未更改。') + '</p><div class="btns"><button type="button" class="btn small" data-act="updateCheck">重试</button><button type="button" class="btn small" data-act="close">关闭</button></div>');
      }
    },
    async updateOpen() {
      const bridge = window.YangyizhiDesktop;
      if (!bridge) return;
      try {
        await bridge.openUpdate();
        openSheet('<h2>已打开更新文件</h2><p class="note">Windows：按安装程序提示更新。macOS：解压 ZIP，将新应用复制到 Applications；如替换失败，保留旧版并恢复旧应用副本。</p><div class="sublinks"><button type="button" class="linkbtn" data-act="close">关闭</button></div>');
      } catch (error) {
        openSheet('<h2>无法打开更新文件</h2><p class="err">' + esc(error.message || '文件校验失败。') + '</p><div class="sublinks"><button type="button" class="linkbtn" data-act="close">关闭</button></div>');
      }
    },
    nudgeYes(el) { const m = ui.thread[+el.dataset.i]; if (m) m.acts = null; Nudge.enable(true).then(r => { push('pet', r === 'on' ? t('nudgeOn') : t('setNudgeDenied')); Store.save(); renderTalk(); }); },
    nudgeNo(el) { const m = ui.thread[+el.dataset.i]; if (m) m.acts = null; push('pet', t('nudgeOff')); Store.save(); renderTalk(); },
    nudgeSet(el) { Nudge.enable(el.dataset.x === '1').then(() => { Store.save(); sheetSettings(false); }); },
    nudgeQuiet(el) { Nudge.st().quiet = L().quietOpts[+el.dataset.x][0].slice(); Nudge.sync().then(() => { Store.save(); sheetSettings(false); }); },
    nudgeDue() { const n = Nudge.st(); n.dueOnly = !n.dueOnly; Nudge.sync().then(() => { Store.save(); sheetSettings(false); }); },
    memOpen() { sheetMem(); },
    memSave() { for (const el of document.querySelectorAll('[data-mem]')) { const cur = el.dataset.mem === 'user' ? (Memory.user() || {})[el.dataset.mk] : (Memory.goal(el.dataset.mid) || {})[el.dataset.mk]; if ((cur || '') !== el.value.trim()) Memory.edit(el.dataset.mem, el.dataset.mid, el.dataset.mk, el.value); } ev('mem.edit'); Store.save(); toast(t('memSaved')); sheetMem(); },
    memClear() { Memory.clear(); ev('mem.clear'); Store.save(); toast(t('memClearDone')); sheetMem(); },
    setMinor(el) { S.agent.minor = el.dataset.x === '1'; ev('minor', { on: S.agent.minor }); Store.save(); render(); sheetSettings(false); },
    privOpen() { sheetPriv(); }, importOpen() { sheetPriv('import'); }, deleteOpen() { sheetPriv('delete'); },
    importGo() {
      let o = null; try { o = JSON.parse($('imp-box').value.trim()); } catch (e) { o = null; }
      if (!o || o.v !== 2 || !Array.isArray(o.logs) || !Array.isArray(o.habitat)) { $('imp-err').textContent = t('privImportBad'); return; }
      adopt(o); S.savedAt = 0; Store.save(); ui.thread = []; ui.from = 0; ui.step = 'idle'; ui.draft = null; ui.greetedFor = ''; ev('import'); closeSheet(); Nudge.sync().catch(() => {}); render(); toast(t('privImportDone'));
    },
    async deleteGo() {
      await Platform.notify.cancel([1001, 1002, 1003, 1004, Tools.TIMER_ID]);
      for (const k of ['yangyizhi.llm.v1', 'yangyizhi.trace.v1', 'yangyizhi.config.v1']) window.Agent.LS.del(k);
      window.Agent.Persist.remove('yangyizhi.llm.v1');
      Platform.resetDeviceId(); AI.use(null);
      S = P.create(); adopt(S); ui.draft = null; ui.thread = []; ui.from = 0; ui.step = 'idle'; ui.busy = false; ui.greetedFor = ''; ui.woke = false; Store.save(); closeSheet(); location.hash = 'pet'; render(); toast(t('privDeleted'));
    },
    diagOpen() { sheetDiag(); },
    async diagExport() { const txt = JSON.stringify({ config: Config.src, traces: Trace.list(), events: (S.events || []).slice(-300) }); try { await navigator.clipboard.writeText(txt); $('btn-diag').textContent = t('setCopied'); } catch (e) { const b = $('diag-box'); b.hidden = false; b.value = txt; b.select(); } },
    fbGo(el) { const m = ui.thread[+el.dataset.i]; if (m && m.tr) Trace.feedback(m.tr, el.dataset.x, m.text); ev('feedback', { r: el.dataset.x }); Store.save(); closeSheet(); toast(t('fbThanks')); },
    crisisHelp() { sheetCrisis(); },
    async timerStart(el) { const m = el && ui.thread[+el.dataset.i]; if (m) m.acts = null; if (!S.goal || Tools.timer()) return; await Tools.startTimer(10); ui.step = 'idle'; Store.save(); Sfx.sparkle(); renderTalk(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    timerDone() { timerEnd(false); },
    async timerStop() { await Tools.stopTimer(false); push('pet', t('timerStopped')); Store.save(); renderTalk(); },
    async calAdd(el) { const g = S.goal; if (!g || !g.promise.text) return; const hs = goalLogs(g).slice(-10).map(l => new Date(l.at).getHours()).sort((a, b) => a - b); try { const r = await Tools.calendar(g, hs.length ? hs[Math.floor(hs.length / 2)] : 20); Store.save(); toast(t(r === 'native' ? 'calDone' : 'calIcs')); } catch (e) { toast(esc(e && e.message || '')); } },
    obEx(el) { const d = ui.draft; d.title = el.dataset.x; d.kind = guessKind(d.title); $('ob-title').value = d.title; $('egg').innerHTML = C.egg(d.hue, d.kind, 0); $('ob-title').focus(); },
    obBack() { const d = ui.draft; d.step = 1; d.miles = null; d.err = ''; d.edit = false; render(); },
    obEdit() { const d = ui.draft; d.edit = !d.edit; if (!d.edit) d.miles = d.miles.filter(m => m.name.trim()); if (d.miles.length < 2) { d.edit = true; } render(); },
    obAddMile() { ui.draft.miles.push({ name: '', doneWhen: '' }); render(); $('ob-m' + (ui.draft.miles.length - 1)).focus(); },
    obDelMile(el) { ui.draft.miles.splice(+el.dataset.i, 1); render(); },
    crack() { actCrack(); },
    obStyle(el) { const d = ui.draft; d.style = el.dataset.x; for (const c of document.querySelectorAll('[data-act="obStyle"]')) c.setAttribute('aria-pressed', String(c.dataset.x === d.style)); sampleSay(d); },
    obReroll() { const d = ui.draft; d.name = pick(L().names.filter(n => n !== d.name)); $('ob-name').value = d.name; },
    poke() { actPoke(); },
    wake() { ui.woke = true; ui.justWoke = true; ui.greetedFor = ''; Sfx.wake(); render(); anim('jump', 760); },
    report() { fresh(); ui.step = 'report'; push('pet', say('askReport')); renderTalk('rp-text'); },
    cancelTalk() { ui.step = 'idle'; renderTalk(); },
    skipAnswer() { toPromise(); },
    pickSuggest() { finishPromise(ui.suggest, true); },
    keepPromise() { finishPromise(S.goal.promise.text, true); },
    skipPromise() { const keep = ui.thread.length; push('pet', say('noPromise')); ui.step = 'idle'; ui.promiseLog = null; ui.from = keep; ui.shown = keep; renderTalk(); window.scrollTo({ top: 0, behavior: 'smooth' }); afterRound(S.goal); },
    editPromise() { if (ui.busy) return; ui.step = 'editPromise'; renderTalk('pm-text'); },
    pickPromise(el) { const m = ui.thread[+el.dataset.i]; if (m) m.acts = null; finishPromise(el.dataset.x, false); },
    stuck() { if (!ui.busy) actStuck(); },
    chat() {
      fresh(); const lim = Config.get('limits') || {}, d = Guard.dependence(S.events, now(), x => P.dayKey(x, tz()), lim);
      if (d.overDaily) { push('pet', t('depDaily')); ui.step = 'idle'; renderTalk(); return; }
      if (d.chatOnly && S.agent.depDay !== dayNow()) { S.agent.depDay = dayNow(); push('pet', t('depChatOnly')); }
      ui.step = 'chat'; renderTalk('ch-text');
    },
    welcomeAI(el) { actWelcomeAI(el); },
    route() { sheetRoute(); }, moltGo() { actMoltGo(); }, treasure() { sheetTreasure(); }, buddy(el) { sheetBuddy(+el.dataset.i); },
    release() { sheetRelease(); },
    releaseGo() { const name = S.goal.name; P.release(S, now(), $('rl-reason').value.trim()); ev('release'); const a = S.habitat[S.habitat.length - 1]; if (a) Memory.updateUser(a).then(ok => { if (ok) Store.save(); }); Store.save(); Nudge.sync().catch(() => {}); closeSheet(); ui.thread = []; ui.from = 0; ui.step = 'idle'; ui.draft = null; ui.greetedFor = ''; Sfx.sleep(); render(); toast(t('rlToast', { name })); },
    setStyle(el) { S.goal.style = el.dataset.x; Store.save(); for (const c of document.querySelectorAll('[data-act="setStyle"]')) c.setAttribute('aria-pressed', String(c.dataset.x === S.goal.style)); Sfx.blip(voiceOf(S.goal), S.goal.style); },
    setSound(el) { S.mute = el.dataset.x !== '1'; Sfx.on = !S.mute; Store.save(); for (const c of document.querySelectorAll('[data-act="setSound"]')) c.setAttribute('aria-pressed', String((c.dataset.x === '1') === !S.mute)); if (!S.mute) Sfx.sparkle(); },
    skip(el) { S.offset = (S.offset || 0) + (+el.dataset.d) * DAY; Store.save(); closeSheet(); ui.thread = []; ui.from = 0; ui.step = 'idle'; ui.busy = false; ui.woke = false; ui.mood = ''; ui.greetedFor = ''; ui.newItems = 0; ui.chat = []; ui.chatN = 0; if (route() !== 'pet') location.hash = 'pet'; else render(); window.scrollTo({ top: 0 }); },
    async export() { const txt = JSON.stringify(S); try { await navigator.clipboard.writeText(txt); $('btn-export').textContent = t('setCopied'); } catch (e) { const b = $('export-box'); b.hidden = false; b.value = txt; b.focus(); b.select(); } },
    reset() { sheetSettings(true); },
    resetGo() { S = P.create(); ui.draft = null; ui.thread = []; ui.from = 0; ui.step = 'idle'; ui.busy = false; ui.greetedFor = ''; ui.woke = false; Store.save(); closeSheet(); location.hash = 'pet'; render(); },
  };

  document.addEventListener('pointerdown', () => Sfx.unlock(), { passive: true });
  document.addEventListener('keydown', () => Sfx.unlock());
  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]');
    if (el) { if (el.disabled) return; if (el.matches('.btn, .chip, .row, .navlink, .linkbtn, .switch button')) Sfx.tap(); const f = acts[el.dataset.act]; if (f) f(el, ev); return; }
    if (ev.target.id === 'sheet') closeSheet(); else if (typing.length && ev.target.closest('#thread')) finishTyping();
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && sheetOpen()) closeSheet(); });
  // 长按它的一句话（电脑上右键）：标记「这句话不太对」
  let pressT = 0;
  const pressEnd = () => clearTimeout(pressT);
  document.addEventListener('pointerdown', e => { const m = e.target.closest && e.target.closest('.msg.pet[data-tr]'); if (!m) return; pressT = setTimeout(() => { finishTyping(); sheetFeedback(+m.dataset.ti); }, 650); }, { passive: true });
  for (const n of ['pointerup', 'pointercancel', 'pointerleave', 'scroll']) document.addEventListener(n, pressEnd, { passive: true, capture: true });
  document.addEventListener('contextmenu', e => { const m = e.target.closest && e.target.closest('.msg.pet[data-tr]'); if (!m) return; e.preventDefault(); sheetFeedback(+m.dataset.ti); });
  document.addEventListener('input', ev => {
    const el = ev.target, d = ui.draft; if (!d) return;
    if (el.dataset.bind) { d[el.dataset.bind] = el.value; if (el.dataset.bind === 'title') { const k = guessKind(el.value); if (k !== d.kind) { d.kind = k; $('egg').innerHTML = C.egg(d.hue, d.kind, 0); } } }
    else if (d.miles && el.dataset.mf) d.miles[+el.dataset.mi][el.dataset.mf] = el.value;
  });
  document.addEventListener('submit', ev => {
    ev.preventDefault(); const id = ev.target.id, s = ui.step; if (ui.busy || ui.lock) return;
    if (id === 'f-cloud-auth') acts.cloudAuth();
    else if (id === 'f-cloud-delete') acts.cloudDelete();
    else if (id === 'f-ob1') ob1Submit(); else if (id === 'f-ob2') ob2Submit(); else if (id === 'f-ob3') ob3Submit();
    else if (id === 'f-talk') { if (s === 'report') submitReport(); else if (s === 'answer') submitAnswer(); else if (s === 'promise' || s === 'editPromise') submitPromise(); else if (s === 'chat') submitChat(); }
  });
  window.addEventListener('hashchange', () => { closeSheet(); render(); window.scrollTo({ top: 0 }); });

  /* ---------- 启动 ---------- */
  function adopt(o) {
    S = Object.assign(P.create(), o); S.logs = S.logs || []; S.habitat = S.habitat || []; S.tips = S.tips || {}; Sfx.on = !S.mute;
    Events.migrate(S); S.mem = S.mem || { goals: {}, user: null }; S.agent = Object.assign({ minor: false, usage: {} }, S.agent || {});
  }
  adopt(S);
  const local = Store.loadLocal(); if (local && local.v === 2) { adopt(local); Store.kind = 'local'; }
  else { try { localStorage.setItem(KEY + '.t', '1'); localStorage.removeItem(KEY + '.t'); Store.kind = 'local'; } catch (e) { Store.kind = 'none'; } }
  ui.looking = !local && !!(window.claude && window.claude.use);
  render();
  if (ui.looking) setTimeout(() => { if (ui.looking) { ui.looking = false; if (!S.goal && !sheetOpen()) render(); } }, 4000);
  Store.connect().then(remote => {
    const was = ui.looking; ui.looking = false;
    if (remote && remote.v === 2 && (remote.savedAt || 0) > (S.savedAt || 0)) { adopt(remote); Store.saveLocal(); ui.draft = null; ui.thread = []; ui.from = 0; ui.step = 'idle'; ui.greetedFor = ''; closeSheet(); render(); }
    else { if (Store.ref && S.rev > 0) { Store.pending = true; Store.flush(); } if (was && !S.goal) render(); }
    if (Store.cloudUser) render();
    if (Store.pendingSync) { ui.cloudPending = Store.pendingSync; sheetCloudConflict(); }
  });
  // 安卓：本地存档丢了（系统清理了 WebView 数据）就从原生偏好里恢复
  if (!local) window.Agent.Persist.restore().then(ok => {
    const r = ok && Store.loadLocal(); if (!r || r.v !== 2 || S.goal) return;
    adopt(r); Store.kind = 'local'; ui.looking = false; ui.draft = null; ui.thread = []; ui.from = 0; ui.step = 'idle'; ui.greetedFor = ''; AI.init(); closeSheet(); render(); Nudge.sync().catch(() => {});
  }).catch(() => {});
  AI.init();
  Config.load().then(() => { AI.sync(); if (route() === 'pet' && S.goal && !sheetOpen() && ui.step === 'idle' && !ui.busy) renderTalk(); });
  // 打开和回到前台：记一次「打开」、把已发出的提醒记账并重排、补做一次记忆整理
  const wake = () => { Nudge.onOpen().catch(() => {}); Memory.sleepTime().then(ok => { if (ok) Store.save(); }).catch(() => {}); Store.saveLocal(); if (Tools.timer() && Tools.left() <= 0) timerEnd(true); };
  wake(); Platform.onResume(wake);
  Platform.notify.onTap(x => { ev('nudge.open', { kind: x.kind }); Store.save(); if (x.kind === 'timer') { if (Tools.timer()) timerEnd(true); return; } location.hash = 'pet'; closeSheet(); render(); if (S.goal && ui.step === 'idle' && !minorNight()) { ui.woke = true; acts.report(); } });
  // 使用时长：前台每 15 秒记一次；超过阈值提醒一次（未成年人模式阈值更低）
  setInterval(() => {
    if (document.visibilityState !== 'visible' || !S.agent) return;
    const d = dayNow(), u = S.agent.usage = S.agent.usage || {}; for (const k in u) if (+k < d - 7) delete u[k];
    u[d] = (u[d] || 0) + 15; const lim = Config.get('limits') || {}, mins = (S.agent.minor ? lim.minorMinutes : lim.useMinutes) || 60;
    if (u[d] >= mins * 60 && S.agent.useTold !== d) { S.agent.useTold = d; toast(t('useLong').replace('一个小时', mins >= 60 ? '一个小时' : mins + ' 分钟')); }
    if (u[d] % 60 === 0) Store.saveLocal();
  }, 15000);
  setInterval(tickLive, 1000);
  window.__app = { get S() { return S; }, AI, Store, render, ui, Agent: window.Agent };   // 调试用
})();
