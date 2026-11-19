import json
import pathlib

d = pathlib.Path(__file__).parent
root = d.parent
out = root / 'dist'
out.mkdir(exist_ok=True)
h = (d / 'shell.html').read_text(encoding='utf-8')
for tag, f in [('/*__CSS__*/', 'style.css'), ('/*__ENGINE__*/', 'pet.js'), ('/*__CRITTER__*/', 'critter.js'), ('/*__SFX__*/', 'sfx.js'), ('/*__FX__*/', 'fx.js'), ('/*__STRINGS__*/', 'strings.js'), ('/*__LLM__*/', 'llm.js'), ('/*__AGENT__*/', ['agent/guard.js', 'agent/rhythm.js', 'agent/core.js', 'agent/brain.js', 'agent/memory.js']), ('/*__CLOUD__*/', 'cloud.js'), ('/*__APP__*/', 'app.js')]:
    files = f if isinstance(f, list) else [f]
    src = '\n'.join((d / x).read_text(encoding='utf-8') for x in files)
    assert '</script' not in src.lower(), f
    h = h.replace(tag, src)
(out / 'index.html').write_text(h, encoding='utf-8')
(out / 'config.json').write_text((d / 'config.json').read_text(encoding='utf-8'), encoding='utf-8')   # 随包配置；远程配置地址写在里面的 remote
(out / 'cloud-config.json').write_text((root / 'clients' / 'cloud-config.json').read_text(encoding='utf-8'), encoding='utf-8')
versions = json.loads((root / 'clients' / 'versions.json').read_text(encoding='utf-8'))
(out / 'version.json').write_text(json.dumps({
    'version': versions['web'],
    'protocol': versions['updateProtocol'],
}, separators=(',', ':')) + '\n', encoding='utf-8')
print('built', len(h.encode('utf-8')), 'bytes')
