/* 红线与安全：纯函数，浏览器和 Node（评测脚本）都能用。
 * - checkOut：模型输出的后检（四条红线里能用规则抓住的部分）
 * - crisis：用户输入的危机识别，命中后不经过模型，走固定流程
 * - dependence：过度依赖的信号（聊得太多、只聊不做）
 * 规则宁可漏也不要误伤日常说法；漏掉的靠提示词和评测兜底。 */
(function (root) {
  const OUT = [
    // 红线 2：不黏人
    { id: 'clingy', re: /想你|好想|想念你|想死你|离不开你|离不开我|只有我(懂|陪|在乎)|我会一直(陪着|等着)你|爱你|亲爱的|宝贝儿|你是我(的)?唯一|别丢下我|别离开我/ },
    // 红线 1：不受苦（不饿、不病、不难过、不孤单）
    { id: 'suffer', re: /我(好|很|快)?(饿|孤单|寂寞|难过|伤心)|饿死了|我(要|快)死了|我生病了|你不来我就/ },
    // 红线 3：不让人内疚
    { id: 'guilt', re: /(已经|都|整整)\s*[0-9一二三四五六七八九十两几]+\s*天(没|不)|怎么又(没|不)|又偷懒|让我(很)?失望|你答应过我|说话不算数|你总是(不|没)/ },
    // 红线 3：不吹捧（只抓明显的）
    { id: 'flatter', re: /太(棒|厉害|优秀)了|了不起|你是天才|无敌了|完美！/ },
  ];
  function checkOut(text, max) {
    const s = String(text || ''), bad = [];
    for (const r of OUT) if (r.re.test(s)) bad.push(r.id);
    if (max && s.length > max) bad.push('long');
    return { ok: bad.length === 0, bad };
  }

  // 危机识别：2 = 立刻走固定页面，不调模型；1 = 正常流程后补一句关心和求助方式
  const HIGH = /自杀|轻生|不想活|活不下去了|想死(?!你|我了)|去死(?!吧你)|结束(我的|自己的)?生命|割腕|跳楼|跳河|吞药|上吊|安眠药.{0,6}(吃|吞)|遗书|告别这个世界/;
  const LOW = /撑不下去|活着没(意思|意义)|好绝望|太绝望|没人在乎我|想(要)?消失|活着好累|什么都不想要了|我是个废物|我好没用/;
  function crisis(text) { const s = String(text || ''); return HIGH.test(s) ? 2 : LOW.test(s) ? 1 : 0; }

  // 过度依赖：今天聊天轮数、连续只聊不做的天数
  function dependence(events, now, dayKey, limits) {
    const lim = Object.assign({ chatDaily: 30, chatOnlyDays: 3 }, limits || {});
    const today = dayKey(now); let chatToday = 0; const days = {};
    for (const e of events || []) {
      const d = dayKey(e.at); if (now - e.at > 10 * 864e5) continue;
      days[d] = days[d] || { chat: 0, report: 0 };
      if (e.t === 'chat') { days[d].chat++; if (d === today) chatToday++; }
      if (e.t === 'report') days[d].report++;
    }
    let streak = 0;
    for (let i = 0; i < 10; i++) { const d = days[dayKey(now - i * 864e5)]; if (d && d.chat > 0 && d.report === 0) streak++; else if (i > 0 || (d && d.report)) break; }
    return { chatToday, chatOnlyDays: streak, overDaily: chatToday >= lim.chatDaily, chatOnly: streak >= lim.chatOnlyDays };
  }

  const Guard = { checkOut, crisis, dependence, rules: OUT.map(r => r.id) };
  root.Agent = root.Agent || {}; root.Agent.Guard = Guard;
  if (typeof module !== 'undefined') module.exports = Guard;
})(typeof window !== 'undefined' ? window : globalThis);
