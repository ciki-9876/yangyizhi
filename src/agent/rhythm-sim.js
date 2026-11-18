// 节奏引擎 60 天模拟：node src/agent/rhythm-sim.js
// 检查：每天最多 1 条、不落在安静时段、每次离开最多 4 条且间隔变长、回来后重新计数、只提醒约定时每次离开最多 1 条。
const R = require('./rhythm.js');
const DAY = 864e5, HOUR = 36e5, TZ = -480;                       // 东八区
const T0 = Date.UTC(2026, 10, 2, 0, 0) + TZ * 60000;            // 本地 11/2 00:00
const lday = t => R.localDay(t, TZ), lh = t => R.localHour(t, TZ);

function run(name, acts, settings) {
  // acts(day) → null | { hour, report: bool }
  const st = Object.assign({ on: true, quiet: [22, 9], dueOnly: false }, settings);
  const g = { promiseText: '', promiseAt: 0, awakeUntil: T0 + 3 * DAY, lastAdvAt: 0, createdAt: T0 };
  let lastActive = T0, sent = [], queue = [], reps = [];
  const replan = now => { queue = R.plan({ now, tz: TZ, goal: g, settings: st, reports: reps, lastActive, sent }); };
  replan(T0);
  for (let d = 0; d < 60; d++) {
    const a = acts(d);
    for (let h = 0; h < 24; h++) {
      const t = T0 + d * DAY + h * HOUR;
      while (queue.length && queue[0].at <= t) sent.push(queue.shift());           // 应用关着，系统照常把排好的通知发出去
      if (a && a.hour === h) {
        lastActive = t;
        if (a.report) { g.lastAdvAt = t; g.promiseText = '下一小步'; g.promiseAt = t + 60000; g.awakeUntil = t + 3 * DAY; reps.push(t); if (reps.length > 10) reps.shift(); }
        replan(t + 120000);
      }
    }
  }
  // 检查
  const perDay = {}; let bad = [];
  for (const s of sent) { const k = lday(s.at); perDay[k] = (perDay[k] || 0) + 1; if (R.inQuiet(lh(s.at), st.quiet)) bad.push('quiet@' + new Date(s.at).toISOString()); }
  if (Object.values(perDay).some(n => n > 1)) bad.push('>1/day');
  // 每段离开（两次打开之间）最多 4 条
  const opens = []; for (let d = 0; d < 60; d++) { const a = acts(d); if (a) opens.push(T0 + d * DAY + a.hour * HOUR); }
  opens.push(T0 + 61 * DAY);
  let prev = T0, maxRun = 0;
  for (const o of opens) { const n = sent.filter(s => s.at > prev && s.at <= o); maxRun = Math.max(maxRun, n.length);
    for (let i = 2; i < n.length; i++) if (n[i].at - n[i - 1].at < n[i - 1].at - n[i - 2].at) bad.push('gap shrinks');
    if (st.dueOnly && n.length > 1) bad.push('dueOnly>1'); prev = o; }
  if (maxRun > R.MAX) bad.push('run>' + R.MAX);
  const show = sent.slice(0, 8).map(s => 'D' + (lday(s.at) - lday(T0)) + '@' + lh(s.at) + ':' + s.kind).join(' ');
  console.log((bad.length ? '✗ ' : '✓ ') + name.padEnd(16) + ' 共 ' + String(sent.length).padStart(2) + ' 条，单次离开最多 ' + maxRun + '  ' + show + (bad.length ? '  ' + [...new Set(bad)].join(',') : ''));
  return bad.length === 0;
}

const ok = [
  run('每天都来', d => ({ hour: 21, report: true })),
  run('每三天来', d => d % 3 === 0 ? { hour: 20, report: true } : null),
  run('第3天后消失', d => d < 3 ? { hour: 20, report: true } : null),
  run('消失后第20天回', d => d < 3 || d === 20 ? { hour: 20, report: d < 3 } : null),
  run('深夜党', d => d < 4 ? { hour: 23, report: true } : null),
  run('只打开不讲', d => d < 2 ? { hour: 12, report: true } : d % 2 === 0 ? { hour: 12, report: false } : null),
  run('只提醒约定', d => d < 3 || d === 15 ? { hour: 20, report: true } : null, { dueOnly: true }),
  run('关掉提醒', d => d < 3 ? { hour: 20, report: true } : null, { on: false }),
].every(Boolean);
process.exit(ok ? 0 : 1);
