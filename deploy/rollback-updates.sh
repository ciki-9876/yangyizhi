#!/usr/bin/env bash
set -Eeuo pipefail
if [[ $# -ne 3 ]]; then echo 'Usage: deploy/rollback-updates.sh SSH_TARGET UPDATE_RELEASE_ID PUBLIC_MANIFEST_URL' >&2; exit 2; fi
target=$1 release_id=$2 manifest_url=$3
[[ $target =~ ^[A-Za-z0-9_.@:-]+$ && $release_id =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ && $manifest_url =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/yangyizhi/updates/stable\.json$ ]] || { echo 'Invalid rollback arguments.' >&2; exit 2; }
ssh -- "$target" "sudo bash -s -- '$release_id'" <<'REMOTE'
set -Eeuo pipefail
[[ $(id -u) -eq 0 && $# -eq 1 ]] || exit 2
id=$1
backup="/var/backups/yangyizhi-updates/$id/stable.previous.json"
destination=/srv/yangyizhi/updates/stable.json
[[ -s $backup && -d /srv/yangyizhi/updates && ! -L /srv/yangyizhi/updates && ! -L $destination ]] || { echo 'Previous signed manifest backup not found.' >&2; exit 1; }
temporary="/srv/yangyizhi/updates/.stable-rollback-$id.tmp"
install -m 0644 "$backup" "$temporary"
mv -f "$temporary" "$destination"
echo "RESTORED previous signed manifest from $id"
REMOTE
curl --fail --silent --show-error --max-time 15 "$manifest_url" >/dev/null
echo 'Previous update feed is live.'
