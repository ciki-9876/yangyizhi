#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $# -eq 3 && $(id -u) -eq 0 ]] || { echo 'Run as root with release id, archive, and SHA-256.' >&2; exit 2; }
release_id=$1 archive=$2 archive_sha=$3
[[ $release_id =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ && $archive == "/tmp/yangyizhi-updates-${release_id}.tgz" && $archive_sha =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid update release arguments.' >&2; exit 2; }
destination=/srv/yangyizhi/updates
staging="/srv/yangyizhi/.updates-stage-$release_id"
backup="/var/backups/yangyizhi-updates/$release_id"
exec 9>/run/lock/yangyizhi-deploy.lock
flock -n 9 || { echo 'A Yangyizhi deployment is already running.' >&2; exit 1; }
[[ $(sha256sum "$archive" | cut -d ' ' -f1) == "$archive_sha" ]] || { echo 'Archive SHA-256 mismatch.' >&2; exit 1; }
mkdir -p /srv/yangyizhi "$destination" /var/backups/yangyizhi-updates "$backup"
[[ ! -L /srv/yangyizhi && ! -L "$destination" && ! -L /var/backups/yangyizhi-updates ]] || { echo 'Update directories must not be symlinks.' >&2; exit 1; }
rm -rf -- "$staging"; mkdir -m 0700 "$staging"
python3 - "$archive" "$staging" <<'PY'
from pathlib import Path, PurePosixPath
import hashlib, sys, tarfile
archive, destination = Path(sys.argv[1]), Path(sys.argv[2])
seen, files = set(), []
with tarfile.open(archive, 'r:gz') as tar:
    members = tar.getmembers()
    if not members or len(members) > 5000: raise SystemExit('Invalid archive member count.')
    total = 0
    for member in members:
        name = member.name
        while name.startswith('./'): name = name[2:]
        name = name.rstrip('/')
        if not name: continue
        if PurePosixPath(name).is_absolute() or '\\' in name or any(part in {'', '.', '..'} for part in name.split('/')): raise SystemExit('Unsafe archive path.')
        if name in seen or not (member.isdir() or member.isfile()) or member.issym() or member.islnk(): raise SystemExit('Duplicate or unsupported archive member.')
        seen.add(name); total += member.size
        if member.size < 0 or member.size > 500*1024*1024 or total > 2*1024*1024*1024: raise SystemExit('Update archive exceeds size limits.')
        parts = name.split('/')
        if name != 'stable.json' and not (len(parts) == 2 and len(parts[0]) == 64 and all(c in '0123456789abcdef' for c in parts[0])): raise SystemExit('Unexpected update file.')
        files.append((member, name))
    if 'stable.json' not in {name for member, name in files if member.isfile()}: raise SystemExit('Signed stable.json is missing.')
    for member, name in files:
        target = destination / name
        if member.isdir(): target.mkdir(parents=True, exist_ok=True, mode=0o755)
        else:
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            with tar.extractfile(member) as source, target.open('xb') as output:
                digest = hashlib.sha256()
                while chunk := source.read(1024*1024): output.write(chunk); digest.update(chunk)
            if name != 'stable.json' and digest.hexdigest() != name.split('/')[0]: raise SystemExit('Content address digest mismatch.')
PY
if [[ -s "$destination/stable.json" ]]; then cp -p "$destination/stable.json" "$backup/stable.previous.json"; fi
while IFS= read -r -d '' source; do
  relative=${source#"$staging"/}; mkdir -p "$destination/$(dirname "$relative")"; chmod 0755 "$destination/$(dirname "$relative")"
  if [[ ! -e "$destination/$relative" ]]; then install -m 0644 "$source" "$destination/$relative"; fi
done < <(find "$staging" -mindepth 2 -type f ! -name stable.json -print0)
install -m 0644 "$staging/stable.json" "$destination/.stable-$release_id.tmp"
mv -f "$destination/.stable-$release_id.tmp" "$destination/stable.json"
chmod 0755 /srv/yangyizhi "$destination"; rm -rf -- "$staging"; rm -f "$archive"
printf 'published=%s\nprevious-manifest=%s\n' "$release_id" "$backup/stable.previous.json" > "$backup/status"
echo "UPDATE_FEED_PUBLISHED $release_id"
