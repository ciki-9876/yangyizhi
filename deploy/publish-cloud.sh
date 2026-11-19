#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ $# -ne 2 ]]; then
  echo 'Usage: deploy/publish-cloud.sh SSH_TARGET PUBLIC_HTTPS_HEALTH_URL' >&2
  exit 2
fi
target=$1 health_url=$2
[[ $target =~ ^[A-Za-z0-9_.@:-]+$ ]] || { echo 'Invalid SSH target alias.' >&2; exit 2; }
[[ $health_url =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]+)?/healthz$ ]] || { echo 'Health URL must be a plain HTTPS /healthz URL.' >&2; exit 2; }
[[ -s dist/index.html && -s dist/cloud-config.json && -s server/server.mjs && -s scripts/workspace-backup.mjs ]] || { echo 'Build the Web app first and verify server and backup files.' >&2; exit 2; }
node --input-type=module -e "import { createHash } from 'node:crypto'; import { readFileSync } from 'node:fs'; const c=JSON.parse(readFileSync('dist/cloud-config.json')); if(c.webApiBasePath!=='api/' || !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?\/[A-Za-z0-9._~/-]+\/$/.test(c.nativeApiBaseUrl)) throw Error('Cloud API URLs are missing or invalid'); if(createHash('sha256').update(readFileSync('dist/index.html')).digest('hex').length!==64) throw Error('Invalid Web build')"

archive=$(mktemp "${TMPDIR:-/tmp}/yangyizhi-cloud.XXXXXXXX.tgz")
trap 'rm -f "$archive"' EXIT
tar -czf "$archive" server dist scripts/workspace-backup.mjs
if command -v sha256sum >/dev/null 2>&1; then archive_sha=$(sha256sum "$archive" | cut -d ' ' -f1); else archive_sha=$(shasum -a 256 "$archive" | cut -d ' ' -f1); fi
release_id="$(date -u +%Y%m%dT%H%M%SZ)-${archive_sha:0:12}"
remote_archive="/tmp/yangyizhi-cloud-${release_id}.tgz"
scp -- "$archive" "${target}:${remote_archive}"
ssh -- "$target" "sudo bash -s -- '$release_id' '$remote_archive' '$archive_sha' '$health_url'" < "$(dirname "$0")/remote-cloud-deploy.sh"
printf 'Published cloud service release %s; health check passed at %s\n' "$release_id" "$health_url"
