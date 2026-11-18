"""原生持久化测试（需要先启动：python3 tests/mock_llm.py 8765 &）：假的安卓 Preferences 在两次"启动"之间保留，localStorage 被清空后存档要能恢复。
python3 tests/e2e_persist.py"""
import asyncio, pathlib
from playwright.async_api import async_playwright
URL = (pathlib.Path(__file__).resolve().parent.parent / 'dist' / 'index.html').as_uri()
FAKE = """
const PREF = { get: o => window.__pget(o.key), set: o => window.__pset(o.key, o.value), remove: o => window.__prem(o.key) };
localStorage.getItem('yangyizhi.llm.v1') || localStorage.setItem('yangyizhi.llm.v1', JSON.stringify({preset:'custom',proto:'openai',base:'http://127.0.0.1:8765/v1',key:'k',model:'m'}));
window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', isPluginAvailable: n => n === 'Preferences',
  registerPlugin: n => n === 'Preferences' ? PREF : {}, Plugins: {} };
"""
async def main():
    store = {}; errs = []; ok = True
    def check(name, cond):
        nonlocal ok; ok = ok and bool(cond); print(('✓' if cond else '✗'), name)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        async def page():
            ctx = await b.new_context(viewport={'width': 400, 'height': 860}, reduced_motion='reduce')
            async def pget(k): return {'value': store.get(k)}
            async def pset(k, v): store[k] = v
            async def prem(k): store.pop(k, None)
            await ctx.expose_function('__pget', pget); await ctx.expose_function('__pset', pset); await ctx.expose_function('__prem', prem)
            pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.add_init_script(FAKE); await pg.goto(URL); await pg.wait_for_timeout(600); return pg
        pg = await page()
        await pg.fill('#ob-title', '读完《人类简史》'); await pg.press('#ob-title', 'Enter'); await pg.wait_for_selector('#ob-first')
        await pg.click('#f-ob2 button[type=submit]'); await pg.wait_for_selector('#eggbtn')
        for _ in range(3): await pg.click('#eggbtn'); await pg.wait_for_timeout(150)
        await pg.wait_for_selector('#ob-name'); await pg.click('#f-ob3 button[type=submit]'); await pg.wait_for_selector('[data-act="report"]')
        await pg.evaluate("() => Agent.Platform.deviceId()")
        await pg.wait_for_timeout(300)
        check('存档已镜像到原生偏好', 'yangyizhi.save.v2' in store and '读完《人类简史》' in store['yangyizhi.save.v2'])
        check('设备 id 已镜像', 'yangyizhi.did' in store)
        did = await pg.evaluate("() => localStorage.getItem('yangyizhi.did')")
        # 新的"启动"：localStorage 全空，只有原生偏好还在
        pg2 = await page()
        goal = await pg2.evaluate("() => __app.S.goal && (__app.S.goal.title || __app.S.goal)")
        check('localStorage 被清空后从原生偏好恢复存档', goal and '人类简史' in str(goal))
        check('设备 id 保持不变', did == await pg2.evaluate("() => localStorage.getItem('yangyizhi.did')"))
        check('恢复后能进入主界面', await pg2.query_selector('[data-act="report"]') is not None)
        # 本地已有存档时不被原生旧数据覆盖
        store['yangyizhi.save.v2'] = '{"v":2,"stale":true}'
        pg3 = await pg2.context.new_page(); await pg3.add_init_script(FAKE); await pg3.goto(URL); await pg3.wait_for_timeout(500)
        print(await pg3.evaluate('() => JSON.stringify(__app.S.goal)')); check('本地有存档时不被覆盖', '人类简史' in str(await pg3.evaluate("() => __app.S.goal && (__app.S.goal.title || __app.S.goal)")))
        # 删除全部数据：原生偏好里的模型配置要清掉
        store['yangyizhi.llm.v1'] = '{"base":"x","model":"m"}'
        await pg2.evaluate("() => { localStorage.setItem('yangyizhi.llm.v1','{}'); }")
        await pg2.evaluate("() => { const b = document.createElement('button'); b.dataset.act = 'deleteGo'; b.id = 'tmp-del'; document.body.appendChild(b); }"); await pg2.click('#tmp-del')
        await pg2.wait_for_timeout(500)
        check('删除后原生偏好里没有模型配置', 'yangyizhi.llm.v1' not in store)
        await b.close()
    check('无页面错误', not errs); print(errs[:3])
    raise SystemExit(0 if ok else 1)
asyncio.run(main())
