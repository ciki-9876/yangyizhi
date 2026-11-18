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
    setBrain: '它的脑子', setAIOn: '它说的话由 {who} 根据你的日记现写。', setAIOff: '现在没接大模型，它会用预先写好的台词，也不能自由聊天。',
    obLLM: '有大模型 API 密钥？接上后它会帮你拆关、陪你聊', llmConnect: '接入大模型', llmChange: '更换大模型',
    llmTitle: '接入大模型', llmLead: '填上你自己的 API 密钥，它就能读你的日记、现编台词、陪你聊。密钥只存在这台设备上，只发给下面这个地址。',
    llmProvider: '服务商', llmNoDirect: '这家通常不允许网页直接调用。测试连不上的话，要先部署一个代理（见仓库 proxy/），再选「自建代理」。',
    llmBase: '接口地址', llmBaseHint: '你的代理地址，或任何 OpenAI 兼容接口，一般以 /v1 结尾。', llmKey: 'API 密钥', llmKeyOpt: '代理不需要可以留空', llmKeyHint: '只存在这台设备的浏览器里，「复制存档」不会带上它。',
    llmModel: '模型', llmModelPh: '模型名，见服务商文档', llmModelHint: '模型名以服务商文档为准：{url}', llmQuick: '快速模型（可不填）', llmQuickPh: '用于短回复，不填就用上面那个',
    llmProto: '接口协议', llmProtoOpenAI: 'OpenAI 兼容', llmProtoAnthropic: 'Anthropic',
    llmTest: '测试连接', llmSave: '测试并启用', llmTesting: '正在连……', llmOk: '连上了，{ms} 毫秒。', llmSaved: '已启用 {who}，{ms} 毫秒。之后它说的话由这个模型现写。',
    llmOff: '断开，改回预写台词', llmOffDone: '已断开外部模型',
    llmNeedBase: '接口地址要以 http:// 或 https:// 开头。', llmMixed: '这个页面是 https，浏览器不允许它调用 http 地址。换成 https 的地址。', llmNeedModel: '还没填模型名。', llmNeedKey: '还没填 API 密钥。',
    llmEAuth: '密钥不对，或者没有这个模型的权限。', llmENotFound: '地址或模型名不对。', llmERate: '请求太勤了，过一会儿再试。', llmEQuota: '账户余额或额度不够。',
    llmENetwork: '连不上。多半是这家不允许网页直连（跨域被拦），需要走代理；也可能是地址写错或网络不通。', llmETimeout: '等了太久没回。', llmEUpstream: '服务商那边出错了，过会儿再试。', llmERefused: '模型拒绝回答这段内容。', llmEOther: '没连上。',
    setExport: '复制存档', setCopied: '已复制', setReset: '清空重来', setResetLead: '会删掉全部伙伴和日记。', setResetGo: '确定清空',
    // —— Agent 基建（M1–M7） ——
    memLabels: { progress: '做到哪了', stuck: '反复卡住的地方', rhythm: '你的节奏', promises: '说过的承诺', habits: '你通常怎么做事', returns: '断了之后怎么回来', likes: '你愿意答的追问' },
    memRule: { progress: '上次：', promises: '约好：' },
    memTitle: '它记得', memLead: '这些是它记得的事，跟你聊的时候会用上。不对的可以直接改；清空一栏，它就不会再写回去。', memGoalHead: '关于「{title}」', memUserHead: '关于你',
    memEmpty: '还没记下什么。讲几次之后，这里会出现它记得的事。', memSave: '保存', memSaved: '改好了', memClear: '全部忘掉', memClearDone: '它把记得的事都忘了', memSrc: { model: '由模型整理', rule: '按日记自动记下' },
    setMem: '它记得的事', setMemBtn: '看看它记得什么',
    setNudge: '提醒', setNudgeLead: '它会在约定的第二天、或者快睡着时来找你一下。你一直不理，它最多来 4 次就不来了。',
    setNudgeWeb: '提醒要在手机 App 里才能用。', setNudgeDenied: '系统没给通知权限。到手机设置里打开通知后，再回来开启。',
    setQuiet: '这段时间不打扰', quietOpts: [[[22, 9], '22 点到 9 点'], [[23, 8], '23 点到 8 点'], [[0, 0], '不限']], setDueOnly: '只在约定到期时提醒',
    setNudgeNext: '下一次：{when}', setNudgeNone: '目前没有排好的提醒。',
    nudgeAsk: '要不要到时候我来提醒你一下？最多一天一次，你不理我就不来了。', nudgeYes: '好，提醒我', nudgeNo: '不用', nudgeOn: '好，到时候叫你。', nudgeOff: '行，你自己来。',
    nudgeChannel: '它来找你', nudgeChannelDesc: '约定到期、它快睡着时的提醒', nudgeNoPromise: '随便做一点',
    nudgeTpl: {
      quiet: { due: '{promise}。就这个。', drowsy: '快睡了。{promise}，十分钟。', sleep: '睡了。回来从「{promise}」开始。' },
      curious: { due: '今天做「{promise}」吗？做完讲给我听。', drowsy: '我有点困了。要不先做十分钟「{promise}」？', sleep: '{name}在睡觉。哪天想起来，从「{promise}」开始就行。' },
      sharp: { due: '约好的「{promise}」，今天是个好日子。', drowsy: '再不动我就睡了。「{promise}」，十分钟。', sleep: '我睡了。醒来那天，从「{promise}」开始。' },
    },
    toolTimer: '陪你做 10 分钟', toolCal: '加进日历', timerLabel: '一起做', timerDone: '做完了', timerStop: '先停下', timerHint: '它在旁边安静待着。可以锁屏，到点会叫你。',
    timerEnd: '十分钟到。做到哪了？', timerStopped: '停了也行。做了几分钟也算。', timerDoneNote: '十分钟到了。做到哪了？', calNotes: '「{title}」的下一小步。做完回来讲给它听。', calDone: '已经交给系统日历了', calIcs: '日历文件已下载，打开它就能加进日历',
    crisisTitle: '先照顾好自己', crisisBody: '我只是陪你做事的小伙伴，这件事我帮不上忙。但有人能帮你，而且现在就可以。',
    crisisLines: [['全国心理援助热线', '12356'], ['有生命危险时', '110 / 120']], crisisOther: '如果你不在中国大陆，请拨打当地的紧急电话或心理援助热线。也可以先找一个信得过的人，告诉他你现在的感受。', crisisOk: '我知道了',
    crisisLow: '听起来你最近很不容易。这件事可以先放一放，不急。愿意的话，找个信得过的人说说，或者打心理援助热线 12356。', crisisHelp: '求助方式',
    depDaily: '今天我们聊得够多了。剩下的时间留给那件事，或者留给身边的人吧。明天再聊。', depChatOnly: '这几天我们光聊天了。聊天我在，不过比起跟我说，做一小步会更有用。',
    useLong: '今天已经在这待了一个小时了。去做那件事，或者歇一会儿吧。',
    minorTitle: '未成年人模式', minorLead: '开启后：不能自由聊天；22 点到 6 点它睡觉；每天待满 40 分钟会提醒你休息。', minorNight: '这么晚了，它先睡了。明天早上见。',
    fbTitle: '这句话不太对？', fbLead: '告诉我哪里不对，会用来改进它说话的方式。会附上这一句的内容，不会附上你的日记。', fbReasons: [['made_up', '编了没发生的事'], ['tone', '语气不对'], ['useless', '没用、太空'], ['uncomfortable', '让我不舒服'], ['other', '其他']], fbThanks: '收到，谢谢。',
    privTitle: '隐私与数据', privLead: '日记和伙伴存在这台设备上。接了模型时，你讲的话会发给它的服务方来生成回应。提醒在手机上本地排程，不经过服务器。',
    privImport: '导入存档', privImportLead: '把之前「复制存档」得到的文字贴进来。会替换掉现在的全部进度。', privImportGo: '导入并替换', privImportBad: '这段文字不是有效的存档。', privImportDone: '导入好了',
    privDelete: '删除全部数据', privDeleteLead: '会删掉伙伴、日记、它记得的事、模型密钥、提醒和诊断记录，无法恢复。', privDeleteGo: '确定删除', privDeleted: '已经全部删除',
    diagTitle: '诊断信息', diagLead: '最近 7 天，只在这台设备上统计。', diagCalls: '模型调用 {n} 次，成功 {ok}%，平均 {ms} 毫秒', diagRetry: '重试 {r} 次，退回预写台词 {f} 次', diagGuard: '红线拦下：{list}', diagGuardNone: '红线没有拦下任何回复',
    diagNudge: '提醒发出 {s} 条，点开 {o} 条', diagActive: '7 天里来了 {d} 天', diagFb: '你标记了 {n} 句不太对', diagExport: '导出诊断记录', diagSrc: '配置来源：{src}', guardNames: { clingy: '黏人', suffer: '装可怜', guard: '内疚', guilt: '让人内疚', flatter: '吹捧', long: '太长' },
    filing: '模型：{x}',
    upNotSet: '更新服务还没有配置。当前版本可以正常使用。',
    err: { rate_limited: '{who} 现在用得太勤，过一会儿再试。', refused: '这段内容 {who} 处理不了，换个说法试试。', session_expired: '登录过期了，重新登录后再试。',
      invalid_json: '{who} 这次没按格式回，再试一次。', off: '这里连不上 Claude，先用预先写好的台词。', auth: '{who} 的密钥失效了，到设置里检查一下。', quota: '{who} 的额度用完了。',
      network: '没连上 {who}，检查一下网络。', timeout: '{who} 回得太慢，再试一次。', other: '没连上 {who}。可以再试一次。' },
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
  const memBlock = mem => mem ? `\n你记得的事（主人能看到并修改，以这里为准）：\n${mem}\n` : '';
  const logLines = logs => logs.map(l => `- ${l.date}：${clip(l.text, 200)}${l.a ? `（你问：${clip(l.q, 60)} 主人答：${clip(l.a, 200)}）` : ''}${l.next ? ` 约好：${clip(l.next, 80)}` : ''}`).join('\n') || '（还没有记录）';
  const P = {
    plan: ({ title }) => `你在帮一个人把大目标拆小。这个人容易中途放弃，所以每一步都要具体、可判断。

目标：「${clip(title, 80)}」

1. kind：这个目标属于哪一类，只能是 read（读）、make（做、写、创作）、learn（学习、备考）、body（运动、身体）之一。
2. milestones：按先后顺序拆成 3 个里程碑（目标确实很大时最多 4 个）。每个有 name（不超过 8 个字的名词短语，一眼能懂）和 doneWhen（一句话，怎样算做完，要能客观判断，不超过 24 个字）。
3. firstStep：今天 20 分钟内能做完的第一小步，具体到一个动作，不超过 20 个字。

只回复 JSON：{"kind":"","milestones":[{"name":"","doneWhen":""}],"firstStep":""}`,

    react: ({ g, mile, text, logs, mem }) => `${who(g)}
${memBlock(mem)}
当前阶段：「${clip(mile, 40)}」
之前的记录（从旧到新）：
${logLines(logs)}

主人刚刚告诉你这次做了什么：${clip(text, 400)}

回三样东西：
- say：你对这次的反应，一句话，不超过 30 个字。要针对他具体做的内容，可以联系之前的记录。
- ask：问他一个问题，不超过 25 个字。一句话就能答，而且答案值得留在日记里（一个判断、一个发现、一个没解决的疑问）。不要问感受，不要泛泛地问收获。
- next：你建议的下一小步，接着他这次做的往下走，20 分钟内能做完的一个具体动作，不超过 18 个字。不用人设口吻，只写动作本身。
只回复 JSON：{"say":"","ask":"","next":""}`,

    welcome: ({ g, mile, gap, logs, mem }) => `${who(g)}
${memBlock(mem)}
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

    shrink: ({ g, mem }) => `一个人在做「${clip(g.title, 80)}」，他约好的下一小步是：「${clip(g.promise.text, 200)}」。他今天不想动。
${memBlock(mem)}
给出 3 个更小的版本，每个都是十分钟内能做完的一个具体动作，而且做完确实是在推进原来那一步。每个不超过 18 个字。
只回复 JSON 数组：["","",""]`,

    shell: ({ g, mile, logs }) => `一个人做完了长期目标中的一个阶段。根据他的日记，写两三句话刻在小伙伴蜕下的旧壳上，留作这个阶段的纪念。

目标：「${clip(g.title, 80)}」，刚做完的阶段：「${clip(mile, 40)}」
这一段的日记（从旧到新）：
${logLines(logs)}

写 2 到 3 句话，不超过 90 个字。只用日记里有的事实：具体做了什么、绕过什么弯、留下了什么判断。做得少就说少，不拔高，不用「恭喜」「太棒了」，不编日记里没有的细节。用第二人称「你」。只回复正文。`,

    memGoal: ({ g, cur, logs, forgot, edited }) => `你在帮一只陪伴小生物整理它对主人的记忆。主人在做「${clip(g.title, 80)}」。
现有档案：
- progress（做到哪了）：${clip(cur && cur.progress, 90) || '（空）'}
- stuck（反复卡住的地方）：${clip(cur && cur.stuck, 90) || '（空）'}
- rhythm（主人的节奏，比如什么时候做、一次做多久）：${clip(cur && cur.rhythm, 60) || '（空）'}
- promises（说过、还没兑现的承诺）：${clip(cur && cur.promises, 60) || '（空）'}
${Object.keys(edited || {}).filter(k => edited[k]).length ? `主人亲手改过这些字段，原样保留：${Object.keys(edited).filter(k => edited[k]).join('、')}\n` : ''}${(forgot || []).length ? `主人删掉了下面这些内容，不要再写回任何一条：\n${forgot.map(f => '- ' + clip(f, 80)).join('\n')}\n` : ''}
最近的日记（从旧到新）：
${logLines(logs)}

根据日记更新档案。规则：
- 只记和这件事有关的事实。不记健康、感情、家人、钱、身份等私人信息，日记里提到了也不记。
- 只写日记里能看出来的，不推测，不评价，不写建议。
- progress 不超过 40 个字，stuck 不超过 40 个字（看不出来就留空），rhythm 不超过 30 个字（至少有 3 条日记才写），promises 不超过 30 个字。
只回复 JSON：{"progress":"","stuck":"","rhythm":"","promises":""}`,

    memUser: ({ cur, goal, profile, forgot, edited }) => `你在帮一只陪伴小生物整理它对主人这个人的长期印象，用来以后陪主人做别的事。
现有印象：
- habits（通常怎么做事）：${clip(cur && cur.habits, 70) || '（空）'}
- returns（断了之后怎么回来）：${clip(cur && cur.returns, 70) || '（空）'}
- likes（愿意回答哪类追问）：${clip(cur && cur.likes, 70) || '（空）'}
${Object.keys(edited || {}).filter(k => edited[k]).length ? `主人亲手改过这些，原样保留：${Object.keys(edited).filter(k => edited[k]).join('、')}\n` : ''}${(forgot || []).length ? `主人删掉的内容，不要写回：\n${forgot.map(f => '- ' + clip(f, 80)).join('\n')}\n` : ''}
刚结束的一件事：「${clip(goal.title, 80)}」，结果：${goal.result === 'grown' ? '做完了' : '放下了'}，历时 ${goal.days} 天，讲述 ${goal.adv} 次。
这件事的档案：${profile ? Object.values(profile).filter(v => typeof v === 'string' && v).map(v => clip(v, 90)).join('；') : '（无）'}

在现有印象上增补或修正，每项不超过 35 个字；看不出来的留原样。不记私人信息，不评价人。
只回复 JSON：{"habits":"","returns":"","likes":""}`,

    nudge: ({ g, mem }) => `${who(g)}
${memBlock(mem)}
你们约好的下一小步：${g.promise.text ? clip(g.promise.text, 120) : '（没约）'}

主人不在的时候，你会用手机通知去找他一下。写三条通知，每条不超过 22 个字：
- due：约定的第二天，提醒他做那一小步。
- drowsy：你快睡着了（他两天没来），建议他做十分钟。
- sleep：你已经睡了，告诉他哪天回来从哪一步开始就行。
规则：只说一个具体动作；不说想他、等他；不提他多久没来；不说「加油」；不用感叹号。
只回复 JSON：{"due":"","drowsy":"","sleep":""}`,

    chatRules: ({ g, mile, logs, mem }) => `${who(g)}
${memBlock(mem)}
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
