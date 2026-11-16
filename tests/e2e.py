import asyncio, sys
from playwright.async_api import async_playwright
import pathlib
URL = (pathlib.Path(__file__).resolve().parent.parent / 'dist' / 'index.html').as_uri()
MOCK = """
window.__calls = [];
const sample = async (input, opts) => { const s = Array.isArray(input) ? input.map(m=>m.content).join('\\n') : String(input); window.__calls.push(['text', Array.isArray(input) ? 'chat:'+input.length : s.slice(0,30)]);
  const text = s.includes('旧壳') ? '你读完了前五章，第二章读了两遍才弄清认知革命指什么。留下的判断是：作者的例子比结论可靠。' : s.includes('说三句话') ? '上次你读到第 6 章，农业革命那部分刚开头。\\n你当时不同意「小麦驯化了人」，还没想清楚为什么。\\n今天只读第 7 章第一节，十页左右。' : '那就只翻开第 7 章，读第一页。读完告诉我第一句写了什么。'; return {text, truncated:false}; };
sample.json = async (input) => { const s = String(input); window.__calls.push(['json', s.slice(0,30)]);
  if (s.includes('JSON 数组')) return ['翻到第 7 章，读第一页','把上次划的两段再看一遍','读十分钟，读到哪算哪'];
  if (s.includes('"say"')) return {say:'认知革命那段你读了两遍，看来是真卡住了。', ask:'读第二遍时，哪一句让你想通的？', next:'读第 2 章的前 10 页'};
  return {kind:'read', milestones:[{name:'读完前五章',doneWhen:'第 5 章最后一页读完'},{name:'读完中段',doneWhen:'读到第 13 章结束'},{name:'读完全书',doneWhen:'最后一章读完'}], firstStep:'读第 1 章的前 10 页'}; };
const store = {};
const db = { doc: p => ({ get: async () => ({exists: p in store, data: () => store[p]}), set: async d => { store[p] = JSON.parse(JSON.stringify(d)); window.__dbWrites = (window.__dbWrites||0)+1; } }) };
window.claude = { use: async n => n === 'sample' ? sample : n === 'db' ? db : n === 'user' ? { id: async () => 'u_test' } : null };
"""
async def main():
    mock = '--nomock' not in sys.argv
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        async def page(w, h, scheme='light'):
            ctx = await b.new_context(viewport={'width': w, 'height': h}, color_scheme=scheme, device_scale_factor=2 if w < 500 else 1, timezone_id='Asia/Shanghai' if w < 500 else 'Asia/Kolkata', reduced_motion='reduce' if '--reduce' in sys.argv else 'no-preference')
            pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' and 'ERR_' not in m.text else None)
            if mock: await pg.add_init_script(MOCK)
            await pg.goto(URL); await pg.wait_for_timeout(500); return pg
        async def tell(pg, text, ans=None, nxt=None, shot=None):
            await pg.click('[data-act="report"]'); await pg.fill('#rp-text', text)
            if shot: await pg.screenshot(path=f'shots/{shot}-a.png')
            await pg.press('#rp-text', 'Enter'); await pg.wait_for_selector('#an-text')
            if shot: await pg.screenshot(path=f'shots/{shot}-b.png')
            if ans: await pg.fill('#an-text', ans); await pg.press('#an-text', 'Enter')
            else: await pg.click('[data-act="skipAnswer"]')
            await pg.wait_for_selector('#pm-text')
            if shot: await pg.screenshot(path=f'shots/{shot}-c.png')
            if nxt == 'suggest' and await pg.locator('[data-act="pickSuggest"]').count(): await pg.click('[data-act="pickSuggest"]')
            elif nxt and nxt != 'suggest': await pg.fill('#pm-text', nxt); await pg.press('#pm-text', 'Enter')
            elif nxt == 'suggest': await pg.fill('#pm-text', '接着做'); await pg.press('#pm-text', 'Enter')
            else: await pg.click('[data-act="skipPromise"]')
            await pg.wait_for_selector('[data-act="report"]')
        async def skip(pg, d):
            await pg.click('#btn-settings'); await pg.click(f'[data-act="skip"][data-d="{d}"]'); await pg.wait_for_timeout(120)
            if await pg.locator('[data-act="wake"]').count(): await pg.click('[data-act="wake"]')
        async def hatch(pg, title, shots=None, voice=None):
            if shots: await pg.screenshot(path=f'shots/{shots}1.png')
            await pg.fill('#ob-title', title); await pg.press('#ob-title', 'Enter'); await pg.wait_for_selector('#ob-first')
            if not await pg.input_value('#ob-first'): await pg.fill('#ob-first', '先做十分钟')
            if shots: await pg.screenshot(path=f'shots/{shots}2.png', full_page=True)
            await pg.click('#f-ob2 button[type=submit]'); await pg.wait_for_selector('#eggbtn')
            await pg.click('#eggbtn'); await pg.wait_for_timeout(120); await pg.click('#eggbtn'); await pg.wait_for_timeout(150)
            if shots: await pg.screenshot(path=f'shots/{shots}3a.png')
            await pg.click('#eggbtn'); await pg.wait_for_timeout(420)
            if shots: await pg.screenshot(path=f'shots/{shots}3x.png')
            await pg.wait_for_selector('#ob-name')
            if voice: await pg.click(f'[data-act="obStyle"][data-x="{voice}"]')
            await pg.wait_for_timeout(500)
            if shots: await pg.screenshot(path=f'shots/{shots}3b.png', full_page=True)
            await pg.click('#f-ob3 button[type=submit]'); await pg.wait_for_selector('[data-act="report"]'); await pg.wait_for_timeout(600)
        pg = await page(1100, 860)
        print('nav at first:', repr(await pg.inner_text('#nav')))
        await pg.click('#f-ob1 button[type=submit]'); print('empty err:', await pg.inner_text('.err'))
        await hatch(pg, '读完《人类简史》', 'd-ob', 'sharp')
        await pg.screenshot(path='shots/d-home.png', full_page=True)
        await tell(pg, '读完第 1 章，认知革命那段读了两遍。', '「虚构的故事让陌生人合作」这句。', 'suggest')
        await pg.wait_for_timeout(300); await pg.screenshot(path='shots/d-after.png', full_page=True)
        print('after1', await pg.evaluate('JSON.stringify({xp:__app.S.goal.xp,lv:Pet.levelOf(__app.S.goal),p:__app.S.goal.promise.text,log:__app.S.logs[0].xp})'))
        for d in range(5): await skip(pg, 1); await tell(pg, f'读完第 {d+2} 章', '记了两条笔记' if d % 2 == 0 else None, f'读第 {d+3} 章')
        print('day6', await pg.evaluate('JSON.stringify({xp:__app.S.goal.xp,lv:Pet.levelOf(__app.S.goal),tr:__app.S.goal.trinkets,tips:__app.S.tips})'))
        await pg.click('[data-act="treasure"]'); await pg.wait_for_timeout(500); await pg.screenshot(path='shots/d-treasure.png'); await pg.click('.sheet [data-act="close"]')
        await pg.click('#btn-settings'); await pg.screenshot(path='shots/d-settings.png'); await pg.click('[data-act="skip"][data-d="7"]'); await pg.wait_for_timeout(200)
        await pg.screenshot(path='shots/d-asleep.png', full_page=True)
        await pg.click('[data-act="wake"]'); await pg.wait_for_timeout(200)
        if mock: await pg.click('[data-act="welcomeAI"]'); await pg.wait_for_timeout(200)
        await pg.screenshot(path='shots/d-welcome.png', full_page=True)
        print('thread:', (await pg.inner_text('#thread')).replace('\n', ' / ')[:400])
        await pg.click('[data-act="stuck"]'); await pg.wait_for_selector('[data-act="pickPromise"]'); await pg.screenshot(path='shots/d-stuck.png', full_page=True)
        await pg.locator('[data-act="pickPromise"]').first.click(); print('promise now:', await pg.inner_text('.nextnote .v'))
        if mock:
            await pg.click('[data-act="chat"]'); await pg.fill('#ch-text', '今天真的不想读，怎么办'); await pg.press('#ch-text', 'Enter'); await pg.wait_for_selector('#ch-text'); await pg.screenshot(path='shots/d-chat.png', full_page=True); await pg.click('[data-act="cancelTalk"]')
        await tell(pg, '回来了，读了第 7 章第一节', '比想象中好读', '读完第 7 章')
        print('patch', await pg.evaluate('JSON.stringify({patches:__app.S.goal.patches,mult:__app.S.logs.slice(-1)[0].mult})'))
        await pg.click('[data-act="editPromise"]'); await pg.fill('#pm-text', '读第 8 章'); await pg.press('#pm-text', 'Enter'); print('edited:', await pg.inner_text('.nextnote .v'))
        await pg.click('[data-act="route"]'); await pg.wait_for_timeout(400); await pg.screenshot(path='shots/d-route.png'); await pg.click('[data-act="moltGo"]'); await pg.wait_for_timeout(1150); await pg.screenshot(path='shots/d-molting.png'); await pg.wait_for_selector('.sheet'); await pg.wait_for_timeout(900); await pg.screenshot(path='shots/d-molted.png')
        await pg.click('.sheet [data-act="close"]'); await pg.wait_for_timeout(300); await pg.screenshot(path='shots/d-after-molt.png', full_page=True)
        print('molt', await pg.evaluate('JSON.stringify({bond:__app.S.bond,cur:__app.S.goal.cur,parts:__app.S.goal.parts,card:__app.S.goal.miles[0].card})'))
        await pg.goto(URL + '#diary'); await pg.wait_for_timeout(300); await pg.screenshot(path='shots/d-diary.png', full_page=True)
        await pg.goto(URL + '#pet'); await pg.reload(); await pg.wait_for_timeout(500)
        print('reload', await pg.evaluate('JSON.stringify({cur:__app.S.goal.cur,logs:__app.S.logs.length,store:__app.Store.kind,ai:__app.AI.on,w:window.__dbWrites||0})'))
        total = await pg.evaluate('__app.S.goal.miles.length')
        for i in range(total - 1):
            await tell(pg, '做' if i == 0 else f'第 {i+2} 关的推进，这次写得很长很长很长很长很长很长很长很长很长很长很长很长很长很长', None, '继续')
            await pg.click('[data-act="route"]'); await pg.click('[data-act="moltGo"]'); await pg.wait_for_selector('.sheet h2'); await pg.wait_for_timeout(500)
            if i < total - 2: await pg.click('.sheet [data-act="close"]'); await skip(pg, 1)
        await pg.screenshot(path='shots/d-grown.png'); await pg.click('[data-act="goHome"]'); await pg.wait_for_timeout(300)
        print('grown', await pg.evaluate('JSON.stringify({goal:__app.S.goal,bond:__app.S.bond,h:__app.S.habitat.map(a=>[a.result,a.look.parts])})'))
        await pg.goto(URL + '#pet'); await pg.wait_for_timeout(300); await hatch(pg, '跑下 10 公里')
        await pg.click('[data-act="route"]'); await pg.click('[data-act="release"]'); await pg.fill('#rl-reason', '膝盖不太行，先养好'); await pg.screenshot(path='shots/d-release.png'); await pg.click('[data-act="releaseGo"]'); await pg.wait_for_timeout(200)
        await pg.goto(URL + '#home'); await pg.wait_for_timeout(500); await pg.screenshot(path='shots/d-habitat.png', full_page=True); await pg.locator('[data-act="buddy"]').last.click(); await pg.wait_for_timeout(500); await pg.screenshot(path='shots/d-buddy.png'); await pg.click('.sheet [data-act="close"]')
        # mobile, dark
        m = await page(390, 844, 'dark'); await hatch(m, '做出一个小游戏', 'm-ob')
        await m.screenshot(path='shots/m-home.png')
        await tell(m, '写了原型，角色可以左右移动了', '碰撞盒比想的麻烦', 'suggest', shot='m-talk')
        await m.screenshot(path='shots/m-after.png')
        for d in range(3): await skip(m, 1); await tell(m, '又做了一点', '嗯嗯', '继续加功能')
        await m.screenshot(path='shots/m-day4.png', full_page=True)
        await m.click('#btn-settings'); await m.click('[data-act="skip"][data-d="7"]'); await m.wait_for_timeout(200); await m.screenshot(path='shots/m-asleep.png')
        print('mobile overflow px:', await m.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth'))
        print('errs', errs); await b.close()
asyncio.run(main())
