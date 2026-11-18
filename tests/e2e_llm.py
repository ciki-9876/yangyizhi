"""外部大模型接入的端到端测试（不依赖 window.claude）。
先起两个假服务：python3 mock_llm.py 8765 & python3 mock_llm.py 8766 --nocors &
再跑：python3 e2e_llm.py
"""
import asyncio, json, pathlib
from playwright.async_api import async_playwright
URL = (pathlib.Path(__file__).resolve().parent.parent / 'dist' / 'index.html').as_uri()
OK, BLOCKED = 'http://127.0.0.1:8765/v1', 'http://127.0.0.1:8766/v1'

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        async def page(init=None):
            ctx = await b.new_context(viewport={'width': 400, 'height': 860}, timezone_id='Asia/Shanghai', reduced_motion='reduce')
            pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            if init: await pg.add_init_script(init)
            await pg.goto(URL); await pg.wait_for_timeout(400); return pg
        async def connect(pg, base, key='sk-test', model='m-main'):
            await pg.click('[data-act="llmPreset"][data-x="custom"]')
            await pg.fill('#llm-base', base); await pg.fill('#llm-key', key); await pg.fill('#llm-model', model)
            await pg.click('[data-act="llmSave"]')
            await pg.wait_for_function("() => !document.querySelector('[data-act=llmSave]') || !document.querySelector('[data-act=llmSave]').disabled")
            return await pg.inner_text('#llm-msg') if await pg.locator('#llm-msg').count() else ''

        # 1) 引导页：没接模型时有入口；先试被拦的、错密钥的，再接通
        pg = await page()
        assert await pg.locator('[data-act="llm"]').count() == 1, 'onboarding entry missing'
        await pg.click('[data-act="llm"]')
        await pg.click('[data-act="llmPreset"][data-x="deepseek"]')
        assert 'api.deepseek.com' in await pg.input_value('#llm-base'); assert await pg.input_value('#llm-model') == 'deepseek-chat'
        await pg.click('[data-act="llmSave"]'); print('no key ->', await pg.inner_text('#llm-msg'))
        print('blocked ->', await connect(pg, BLOCKED))
        print('bad key ->', await connect(pg, OK, key='bad'))
        await pg.fill('#llm-base', 'http://example.com/v1')
        msg = await connect(pg, OK); print('ok ->', msg); assert '已启用' in msg
        await pg.screenshot(path='shots/llm-sheet.png', full_page=True)
        await pg.click('[data-act="llmBack"]')
        assert await pg.evaluate('document.body.classList.contains("ai-on")')
        assert await pg.locator('#f-ob1 [data-act="llm"]').count() == 0
        # 拆关走外部模型（返回带 ```json 围栏，测宽松解析）
        await pg.fill('#ob-title', '读完《人类简史》'); await pg.press('#ob-title', 'Enter'); await pg.wait_for_selector('#ob-first')
        first = await pg.input_value('#ob-first'); print('plan first step:', first); assert first.startswith('外部模型')
        await pg.click('#f-ob2 button[type=submit]'); await pg.wait_for_selector('#eggbtn')
        for _ in range(3): await pg.click('#eggbtn'); await pg.wait_for_timeout(200)
        await pg.wait_for_selector('#ob-name'); await pg.click('#f-ob3 button[type=submit]'); await pg.wait_for_selector('[data-act="report"]')
        # 讲述 → 回应前面带废话的 JSON
        await pg.click('[data-act="report"]'); await pg.fill('#rp-text', '读完第二章，读了两遍'); await pg.press('#rp-text', 'Enter'); await pg.wait_for_selector('#an-text')
        await pg.wait_for_timeout(1500)
        thread = await pg.inner_text('.thread'); print('react:', thread[-120:].replace('\n', ' | ')); assert '外部模型说' in thread
        await pg.click('[data-act="skipAnswer"]'); await pg.wait_for_selector('#pm-text')
        await pg.fill('#pm-text', '读第三章'); await pg.press('#pm-text', 'Enter'); await pg.wait_for_selector('[data-act="report"]')
        # 自由聊天
        assert await pg.locator('[data-act="chat"]').is_visible()
        await pg.click('[data-act="chat"]'); await pg.fill('#ch-text', '今天不想读'); await pg.press('#ch-text', 'Enter'); await pg.wait_for_selector('#ch-text')
        await pg.wait_for_timeout(1500)
        assert '外部模型回复' in await pg.inner_text('.thread'); await pg.click('[data-act="cancelTalk"]')
        # 设置页显示服务商；导出存档不含密钥
        await pg.click('#btn-settings'); txt = await pg.inner_text('.sheet'); print('settings:', [l for l in txt.split('\n') if '现写' in l])
        assert '127.0.0.1:8765' in txt
        await pg.click('#btn-export'); exp = await pg.input_value('#export-box'); assert 'sk-test' not in exp, 'key leaked into export'
        await pg.screenshot(path='shots/llm-settings.png', full_page=True)
        # 刷新后配置还在
        await pg.reload(); await pg.wait_for_timeout(500)
        assert await pg.evaluate('document.body.classList.contains("ai-on")')
        # 断开
        await pg.click('#btn-settings'); await pg.click('[data-act="llm"]'); await pg.click('[data-act="llmOff"]')
        assert not await pg.evaluate('document.body.classList.contains("ai-on")')
        assert await pg.evaluate('localStorage.getItem("yangyizhi.llm.v1")') is None

        # 2) Anthropic 协议
        pg2 = await page("localStorage.setItem('yangyizhi.llm.v1', JSON.stringify({preset:'custom',proto:'anthropic',base:'http://127.0.0.1:8765',key:'k',model:'claude-x'}))")
        await pg2.fill('#ob-title', '做一个小游戏'); await pg2.press('#ob-title', 'Enter'); await pg2.wait_for_selector('#ob-first')
        assert (await pg2.input_value('#ob-first')).startswith('外部模型'); print('anthropic proto ok')

        # 3) 宿主有 Claude 且用户填了外部模型 → 用外部模型
        HOST = "window.claude={use:async n=>n==='sample'?Object.assign(async()=>({text:'CLAUDE'}),{json:async()=>({kind:'read',milestones:[{name:'a',doneWhen:'b'},{name:'c',doneWhen:'d'}],firstStep:'CLAUDE 拆的'})}):null};localStorage.setItem('yangyizhi.llm.v1', JSON.stringify({preset:'custom',proto:'openai',base:'" + OK + "',key:'k',model:'m'}))"
        pg3 = await page(HOST)
        await pg3.fill('#ob-title', '学一首曲子'); await pg3.press('#ob-title', 'Enter'); await pg3.wait_for_selector('#ob-first')
        assert (await pg3.input_value('#ob-first')).startswith('外部模型'); print('external overrides host ok')
        print('errs', errs); await b.close()
        assert not errs

asyncio.run(main())
