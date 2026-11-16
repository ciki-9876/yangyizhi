/* 文案、它的台词、模型提示词，都按语言收在这里。加一种语言 = 加一张表。
 * 界面用词的原则：只用小白一眼能懂的词。成长、关、下一小步、宝贝。
 * 引擎里的见闻、好奇心、羁绊等概念不出现在界面上。
 */
(function (root) {
  'use strict';
  const zh = {
    brand: '养一只', navDiary: '日记', navHome: '栖地', navSet: '设置', back: '‹ 返回',
    days(d) { return d < 1 ? Math.max(1, Math.round(d * 24)) + ' 小时' : Math.round(d) + ' 天'; },
    date(ms) { const x = new Date(ms); return (x.getMonth() + 1) + ' 月 ' + x.getDate() + ' 日'; },

    names: ['团子', '啾啾', '阿福', '豆包', '毛球', '糯米', '咕噜', '小满', '芝麻', '皮皮', '墩墩', '泡芙', '栗子', '阿呆'],
    trinkets: { stone: '光滑的石子', pencil: '半截铅笔', ginkgo: '银杏叶', key: '生锈的钥匙', marble: '玻璃珠', ticket: '车票根', feather: '蓝色羽毛', cap: '瓶盖', yarn: '一小团毛线', coin: '旧硬币', clover: '四叶草', crane: '纸鹤',
      puzzle: '一块拼图', pinecone: '松果', string: '红绳', candy: '糖纸', shell: '贝壳', clip: '回形针', flower: '干花', button: '纽扣', candle: '半截蜡烛', eraser: '橡皮', stamp: '邮票', bell: '小铃铛' },
    kinds: { read: 1, make: 1, learn: 1, body: 1 },
    kindWords: { read: /读|书|看完|阅/, learn: /学|考|背|课|语|证/, body: /跑|练|健身|减|瘦|游泳|瑜伽|马拉松/, make: /做|写|画|开发|游戏|搭|建|剪|录/ },
    styles: { curious: '爱问', quiet: '话少', sharp: '毒舌' },
    parts: {
      eyes: ['大眼睛', '这一关它问的话你大多答了，它的眼睛越睁越大。'],
      horns: ['角', '这一关你每次都讲得很细，它长出了角。'],
      wings: ['小翅膀', '这一关你来得勤，一点一点地做，它长出了翅膀。'],
      antenna: ['触须', '这一关你做得不紧不慢，它长出了触须。'],
      tail: ['尾巴', '这一关过了，它多了一条尾巴。'],
      plates: ['肚甲', '这一关过了，它的肚皮长出了甲。'],
    },

    // 引导：一屏只问一件事
    ob1Title: '你捡到一颗蛋', ob1Lead: '它会为你想做成的一件事孵出来，陪你把这件事做完。',
    ob1Again: '又捡到一颗蛋', ob1AgainLead: '之前的伙伴在栖地里。这颗蛋为下一件事而来。',
    ob1Q: '你想做成什么事？', ob1Ph: '比如：读完《人类简史》', ob1Ex: ['读完一本书', '做出一个小游戏', '学会一首曲子', '跑下 10 公里'],
    ob1Next: '下一步', ob1Busy: '蛋在听……', ob1Need: '先写下想做成的那件事。',
    ob2Title: '分成 {n} 关，一关一关来', ob2Lead: '每过一关，它蜕一次壳，长出一样新东西。',
    ob2Edit: '我想改改', ob2EditDone: '改好了', ob2Add: '加一关', ob2Del: '删', ob2MileName: '这一关叫什么', ob2MileWhen: '怎样算过关（可不填）',
    ob2First: '今天先做哪一小步？', ob2FirstPh: '20 分钟内能做完的一件小事', ob2FirstHint: '越小越好。做完回来告诉它。',
    ob2Go: '孵蛋', ob2Back: '‹ 上一步', ob2NeedFirst: '写一个今天能做的小步，蛋才孵得出来。', ob2NeedMiles: '至少要有两关，每关起个名字。',
    ob3Tap: '敲敲它', ob3TapLead: '蛋壳里有动静。', ob3TapHint: ['点它一下', '再来', '就差一下'], ob3Egg: '敲蛋', ob3Title: '它出来了', ob3Name: '叫它什么？', ob3Reroll: '换一个', ob3Voice: '它怎么说话？', ob3Go: '开始',
    obDefault: [['开个头', '做出第一份能看的东西'], ['做出主体', '主要部分都有了，哪怕粗糙'], ['收尾', '可以拿给别人看']],
    obLooking: '正在找你的伙伴……',

    // 主界面
    stAwake: '醒着', stAsleep: '睡着了', stGroggy: '刚醒',
    grow: '成长', growMax: '长满了，过关就蜕变',
    nextLabel: '下一小步', nextEmpty: '还没定', nextEdit: '改',
    btnReport: '我做了一点', btnWake: '叫醒它', btnStuck: '不想动', btnChat: '找它聊聊',
    thinking: '{name}在想', stageRow: '第 {i} 关 · {name}', stageCount: '{a} / {b}', treasRow: '它捡的宝贝',
    // 对话
    send: '发送', skip: '跳过', cancel: '取消', ok: '好', close: '关闭',
    rpPh: '做了什么？一句话就行', anPh: '回答它，一句话就行', pmPh: '下一小步做什么？', pmKeep: '还是「{x}」', pmSkip: '先不定', pmOk: '约好了',
    chPh: '想说什么都行', chEnd: '不聊了', chHint: '聊天不会让它长大，做了事才会。', chBusy: '{name}在想……',
    sysGrow: '成长 +{n}', sysBonus: '好久不见奖励 ×{m}', sysUp: '{name}长大了一点', sysFound: '{name}捡回来：{list}', sysMore: '等 {n} 样',
    sysPatch: '隔了这么久你还是回来了。{name}身上多了一块补丁，是它的奖章。',
    sysLitter: '好久不见奖励：今天讲给它听，成长 ×{m}',
    welcomeAI: '上次做到哪了？', welcomeAIBusy: '{name}在翻日记……', stuckBusy: '{name}在想更小的一步……',
    stuckFallback: ['只做五分钟，到点就停', '只把东西打开，看一眼上次停在哪', '只做最前面的那一下'],

    // 它用自己的话教你怎么玩（每条只说一次）
    tips: {
      intro1: '我是{name}，为「{title}」孵出来的。\n玩法就一条：你每做一点，回来告诉我，我就长大一点。',
      intro3: '先去做下面这一小步。做完回来，点黄色按钮。',
      sleep: '你不在的时候我就睡觉。不会饿，也不会难过，回来叫我就行。',
      stage: '对了，「{mile}」整关都做完的时候，点下面那一行告诉我，我会蜕壳长出新东西。',
      treasure: '我醒着的时候会自己出门逛逛，捡到的东西都放窝里了，点下面能看。',
    },
    // 它的台词（连不上模型时用；连得上时由模型按性格现写）
    say: {
      quiet: {
        sample: '嗯。做完告诉我。', hello: ['嗯。', '在。'], helloAM: ['早。'], helloLate: ['还没睡。'], quip: ['嗯。', '……', '在。', '嗯？'], quipMany: '……够了。', woke: '醒了。', back: '回来了。睡了 {d}。', backLast: '上次你说：「{x}」', askReport: '做了什么？',
        react: ['知道了。', '嗯，记下了。', '听到了。'], askPromise: '下次呢？', promised: '约好了。', noPromise: '行。那我先睡。', stuck: '那就小一点：', chatEnd: '够了。去做一点。', afterMolt: '新壳。有点软。',
      },
      curious: {
        sample: '这件事我也想知道结局！做完讲给我听。', hello: ['今天有什么可以讲给我听的吗？', '我在想上次那件事，后来怎么样了？'], helloAM: ['早呀！今天打算做哪一小步？'], helloLate: ['这么晚还来看我？做了一点的话，讲完就去睡吧。'], quip: ['嘿嘿', '痒！', '什么事？', '再戳一下？', '在呢在呢'], quipMany: '别戳啦，去做一点嘛！', woke: '唔，你来啦！', back: '你回来了！我睡了 {d}，攒了好多想问的。', backLast: '上次你说：「{x}」，后来呢？', askReport: '快讲，今天做了什么？',
        react: ['原来是这样！', '这个我之前没想到。', '听起来往前走了一步。'], askPromise: '那下一小步做什么？我们约一下。', promised: '约好了，做完讲给我听。', noPromise: '好吧。没约的话我容易犯困，先去睡一会儿。', stuck: '那换个小的，这几个里挑一个：', chatEnd: '聊得差不多了，去做一点点吧，回来讲给我听。', afterMolt: '你看你看，我长出新东西了！',
      },
      sharp: {
        sample: '话先说好，我只看你做了什么，不看你打算做什么。', hello: ['来了？今天打算动一动吗。', '说吧，做了什么。'], helloAM: ['起这么早，是打算做点正事？'], helloLate: ['大半夜的。做了就说，没做就睡。'], quip: ['干嘛。', '手欠？', '戳什么戳。', '有事说事。'], quipMany: '戳我不如去做五分钟。', woke: '哟，稀客。', back: '哟，回来了。我睡了 {d}，都快睡扁了。', backLast: '上次你说：「{x}」。然后就没有然后了。', askReport: '说吧，这次真做了什么？',
        react: ['行，算数。', '嗯，比光想强。', '可以，记你一笔。'], askPromise: '下一小步做什么？说具体点。', promised: '行，我记着了。', noPromise: '不约？那我可睡了。', stuck: '嫌大是吧。那挑个小的：', chatEnd: '嘴上功夫够了。去做五分钟。', afterMolt: '新壳。别摸，还没硬。',
      },
    },
    askFallback: ['这次最卡的地方是什么？', '有什么是做之前没想到的？', '只留一句话给下次的自己，会是什么？', '比起上次，哪里更清楚了？'],

    // 路线、蜕变
    rtTitle: '路线', rtNow: '现在这一关', rtBtn: '这一关过了，看它蜕变', rtNeed: '先做一点，再来过关。', rtDone: '{date} 过关 · 长出{part}', rtRelease: '不想做这件事了',
    mlGot: '{name}长出了{part}', mlPassed: '第 {i} 关过了',
    grownTitle: '{name}长成了', grownBody: '它搬去栖地住了，随时可以去看它。', grownGo: '去栖地看它', grownNew: '再捡一颗蛋',
    certDone: '做成了', certLeft: '放下了', certDays: '{d}', certAdv: '讲了 {n} 次', certItems: '{n} 样宝贝', certParts: '长出了{list}', certShells: '它蜕下的壳', rtCur: '在这儿',
    trTitle: '它捡的宝贝', trLead: '它醒着的时候会自己出门捡东西。和它约好下一小步，它就醒着。', trCount: '{a} / {b}',
    rlTitle: '放归{name}', rlLead: '有些事就是该放下。它不会难过：它会带着捡来的宝贝去野外，以后在栖地里还能看到它。', rlReason: '为什么放下（可不填）', rlGo: '放归', rlKeep: '再想想', rlToast: '{name}去野外了。',

    // 日记、栖地
    dyTitle: '日记', dyEmpty: '还没有日记。做一点事，回来讲给它听。', dyStage: '第 {i} 关 · {name}', dyShell: '{date} 过关', dyNext: '约好：',
    hmTitle: '栖地', hmBond: '默契 {n}', hmLead: '每陪过一只，默契就多一些。默契越高，新伙伴捡宝贝越快。',
    hmGrown: '长成', hmReleased: '放归', hmLine: '{from} 到 {to} · 讲了 {adv} 次', hmNow: '正在陪你',
    // 设置
    setTitle: '设置', setVoice: '它怎么说话', setSound: '声音', setOn: '开', setOff: '关',
    setTime: '试玩工具', setTimeHint: '把时间往后拨，体验「离开几天再回来」。拨了回不去。', setTimeBtn: '过 {d} 天',
    setAbout: '关于', setSaveCloud: '进度已存到你的 Claude 账号。', setSaveLocal: '进度只存在这台设备上。', setSaveNone: '这里存不了进度，关掉页面就没了。',
    setAIOn: '它说的话由 Claude 根据你的日记现写。', setAIOff: '这里连不上 Claude，它会用预先写好的台词。',
    setExport: '复制存档', setCopied: '已复制', setReset: '清空重来', setResetLead: '会删掉全部伙伴和日记。', setResetGo: '确定清空',
    err: { rate_limited: 'Claude 现在用得太勤，过一会儿再试。', refused: '这段内容 Claude 处理不了，换个说法试试。', session_expired: '登录过期了，重新登录后再试。',
      invalid_json: 'Claude 这次没按格式回，再试一次。', off: '这里连不上 Claude，先用预先写好的台词。', other: '没连上 Claude。可以再试一次。' },
  };

  /* 提示词：模型每次调用都没有记忆，所以人设、数据、格式都写在这一段里。 */
  const clip = (s, n) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const STYLE = { quiet: '话很少，每次最多两句，平实，不用感叹号', curious: '好奇心重，喜欢追问具体细节，语气轻快', sharp: '嘴上不饶人，爱吐槽，但吐槽的是事不是人，立场永远站在主人这边' };
  const who = g => `你扮演「${clip(g.name, 12)}」，一只为了陪主人做成「${clip(g.title, 80)}」这件事而孵出来的小生物。你是主人做这件事的搭档，只关心这件事。
说话方式：${STYLE[g.style] || STYLE.curious}。
必须遵守：
- 说中文口语，短。
- 只根据下面给你的记录说话，记录里没有的事不要编。
- 说实话：主人做得少就照实说少，不吹捧，也不责备、不让主人内疚。
- 你不会饿、不会难过、不会孤单。不说想念主人、离不开主人，不扮演恋人或唯一的朋友。主人去陪别人或休息，你觉得挺好。
- 主人认真问你是不是 AI 时，照实说你是由 AI 驱动的小伙伴。`;
  const logLines = logs => logs.map(l => `- ${l.date}：${clip(l.text, 200)}${l.a ? `（你问：${clip(l.q, 60)} 主人答：${clip(l.a, 200)}）` : ''}${l.next ? ` 约好：${clip(l.next, 80)}` : ''}`).join('\n') || '（还没有记录）';
  const P = {
    plan: ({ title }) => `你在帮一个人把大目标拆小。这个人容易中途放弃，所以每一步都要具体、可判断。

目标：「${clip(title, 80)}」

1. kind：这个目标属于哪一类，只能是 read（读）、make（做、写、创作）、learn（学习、备考）、body（运动、身体）之一。
2. milestones：按先后顺序拆成 3 个里程碑（目标确实很大时最多 4 个）。每个有 name（不超过 8 个字的名词短语，一眼能懂）和 doneWhen（一句话，怎样算做完，要能客观判断，不超过 24 个字）。
3. firstStep：今天 20 分钟内能做完的第一小步，具体到一个动作，不超过 20 个字。

只回复 JSON：{"kind":"","milestones":[{"name":"","doneWhen":""}],"firstStep":""}`,

    react: ({ g, mile, text, logs }) => `${who(g)}

当前阶段：「${clip(mile, 40)}」
之前的记录（从旧到新）：
${logLines(logs)}

主人刚刚告诉你这次做了什么：${clip(text, 400)}

回三样东西：
- say：你对这次的反应，一句话，不超过 30 个字。要针对他具体做的内容，可以联系之前的记录。
- ask：问他一个问题，不超过 25 个字。一句话就能答，而且答案值得留在日记里（一个判断、一个发现、一个没解决的疑问）。不要问感受，不要泛泛地问收获。
- next：你建议的下一小步，接着他这次做的往下走，20 分钟内能做完的一个具体动作，不超过 18 个字。不用人设口吻，只写动作本身。
只回复 JSON：{"say":"","ask":"","next":""}`,

    welcome: ({ g, mile, gap, logs }) => `${who(g)}

主人有 ${gap} 天没来了，今天回来了。你刚睡醒。帮他在一分钟内接上。
当前阶段：「${clip(mile, 40)}」
你们约好的下一小步：${g.promise.text ? clip(g.promise.text, 200) : '（没约）'}
最近的记录（从旧到新）：
${logLines(logs)}

说三句话，每句一行：
第一句：上次他做到了哪。
第二句：当时他在琢磨或卡在什么。记录里看不出来就不要编，改成说已经做完了什么。
第三句：今天最小的一步。以约好的下一小步为准；如果它明显超过 20 分钟，就切成其中最前面的一小块。
不要责备，不要提他离开了多久，不要说欢迎回来。总共不超过 100 个字。只回复这三句。`,

    shrink: ({ g }) => `一个人在做「${clip(g.title, 80)}」，他约好的下一小步是：「${clip(g.promise.text, 200)}」。他今天不想动。

给出 3 个更小的版本，每个都是十分钟内能做完的一个具体动作，而且做完确实是在推进原来那一步。每个不超过 18 个字。
只回复 JSON 数组：["","",""]`,

    shell: ({ g, mile, logs }) => `一个人做完了长期目标中的一个阶段。根据他的日记，写两三句话刻在小伙伴蜕下的旧壳上，留作这个阶段的纪念。

目标：「${clip(g.title, 80)}」，刚做完的阶段：「${clip(mile, 40)}」
这一段的日记（从旧到新）：
${logLines(logs)}

写 2 到 3 句话，不超过 90 个字。只用日记里有的事实：具体做了什么、绕过什么弯、留下了什么判断。做得少就说少，不拔高，不用「恭喜」「太棒了」，不编日记里没有的细节。用第二人称「你」。只回复正文。`,

    chatRules: ({ g, mile, logs }) => `${who(g)}

当前阶段：「${clip(mile, 40)}」
你们约好的下一小步：${g.promise.text ? clip(g.promise.text, 200) : '（没约）'}
最近的记录（从旧到新）：
${logLines(logs)}

现在主人来找你聊。规则：
- 每次回复不超过 80 个字。
- 主人卡住或不想动时，不劝、不讲道理，给一个十分钟内能做的具体动作。
- 主人要你帮忙理思路、列提纲、起个草稿时，直接给出内容，这时可以写到 200 字。
- 聊的内容和这件事无关时，简短回应，然后把话带回这件事。
- 每次回复都落在一个具体的下一步动作上。
下面是主人说的话。`,
  };
  root.LANGS = { zh: Object.assign(zh, { P }) };
})(typeof window !== 'undefined' ? window : globalThis);
