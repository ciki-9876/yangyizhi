import pathlib
d = pathlib.Path(__file__).parent
out = d.parent / 'dist'
out.mkdir(exist_ok=True)
h = (d / 'shell.html').read_text(encoding='utf-8')
for tag, f in [('/*__CSS__*/', 'style.css'), ('/*__ENGINE__*/', 'pet.js'), ('/*__CRITTER__*/', 'critter.js'), ('/*__SFX__*/', 'sfx.js'), ('/*__FX__*/', 'fx.js'), ('/*__STRINGS__*/', 'strings.js'), ('/*__APP__*/', 'app.js')]:
    src = (d / f).read_text(encoding='utf-8')
    assert '</script' not in src.lower(), f
    h = h.replace(tag, src)
(out / 'index.html').write_text(h, encoding='utf-8')
print('built', len(h.encode('utf-8')), 'bytes')
