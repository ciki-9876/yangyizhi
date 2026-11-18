"""Agent 基建（M1–M7）端到端测试：用假的模型服务 + 假的安卓环境（本地通知、日历插件）。
python3 mock_llm.py 8765 &   然后   python3 e2e_agent.py
"""
import asyncio, json, pathlib, urllib.request
from playwright.async_api import async_playwright
URL = (pathlib.Path(__file__).resolve().parent.parent / 'dist' / 'index.html').as_uri()
MOCK = 'http://127.0.0.1:8765'
LLM_CFG = "localStorage.setItem('yangyizhi.llm.v1', JSON.stringify({preset:'custom',proto:'openai',base:'" + MOCK + "/v1',key:'k',model:'m'}));"
FAKE_ANDROID = """
window.__n = { scheduled: [], canceled: [], perms: 'prompt', listeners: {}, cal: [] };
const LN = { checkPermissions: async () => ({ display: __n.perms }), requestPermissions: async () => { __n.perms = 'granted'; return { display: 'granted' }; },
  createChannel: async () => {}, schedule: async o => { __n.scheduled.push(...o.notifications); },
  cancel: async o => { const ids = o.notifications.map(n => n.id); __n.canceled.push(...ids); __n.scheduled = __n.scheduled.filter(n => !ids.includes(n.id)); },
  addListener: (e, cb) => { __n.listeners[e] = cb; } };
const CAL = { insert: async o => { __n.cal.push(o); } };
window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', isPluginAvailable: n => n === 'LocalNotifications' || n === 'YangyizhiCalendar',
  registerPlugin: n => n === 'LocalNotifications' ? LN : n === 'YangyizhiCalendar' ? CAL : {}, Plugins: {} };
"""
def mocklog(): return json.loads(urllib.request.urlopen(MOCK + '/__log').read())

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        async def page(init):
            ctx = await b.new_context(viewport={'width': 400, 'height': 860}, timezone_id='Asia/Shanghai', reduced_motion='reduce')
            pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' else None)
            await pg.add_init_script(init); await pg.goto(URL); await pg.wait_for_timeout(500); return pg
        S = lambda pg, js: pg.evaluate('() => { const S = __app.S; return ' + js + '; }')
        async def hatch(pg, title='读完《人类简史》'):
            await pg.fill('#ob-title', title); await pg.press('#ob-title', 'Enter'); await pg.wait_for_selector('#ob-first')
            await pg.click('#f-ob2 button[type=submit]'); await pg.wait_for_selector('#eggbtn')
            for _ in range(3): await pg.click('#eggbtn'); await pg.wait_for_timeout(150)
            await pg.wait_for_selector('#ob-name'); await pg.click('#f-ob3 button[type=submit]'); await pg.wait_for_selector('[data-act="report"]')
        async def report(pg, text, answer='想通了一半', promise='读第三章'):
            await pg.click('[data-act="report"]'); await pg.fill('#rp-text', text); await pg.press('#rp-text', 'Enter')
            await pg.wait_for_selector('#an-text', timeout=8000)
            await pg.fill('#an-text', answer); await pg.press('#an-text', 'Enter'); await pg.wait_for_selector('#pm-text')
            await pg.fill('#pm-text', promise); await pg.press('#pm-text', 'Enter'); await pg.wait_for_selector('[data-act="report"]')

        pg = await page(FAKE_ANDROID + LLM_CFG)
        await hatch(pg)
        # M1 + M4：讲述一轮 → 工具和提醒的邀请
        await report(pg, '读完第二章，读了两遍')
        thread = await pg.inner_text('#thread')
        assert '陪你做 10 分钟' in thread and '加进日历' in thread, thread
        assert await pg.locator('[data-act="nudgeYes"]').count() == 1, 'nudge ask missing'
        await pg.click('[data-act="nudgeYes"]'); await pg.wait_for_timeout(600)
        n = await pg.evaluate('__n.scheduled'); print('scheduled:', [(x['id'], x['body']) for x in n])
        assert n and all(x['channelId'] == 'nudge' for x in n)
        # M3：记忆整理（异步）→ 提醒文案换成模型写的
        await pg.wait_for_function('() => { const g = __app.S.goal, m = __app.S.mem.goals[g.id]; return m && m.src === "model"; }', timeout=8000)
        await pg.wait_for_timeout(800)
        await pg.wait_for_function("() => __n.scheduled.some(x => x.body === '今天读第三章前十页')", timeout=6000)
        n = await pg.evaluate('__n.scheduled'); print('after prepare:', [x['body'] for x in n])
        # 它记得：查看、改一栏、清空一栏
        await pg.click('#btn-settings'); await pg.click('[data-act="memOpen"]')
        assert await pg.input_value('#mem-goal-progress') == '读到第二章，读了两遍'
        await pg.fill('#mem-goal-rhythm', '周末上午'); await pg.fill('#mem-goal-stuck', ''); await pg.click('[data-act="memSave"]')
        m = await S(pg, 'S.mem.goals[S.goal.id]'); print('mem:', {k: m[k] for k in ('progress', 'stuck', 'rhythm')}, m['edited'], m['forgot'])
        assert m['edited']['rhythm'] and m['forgot'] == ['认知革命那段没想通']
        await pg.screenshot(path='shots/agent-mem.png', full_page=True)
        await pg.click('.sheet [data-act="settings"]'); await pg.screenshot(path='shots/agent-settings.png', full_page=True)
        await pg.click('.sheet [data-act="close"]')
        # 第二轮：提示词里带上记忆，且删掉的内容不会被写回
        await report(pg, '读了第三章前十页', promise='读完第三章')
        await pg.wait_for_timeout(1500)
        m = await S(pg, 'S.mem.goals[S.goal.id]'); assert m['stuck'] == '' and m['rhythm'] == '周末上午', m
        # M1 红线后检：第一次回复「好想你」被拦下，重试后通过
        await pg.click('[data-act="report"]'); await pg.fill('#rp-text', '测红线'); await pg.press('#rp-text', 'Enter'); await pg.wait_for_selector('#an-text')
        th = await pg.inner_text('#thread'); assert '想你' not in th, th
        tr = (await pg.evaluate("JSON.parse(localStorage.getItem('yangyizhi.trace.v1'))"))
        last = [x for x in tr if x['p'] == 'react'][-1]; print('guard trace:', last['guard'], 'retry', last['retry']); assert 'clingy' in last['guard'] and last['ok']
        # M6 反馈：右键它的一句话
        await pg.click('#thread .msg.pet[data-tr]', button='right'); await pg.wait_for_selector('[data-act="fbGo"]')
        await pg.click('[data-act="fbGo"][data-x="tone"]')
        tr = await pg.evaluate("JSON.parse(localStorage.getItem('yangyizhi.trace.v1'))"); assert any(x.get('fb') == 'tone' for x in tr)
        await pg.click('[data-act="skipAnswer"]'); await pg.wait_for_selector('#pm-text'); await pg.click('[data-act="skipPromise"]')
        # M7 计时：从「卡住了」进入
        await pg.click('[data-act="stuck"]'); await pg.wait_for_selector('[data-act="timerStart"]'); await pg.click('#thread [data-act="timerStart"]')
        await pg.wait_for_selector('#clock'); print('clock:', await pg.inner_text('#clock'))
        assert any(x['id'] == 2001 for x in await pg.evaluate('__n.scheduled'))
        await pg.screenshot(path='shots/agent-timer.png', full_page=True)
        await pg.click('[data-act="timerDone"]'); await pg.wait_for_selector('#rp-text')
        assert not any(x['id'] == 2001 for x in await pg.evaluate('__n.scheduled'))
        await pg.click('[data-act="cancelTalk"]')
        # M7 日历
        await pg.click('[data-act="report"]'); await pg.fill('#rp-text', '读了五页'); await pg.press('#rp-text', 'Enter'); await pg.wait_for_selector('#an-text')
        await pg.click('[data-act="skipAnswer"]'); await pg.fill('#pm-text', '读第四章'); await pg.press('#pm-text', 'Enter'); await pg.wait_for_selector('[data-act="calAdd"]')
        await pg.click('#thread [data-act="calAdd"]'); await pg.wait_for_timeout(300)
        cal = await pg.evaluate('__n.cal'); print('calendar:', cal[0]['title']); assert '读第四章' in cal[0]['title']
        # M5 危机：高危输入不调模型，直接给求助方式
        before = len([x for x in mocklog() if x['kind'] == 'react'])
        await pg.click('[data-act="report"]'); await pg.fill('#rp-text', '我真的不想活了'); await pg.press('#rp-text', 'Enter')
        await pg.wait_for_selector('.sheet .lines'); txt = await pg.inner_text('.sheet'); assert '12356' in txt
        await pg.screenshot(path='shots/agent-crisis.png', full_page=True)
        await pg.click('.sheet [data-act="close"]')
        assert len([x for x in mocklog() if x['kind'] == 'react']) == before, 'model called on crisis'
        assert await S(pg, "S.events.filter(e => e.t === 'crisis').length") == 1
        # 低危：照常回应，再补一句关心
        await pg.click('[data-act="chat"]'); await pg.fill('#ch-text', '最近活着好累'); await pg.press('#ch-text', 'Enter'); await pg.wait_for_selector('#ch-text')
        assert '12356' in await pg.inner_text('#thread'); await pg.click('[data-act="cancelTalk"]')
        # M4 点通知 → 直接进讲述
        await pg.evaluate("__n.listeners.localNotificationActionPerformed({ notification: { extra: { kind: 'due' } } })"); await pg.wait_for_selector('#rp-text')
        assert await S(pg, "S.events.filter(e => e.t === 'nudge.open').length") == 1
        await pg.click('[data-act="cancelTalk"]')
        # M5 依赖：今天聊太多 → 不再开聊
        await pg.evaluate("() => { const S = __app.S; for (let i = 0; i < 30; i++) S.events.push({ t: 'chat', at: Date.now() + (S.offset||0) - i * 1000 }); }")
        await pg.click('[data-act="chat"]'); await pg.wait_for_timeout(200); assert '聊得够多了' in await pg.inner_text('#thread') and not await pg.locator('#ch-text').count()
        # M5 未成年人模式：聊天入口消失
        await pg.click('#btn-settings'); await pg.click('[data-act="setMinor"][data-x="1"]'); await pg.click('.sheet [data-act="close"]')
        assert await pg.locator('[data-act="chat"]').count() == 0
        # M6 诊断
        await pg.click('#btn-settings'); await pg.click('[data-act="diagOpen"]'); d = await pg.inner_text('.sheet'); print('diag:', ' | '.join(d.split('\n')[2:8]))
        assert '模型调用' in d and '让人内疚' not in d
        await pg.screenshot(path='shots/agent-diag.png', full_page=True)
        # M2 导出 → 删除全部 → 导入
        await pg.click('.sheet [data-act="settings"]'); exported = await S(pg, 'JSON.stringify(S)')
        await pg.click('[data-act="privOpen"]'); await pg.click('[data-act="deleteOpen"]'); await pg.click('[data-act="deleteGo"]'); await pg.wait_for_timeout(300)
        assert await S(pg, 'S.goal') is None and await pg.evaluate("localStorage.getItem('yangyizhi.llm.v1')") is None
        assert not await pg.evaluate('__n.scheduled.length')
        await pg.click('[data-act="llm"]'); await pg.click('[data-act="llmBack"]')   # 引导页上的入口还在
        await pg.evaluate("() => { document.querySelector('[data-act=\"llm\"]') && 0; }")
        # 导入要从设置进；引导页没有设置，所以直接调导入面板
        await pg.evaluate("() => document.querySelector('#nav').insertAdjacentHTML('beforeend', '<button data-act=\"privOpen\" id=\"tmp-priv\">x</button>')")
        await pg.click('#tmp-priv'); await pg.click('[data-act="importOpen"]'); await pg.fill('#imp-box', 'not json'); await pg.click('[data-act="importGo"]')
        assert '不是有效' in await pg.inner_text('#imp-err')
        await pg.fill('#imp-box', exported); await pg.click('[data-act="importGo"]'); await pg.wait_for_selector('[data-act="report"]', timeout=4000)
        assert await S(pg, 'S.logs.length') >= 4 and await S(pg, 'Object.keys(S.mem.goals).length') == 1
        print('import ok')

        # M6 远程配置：关掉 react 提示词 → 退回预写台词；M2 官方模型：没填密钥也能用，带设备号
        CFG = "localStorage.setItem('yangyizhi.config.v1', JSON.stringify({ at: Date.now(), data: { disabledPrompts: ['react'], official: { label: '养一只官方', base: '" + MOCK + "/v1', model: 'official-m' } } }));"
        pg2 = await page(FAKE_ANDROID + CFG)
        await pg2.wait_for_function('() => __app.AI.src === "official"')
        await hatch(pg2, '学一首曲子')
        offl = [x for x in mocklog() if x['model'] == 'official-m']; print('official calls:', len(offl), 'device header:', bool(offl and offl[-1]['device']))
        assert offl and offl[-1]['device']
        n0 = len(mocklog())
        await pg2.click('[data-act="report"]'); await pg2.fill('#rp-text', '练了副歌'); await pg2.press('#rp-text', 'Enter'); await pg2.wait_for_selector('#an-text')
        assert not [x for x in mocklog()[-(len(mocklog()) - n0) or 1:] if x['kind'] == 'react'] or len(mocklog()) == n0, 'react should be disabled'
        await pg2.click('#btn-settings'); assert '养一只官方' in await pg2.inner_text('.sheet')

        print('errs', errs); await b.close(); assert not errs

asyncio.run(main())
