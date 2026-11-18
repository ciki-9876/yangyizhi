#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ $# -eq 4 && $(id -u) -eq 0 ]] || { echo 'Run this remote step as root with release id, archive, SHA-256, and health URL.' >&2; exit 2; }
release_id=$1 archive=$2 archive_sha=$3 health_url=$4
[[ $release_id =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ && $archive == "/tmp/yangyizhi-${release_id}.tgz" && $archive_sha =~ ^[a-f0-9]{64}$ && $health_url =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]+)?/healthz$ ]] || { echo 'Invalid release arguments.' >&2; exit 2; }
base=/opt/yangyizhi
releases="$base/releases"
release="$releases/$release_id"
exec 9>/run/lock/yangyizhi-deploy.lock
flock -n 9 || { echo 'A Yangyizhi deployment is already running.' >&2; exit 1; }
[[ -d $base && ! -L $base && ! -e $release ]] || { echo 'Deployment root missing, symlinked, or release already exists.' >&2; exit 1; }
[[ $(sha256sum "$archive" | cut -d ' ' -f1) == "$archive_sha" ]] || { echo 'Release archive SHA-256 mismatch.' >&2; exit 1; }
mkdir -p "$releases" "$base/backups"
[[ ! -L $releases && ! -L $base/backups ]] || { echo 'Release or backup directory must not be a symlink.' >&2; exit 1; }
chmod 0755 "$base" "$releases" "$base/backups"
if [[ -L $base/current ]]; then
  previous=$(readlink -f "$base/current" 2>/dev/null || true)
else
  [[ ! -e $base/current ]] || { echo 'Current release pointer exists but is not a symlink.' >&2; exit 1; }
  previous=
fi
[[ -z $previous || $previous == "$releases/"* && -d $previous ]] || { echo 'Current release points outside the isolated Yangyizhi directory.' >&2; exit 1; }
mkdir -m 0755 "$release"
python3 - "$archive" "$release" <<'PY'
from pathlib import Path, PurePosixPath
import sys, tarfile
archive, destination = Path(sys.argv[1]), Path(sys.argv[2])
allowed = {'site', 'updates'}
seen = set()
normalized = []
with tarfile.open(archive, 'r:gz') as tar:
    members = tar.getmembers()
    if not members or len(members) > 3000:
        raise SystemExit('Invalid archive member count.')
    total = 0
    for member in members:
        raw = member.name
        while raw.startswith('./'):
            raw = raw[2:]
        name = raw.rstrip('/')
        if not name:
            continue
        path = PurePosixPath(name)
        if path.is_absolute() or '\\' in name or any(part in {'', '..', '.'} for part in name.split('/')):
            raise SystemExit('Unsafe archive path.')
        if name in seen or not (member.isdir() or member.isfile()) or member.issym() or member.islnk():
            raise SystemExit('Duplicate or unsupported archive member.')
        seen.add(name)
        if name not in allowed and not any(name.startswith(prefix + '/') for prefix in ('site', 'updates')):
            raise SystemExit('Unexpected release file.')
        total += member.size
        if member.size < 0 or member.size > 100 * 1024 * 1024 or total > 700 * 1024 * 1024:
            raise SystemExit('Release exceeds size limits.')
        normalized.append((member, name))
    files = {name for member, name in normalized if member.isfile()}
    if not {'site/index.html', 'site/version.json'} <= files:
        raise SystemExit('Missing web entry or version metadata.')
    for member, name in normalized:
        if member.isdir():
            (destination / name).mkdir(parents=True, exist_ok=True, mode=0o755)
        else:
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            with tar.extractfile(member) as source, target.open('xb') as output:
                while chunk := source.read(1024 * 1024):
                    output.write(chunk)
            target.chmod(0o644)
PY

if [[ -n $previous ]]; then
  printf '%s\n' "$previous" > "$base/backups/$release_id.previous"
fi
next="$base/.current-$release_id"
ln -s "$release" "$next"
mv -Tf "$next" "$base/current"
rollback() {
  local status=$?
  trap - ERR
  if [[ $(readlink -f "$base/current" 2>/dev/null || true) == "$release" ]]; then
    if [[ -n $previous ]]; then
      ln -s "$previous" "$base/.rollback-$release_id"
      mv -Tf "$base/.rollback-$release_id" "$base/current"
      curl --fail --silent --show-error --max-time 10 "$health_url" >/dev/null || echo 'Previous release pointer restored; health check still fails.' >&2
    else
      rm -f "$base/current"
    fi
  fi
  echo "Deployment failed; release and backup pointer retained at $release." >&2
  exit "$status"
}
trap rollback ERR
for attempt in {1..20}; do
  if curl --fail --silent --show-error --max-time 5 "$health_url" | grep -qx 'ok'; then break; fi
  [[ $attempt -lt 20 ]] || { echo 'Health check failed.' >&2; false; }
  sleep 1
done
trap - ERR
rm -f "$archive"
printf 'LIVE\nrelease=%s\nprevious=%s\n' "$release" "$previous" > "$base/backups/$release_id.status"
printf 'HEALTHY %s\n' "$release_id"
