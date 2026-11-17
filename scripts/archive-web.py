#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--dist', default='dist')
parser.add_argument('--out', default='artifacts/web/web.zip')
args = parser.parse_args()
root = pathlib.Path(args.dist).resolve()
target = pathlib.Path(args.out).resolve()
files = sorted(root.rglob('*'))
if not (root / 'index.html').is_file() or not (root / 'version.json').is_file():
    raise SystemExit('dist must contain index.html and version.json')
target.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in files:
        if file.is_symlink():
            raise SystemExit(f'symlink is not allowed: {file}')
        if file.is_file():
            relative = file.relative_to(root).as_posix()
            info = zipfile.ZipInfo(relative, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, file.read_bytes())
bytes_ = target.read_bytes()
digest = hashlib.sha256(bytes_).hexdigest()
(target.parent / 'SHA256SUMS.txt').write_text(f'{digest}  {target.name}\n', encoding='ascii')
version = json.loads((root / 'version.json').read_text(encoding='utf-8'))['version']
print(json.dumps({'version': version, 'file': str(target), 'bytes': len(bytes_), 'sha256': digest}, ensure_ascii=False))
