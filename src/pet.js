/* 养一只 · 规则引擎
 * 纯函数：不碰界面，不读时钟，时间都由调用方传入 now（毫秒）。
 * 它长大的唯一来源是「见闻」，见闻只能靠讲述真实做过的事得到。聊天不长个儿。
 * 它不会饿、不会病、不会死：你不来，它只是睡了。
 */
(function (root) {
  'use strict';
  const DAY = 86400e3, HOUR = 3600e3;
  const DEFAULT = {
    // 见闻：大头给「留下东西」（回答它的问题、和它约好下一步），不给自报的时长
    xp: { s: 2, m: 2, l: 2, answer: 2, promise: 2 },   // 讲一次固定 2 点；s/m/l 只用来决定它长出什么，不再让用户自己报
    sameDay: [1, 0.5],                         // 同一天第 2 次减半，第 3 次起固定 1 点
    startXp: 3,                                // 孵出来并约好第一步，本身就是一次推进
    // 攒的话：离开越久，回来第一次讲述的见闻越多，但永远比不上天天来
    litter: { free: 1, k: 0.5, capDays: 30 },
    // 每一段内的等级：升一级要 4、6、8…点见闻，最高 7 级
    levelBase: 4, levelStep: 2, maxLevel: 7, overflowHours: 6,
    // 好奇心：它醒着的时候自己攒，攒够了就出门捡一样东西回窝
    rateBase: 2, rateLevel: 3, stageMul: 1.5, bondBonus: 0.05, trinketBonus: 0.1,
    trinketCost: 40, trinketGrow: 1.6,
    // 醒着：约好了下一步能醒 3 天，没约只醒一半
    awakeDays: 3, noPromise: 0.5,
    freshDays: 2, freshMul: 2,                 // 刚蜕完壳的两天，好奇心翻倍
    bondDiv: 200,                              // 蜕变得到的羁绊 = √(这一段的好奇心 / 200)
    patchGap: 5,                               // 隔了 5 天以上又回来：它身上多一块补丁（奖章，不是污点）
    parts: ['eyes', 'horns', 'wings', 'antenna', 'tail', 'plates'],
  };
  let CFG = JSON.parse(JSON.stringify(DEFAULT));
  function configure(over) { CFG = JSON.parse(JSON.stringify(DEFAULT)); if (over) Object.assign(CFG, over); return CFG; }

  function create() { return { v: 2, rev: 0, savedAt: 0, lang: 'zh', offset: 0, bond: 0, goal: null, logs: [], habitat: [] }; }
  const blankStat = () => ({ s: 0, m: 0, l: 0, ans: 0 });

  function newGoal(s, now, o) {
    const g = {
      id: 'g' + now.toString(36), title: o.title, why: o.why || '', kind: o.kind || 'make', style: o.style || 'curious', name: o.name,
      hue: o.hue | 0, shape: o.shape | 0, createdAt: now,
      miles: o.miles.map(m => ({ name: m.name, doneWhen: m.doneWhen || '', doneAt: 0, card: null })), cur: 0,
      promise: { text: o.promise || '', at: o.promise ? now : 0 },
      xp: CFG.startXp, n: 0, earned: 0, life: 0, trinkets: 0, unseen: 0, parts: [], patches: 0, stat: blankStat(),
      lastTick: now, awakeUntil: now + CFG.awakeDays * DAY * (o.promise ? 1 : CFG.noPromise), freshUntil: 0, lastAdvAt: 0, stageAdv: 0, adv: 0, welcome: null,
    };
    s.goal = g; return g;
  }

  /* 等级：由这一段攒下的见闻推出来 */
  function levelInfo(xp) {
    let lv = 0, left = xp, need = CFG.levelBase;
    while (lv < CFG.maxLevel && left >= need) { left -= need; lv++; need = CFG.levelBase + CFG.levelStep * lv; }
    return { level: lv, into: lv >= CFG.maxLevel ? 0 : left, need: lv >= CFG.maxLevel ? 0 : need, max: lv >= CFG.maxLevel };
  }
  const levelOf = g => levelInfo(g.xp).level;
  const baseRate = s => { const g = s.goal; return (CFG.rateBase + CFG.rateLevel * levelOf(g)) * Math.pow(CFG.stageMul, g.cur) * (1 + CFG.bondBonus * s.bond) * (1 + CFG.trinketBonus * g.trinkets); };
  const isAwake = (g, now) => now < g.awakeUntil;
  const isFresh = (g, now) => now < g.freshUntil;
  const rate = (s, now) => isAwake(s.goal, now) ? baseRate(s) * (isFresh(s.goal, now) ? CFG.freshMul : 1) : 0;
  const trinketCost = g => CFG.trinketCost * Math.pow(CFG.trinketGrow, g.trinkets);

  /* 把 lastTick 到 now 之间它自己攒的好奇心结算掉，顺便算它出门捡了几样东西 */
  function tick(s, now) {
    const g = s.goal; if (!g || now <= g.lastTick) return 0;
    let t = g.lastTick, found = 0; const end = Math.min(now, g.awakeUntil);
    for (let guard = 0; t < end && guard < 400; guard++) {
      const fresh = t < g.freshUntil, segEnd = fresh ? Math.min(end, g.freshUntil) : end;
      const r = baseRate(s) * (fresh ? CFG.freshMul : 1) / HOUR, need = trinketCost(g) - g.n;
      if (need <= 0) { g.n -= trinketCost(g); g.trinkets++; found++; continue; }
      const dt = need / r;
      if (t + dt <= segEnd) { g.n += need; g.earned += need; g.life += need; t += dt; }
      else { const gain = (segEnd - t) * r; g.n += gain; g.earned += gain; g.life += gain; t = segEnd; }
    }
    while (g.n >= trinketCost(g)) { g.n -= trinketCost(g); g.trinkets++; found++; }
    g.unseen += found; g.lastTick = now; return found;
  }

  const dayKey = (ms, tz) => Math.floor((ms - (tz || 0) * 60e3) / DAY);
  const gapDays = (g, now) => g.lastAdvAt ? Math.max(0, (now - g.lastAdvAt) / DAY) : 0;
  function litterMul(s, now) { const L = CFG.litter, d = Math.min(gapDays(s.goal, now), L.capDays); return 1 + L.k * Math.sqrt(Math.max(0, d - L.free)); }
  function sameDayFactor(s, now, tz) {
    const g = s.goal, k = dayKey(now, tz), c = s.logs.filter(l => l.goalId === g.id && dayKey(l.at, tz) === k).length;
    return c < CFG.sameDay.length ? CFG.sameDay[c] : 0;
  }
  const scaled = (base, f, mult) => f === 0 ? 1 : Math.max(1, Math.round(base * f * mult));
  function preview(s, now, size, tz) { const mult = litterMul(s, now), f = sameDayFactor(s, now, tz); return { xp: scaled(CFG.xp[size], f, mult), mult, factor: f, gap: gapDays(s.goal, now) }; }

  function addXp(s, n) {
    const g = s.goal, a = levelInfo(g.xp);
    if (a.max) { g.n += n * CFG.overflowHours * baseRate(s); return false; }   // 满级后，见闻直接变成好奇心
    g.xp += n; return levelOf(g) > a.level;
  }
  /* 讲述：告诉它这次做了什么 */
  function report(s, now, { text, size, tz }) {
    const g = s.goal; tick(s, now);
    const p = preview(s, now, size, tz), patched = !!g.lastAdvAt && p.gap >= CFG.patchGap && g.patches < 2;
    if (patched) g.patches++;
    const up = addXp(s, p.xp);
    g.lastAdvAt = now; g.stageAdv++; g.adv++; g.stat[size]++; g.welcome = null;
    g.awakeUntil = Math.max(g.awakeUntil, now + CFG.awakeDays * CFG.noPromise * DAY);
    const log = { id: 'l' + now.toString(36) + g.adv, goalId: g.id, stage: g.cur, at: now, text, size, reply: '', q: '', a: '', next: '', xp: p.xp, mult: p.mult, factor: p.factor, gap: p.gap, patched };
    s.logs.push(log); return { log, up };
  }
  /* 回答它问的那一句 */
  function answer(s, now, logId, q, a) {
    const log = s.logs.find(l => l.id === logId); if (!log || log.a) return { xp: 0, up: false };
    const add = scaled(CFG.xp.answer, log.factor, log.mult); log.q = q; log.a = a; log.xp += add; s.goal.stat.ans++;
    return { xp: add, up: addXp(s, add) };
  }
  /* 约定下一步。跟在一次讲述后面的约定才有见闻；单独改约定只会让它醒足 3 天 */
  function promise(s, now, text, logId) {
    const g = s.goal; tick(s, now); text = text.trim(); g.promise = { text, at: now }; g.welcome = null;
    let add = 0, up = false; const log = logId && s.logs.find(l => l.id === logId);
    if (text && log && !log.next) { add = scaled(CFG.xp.promise, log.factor, log.mult); log.next = text; log.xp += add; up = addXp(s, add); }
    if (text && g.lastAdvAt) g.awakeUntil = Math.max(g.awakeUntil, g.lastAdvAt + CFG.awakeDays * DAY);
    return { xp: add, up };
  }

  const bondGain = g => g.stageAdv > 0 ? Math.max(1, Math.floor(Math.sqrt(g.earned / CFG.bondDiv))) : 0;
  /* 这一段你是怎么做的，决定它长出什么 */
  function pickPart(g) {
    const st = g.stat, n = Math.max(1, st.s + st.m + st.l);
    const score = { eyes: st.ans / n * 1.2, horns: st.l / n, wings: st.s / n, antenna: st.m / n * 0.9, tail: 0.3, plates: 0.25 };
    return CFG.parts.filter(p => !g.parts.includes(p)).sort((a, b) => score[b] - score[a])[0] || null;
  }
  const lookOf = g => ({ name: g.name, shape: g.shape, hue: g.hue, kind: g.kind, stage: g.cur, level: levelOf(g), parts: g.parts.slice(), patches: g.patches });
  function settle(s, now, result, extra) {
    const g = s.goal;
    s.habitat.push(Object.assign({ id: g.id, title: g.title, look: lookOf(g), createdAt: g.createdAt, endedAt: now, result, adv: g.adv, trinkets: g.trinkets,
      miles: g.miles.map(m => ({ name: m.name, doneAt: m.doneAt, card: m.card })) }, extra || {}));
    s.goal = null;
  }
  /* 这一段做完了：蜕变。返回 {bond, part, done} */
  function molt(s, now, card) {
    const g = s.goal; tick(s, now); const bond = bondGain(g), part = pickPart(g);
    s.bond += bond; if (part) g.parts.push(part);
    const m = g.miles[g.cur]; m.doneAt = now; m.card = Object.assign({ bond, part, adv: g.stageAdv }, card || {});
    g.cur++; g.welcome = null;
    const done = g.cur >= g.miles.length;
    if (done) { g.xp = 0; settle(s, now, 'grown'); }
    else { g.xp = 0; g.earned = 0; g.stageAdv = 0; g.stat = blankStat(); g.freshUntil = now + CFG.freshDays * DAY; g.lastTick = now; }
    return { bond, part, done };
  }
  /* 体面地放下：放归野外，羁绊照拿 */
  function release(s, now, reason) { const g = s.goal; tick(s, now); const bond = bondGain(g); s.bond += bond; settle(s, now, 'released', { reason: reason || '' }); return { bond }; }

  const api = { DAY, HOUR, get CFG() { return CFG; }, configure, create, newGoal, levelInfo, levelOf, baseRate, rate, isAwake, isFresh, trinketCost, tick,
    dayKey, gapDays, litterMul, sameDayFactor, preview, report, answer, promise, bondGain, pickPart, lookOf, molt, release };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Pet = api;
})(typeof window !== 'undefined' ? window : globalThis);
