/* 节奏引擎：决定它什么时候来找你。纯函数，时间和时区都从外面传进来，可以用 node src/agent/rhythm-sim.js 模拟。
 *
 * 规则（与 docs/dev-plan.md M4 一致）：
 * - 每次你离开后，最多来找你 4 次：约定的第二天（或你上次打开后第 2 天），然后依次隔 2、4、7 天；之后停发，它就安心睡了。
 * - 最近 7 天来了 5 天以上的人不提醒约定；同一个约定只提醒一次。
 * - 你一打开应用，计数清零。
 * - 每天最多 1 条；避开安静时段；时间点取你平时讲述的钟点（中位数），没有记录就用晚上 8 点。
 * - 只提醒约定：只发第一条（约定到期那天）。
 * - 应用关着时 JS 不能运行，所以一次排好整串（最多 4 条），下次打开时全部取消重排。 */
(function (root) {
  const DAY = 864e5, HOUR = 36e5, GAPS = [2, 4, 7], MAX = 4;

  const localDay = (t, off) => Math.floor((t - off * 60000) / DAY);
  const localHour = (t, off) => new Date(t - off * 60000).getUTCHours();
  const atLocal = (day, hour, off) => day * DAY + hour * HOUR + off * 60000;     // 某个本地日的某个整点，换回时间戳
  const inQuiet = (h, q) => q && q[0] !== q[1] && (q[0] < q[1] ? h >= q[0] && h < q[1] : h >= q[0] || h < q[1]);

  function prefHour(hours, quiet) {
    let h = 20;
    if (hours && hours.length) { const s = hours.slice().sort((a, b) => a - b); h = s[Math.floor(s.length / 2)]; }
    if (!inQuiet(h, quiet)) return h;
    const before = (quiet[0] + 23) % 24; if (!inQuiet(before, quiet)) return before;    // 安静时段开始前一小时
    return quiet[1];                                                                    // 或者安静时段结束那一刻
  }

  // 下一条：给定已经发出（或假设会发出）的提醒，算下一条的时间。返回 null 表示不再发。
  function next(x, sent) {
    const g = x.goal, st = x.settings || {}; if (!g || !st.on) return null;
    const off = x.tz || 0, quiet = st.quiet || [22, 9], h = prefHour((x.reports || []).map(r => localHour(r, off)), quiet);
    const since = sent.filter(s => s.at > (x.lastActive || 0)), k = since.length;
    if (k >= MAX) return null;
    let base, kind;
    if (k === 0) {
      const reps = x.reports || [], today = localDay(x.now || 0, off), days = new Set(reps.filter(r => today - localDay(r, off) < 7).map(r => localDay(r, off)));
      const regular = days.size >= 5;                                                   // 最近 7 天来了 5 天以上：不用提醒约定，它自己会来
      const dueUsed = sent.some(s => s.at > (g.promiseAt || 0));
      const due = !regular && !dueUsed && g.promiseText && g.promiseAt && (g.lastAdvAt || 0) <= g.promiseAt + HOUR ? atLocal(localDay(g.promiseAt, off) + 1, h, off) : 0;
      if (st.dueOnly) { if (!due) return null; base = due; kind = 'due'; }
      else if (due) { base = due; kind = 'due'; }
      else {
        const drowsy = g.awakeUntil ? atLocal(localDay(g.awakeUntil - DAY, off), h, off) : 0;
        base = Math.max(drowsy, atLocal(localDay(Math.max(x.lastActive || 0, g.createdAt || 0), off) + 2, h, off));
        kind = g.awakeUntil && base < g.awakeUntil ? 'drowsy' : 'sleep';
      }
    } else {
      if (st.dueOnly) return null;
      const last = since[since.length - 1].at;
      base = atLocal(localDay(last, off) + GAPS[k - 1], h, off);
      kind = g.awakeUntil && base < g.awakeUntil ? 'drowsy' : 'sleep';
    }
    // 不早于现在 + 5 分钟；同一天已经发过就挪到第二天；落在安静时段就挪到允许的钟点
    let t = Math.max(base, (x.now || 0) + 5 * 60000);
    if (inQuiet(localHour(t, off), quiet) || t !== base) {
      let d = localDay(t, off); t = atLocal(d, h, off); if (t < (x.now || 0) + 5 * 60000) t = atLocal(d + 1, h, off);
    }
    const lastAny = sent.length ? sent[sent.length - 1].at : 0;
    if (lastAny && localDay(lastAny, off) >= localDay(t, off)) t = atLocal(localDay(lastAny, off) + 1, h, off);
    return { at: t, kind, k };
  }

  // 一次排好整串
  function plan(x) {
    const sent = (x.sent || []).slice(), out = [];
    for (let i = 0; i < MAX; i++) { const n = next(x, sent); if (!n) break; out.push(n); sent.push({ at: n.at, kind: n.kind }); }
    return out;
  }

  const Rhythm = { plan, next, prefHour, inQuiet, localDay, localHour, MAX, GAPS };
  root.Agent = root.Agent || {}; root.Agent.Rhythm = Rhythm;
  if (typeof module !== 'undefined') module.exports = Rhythm;
})(typeof window !== 'undefined' ? window : globalThis);
