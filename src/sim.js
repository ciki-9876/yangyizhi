const P = require('./pet.js'); const DAY = P.DAY;
function run(name, days, pat, moltEvery = 14) {
  P.configure(); const s = P.create(); let now = 1.7e12;
  P.newGoal(s, now, { title: 't', name: 'x', miles: [1, 2, 3, 4, 5].map(i => ({ name: 'm' + i })), promise: 'x' });
  const o = { name, adv: 0, xp: 0, asleep: 0, maxMult: 1, snaps: [], bond: [], parts: [], lastMolt: 0 };
  for (let d = 0; d < days && s.goal; d++) {
    now += DAY; if (!P.isAwake(s.goal, now - 1)) o.asleep++;
    const a = pat(d);
    if (a) {
      const r = P.report(s, now, { text: 'x', size: a.size || 'm', tz: 0 }); o.adv++; o.maxMult = Math.max(o.maxMult, r.log.mult);
      if (a.ans !== false) P.answer(s, now, r.log.id, 'q', 'a');
      if (a.next !== false) P.promise(s, now, 'next', r.log.id);
      o.xp += r.log.xp;
      if (d - o.lastMolt >= moltEvery && s.goal.cur < 4) { const m = P.molt(s, now); o.bond.push(m.bond); o.parts.push(m.part); o.lastMolt = d; }
    } else P.tick(s, now);
    if ([6, 13, 29, 59].includes(d) && s.goal) o.snaps.push(`D${d + 1}:Lv${P.levelOf(s.goal)} 捡${s.goal.trinkets} ${Math.round(P.baseRate(s))}/时`);
  }
  o.bondTotal = s.bond; o.patches = s.goal ? s.goal.patches : '-'; return o;
}
const pats = {
  '每天': d => ({}), '每天·敷衍': d => ({ size: 's', ans: false, next: false }), '隔天': d => d % 2 === 0 ? {} : null, '三天一次': d => d % 3 === 0 ? {} : null,
  '周末两天·大块': d => (d % 7 === 5 || d % 7 === 6) ? { size: 'l' } : null, '断两周再回来': d => (d < 10 || d >= 24) ? {} : null, '每周一次': d => d % 7 === 0 ? { size: 'l' } : null,
};
console.log('节奏 | 讲述 | 见闻/天 | 睡着的天 | 最高攒话 | 羁绊 | 长出的部位 | 补丁 | 快照');
for (const [k, f] of Object.entries(pats)) { const r = run(k, 60, f); console.log([k, r.adv, (r.xp / 60).toFixed(2), r.asleep, '×' + r.maxMult.toFixed(2), r.bondTotal + ' [' + r.bond + ']', r.parts.join(','), r.patches, r.snaps.join('  ')].join(' | ')); }
const line = []; for (const g of [1, 2, 3, 5, 7, 10, 14, 21, 30]) { const r = run('g', 120, d => d % g === 0 ? {} : null, 999); line.push(g + '天:' + (r.xp / 120).toFixed(2)); }
console.log('间隔 → 每天平均见闻（应单调下降）\n' + line.join('  '));
