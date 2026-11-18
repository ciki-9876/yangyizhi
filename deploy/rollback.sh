#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 3 ]]; then
  echo 'Usage: deploy/rollback.sh SSH_TARGET RELEASE_ID PUBLIC_HEALTH_URL' >&2
  exit 2
fi
target=$1 release_id=$2 health_url=$3
[[ $target =~ ^[A-Za-z0-9_.@:-]+$ && $release_id =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ && $health_url =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]+)?/healthz$ ]] || { echo 'Invalid rollback arguments.' >&2; exit 2; }
ssh -- "$target" "sudo bash -s -- '$release_id' '$health_url'" <<'REMOTE'
set -Eeuo pipefail
[[ $(id -u) -eq 0 && $# -eq 2 ]] || exit 2
id=$1 health=$2 base=/opt/yangyizhi
target="$base/releases/$id"
[[ -d $base && ! -L $base && -d $base/releases && ! -L $base/releases && -d $target && ! -L $target && $health =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]+)?/healthz$ ]] || { echo 'Rollback release or health URL invalid.' >&2; exit 1; }
exec 9>/run/lock/yangyizhi-deploy.lock
flock -n 9 || { echo 'A Yangyizhi deployment is already running.' >&2; exit 1; }
previous=$(readlink -f "$base/current" 2>/dev/null || true)
ln -s "$target" "$base/.rollback-$id"
mv -Tf "$base/.rollback-$id" "$base/current"
systemctl restart yangyizhi.service
if ! curl --fail --silent --show-error --max-time 15 "$health" | grep -q '"ok":true'; then
  if [[ -n $previous ]]; then ln -s "$previous" "$base/.rollback-recovery"; mv -Tf "$base/.rollback-recovery" "$base/current"; systemctl restart yangyizhi.service; fi
  echo 'Rollback candidate failed health check; previous pointer restored.' >&2
  exit 1
fi
printf 'ROLLED_BACK\nrelease=%s\nprevious=%s\n' "$target" "$previous" > "$base/backups/rollback-$id.status"
echo "HEALTHY $id"
REMOTE
