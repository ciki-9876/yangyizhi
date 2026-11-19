#!/usr/bin/env bash
set -Eeuo pipefail
if [[ $# -ne 3 ]]; then echo 'Usage: deploy/rollback-updates.sh SSH_TARGET UPDATE_RELEASE_ID PUBLIC_MANIFEST_URL' >&2; exit 2; fi
target=$1 release_id=$2 manifest_url=$3
[[ $target =~ ^[A-Za-z0-9_.@:-]+$ && $release_id =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ && $manifest_url =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/yangyizhi/updates/stable\.json$ ]] || { echo 'Invalid rollback arguments.' >&2; exit 2; }
ssh -- "$target" "sudo -n /usr/local/sbin/yangyizhi-update-deploy rollback $release_id"
curl --fail --silent --show-error --max-time 15 "$manifest_url" >/dev/null
echo 'Previous update feed is live.'
