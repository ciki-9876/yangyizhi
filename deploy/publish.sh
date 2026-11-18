#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ $# -ne 3 ]]; then
  echo 'Usage: deploy/publish.sh SSH_TARGET PUBLIC_HEALTH_URL RELEASE_DIR' >&2
  exit 2
fi
target=$1 health_url=$2 release_dir=$(cd "$3" && pwd)
[[ $target =~ ^[A-Za-z0-9_.@:-]+$ ]] || { echo 'Invalid SSH target alias.' >&2; exit 2; }
[[ $health_url =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]+)?/healthz$ ]] || { echo 'Health URL must be a plain HTTPS /healthz URL.' >&2; exit 2; }
[[ -s $release_dir/site/index.html && -s $release_dir/site/version.json ]] || { echo 'Release must include site/index.html and site/version.json.' >&2; exit 2; }
archive=$(mktemp "${TMPDIR:-/tmp}/yangyizhi-release.XXXXXXXX.tgz")
trap 'rm -f "$archive"' EXIT
tar -czf "$archive" -C "$release_dir" .
if command -v sha256sum >/dev/null 2>&1; then
  archive_sha=$(sha256sum "$archive" | cut -d ' ' -f1)
else
  archive_sha=$(shasum -a 256 "$archive" | cut -d ' ' -f1)
fi
release_id="$(date -u +%Y%m%dT%H%M%SZ)-${archive_sha:0:12}"
remote_archive="/tmp/yangyizhi-${release_id}.tgz"
scp -- "$archive" "${target}:${remote_archive}"
ssh -- "$target" "sudo bash -s -- '$release_id' '$remote_archive' '$archive_sha' '$health_url'" < "$(dirname "$0")/remote-deploy.sh"
printf 'Published release %s to %s\n' "$release_id" "$health_url"
