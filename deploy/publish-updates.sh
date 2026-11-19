#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
if [[ $# -ne 2 ]]; then echo 'Usage: deploy/publish-updates.sh SSH_TARGET SIGNED_UPDATE_DIRECTORY' >&2; exit 2; fi
target=$1 directory=$(cd "$2" && pwd)
[[ $target =~ ^[A-Za-z0-9_.@:-]+$ ]] || { echo 'Invalid SSH target alias.' >&2; exit 2; }
node "$(dirname "$0")/../scripts/verify-update-feed.mjs" "$directory"
archive=$(mktemp "${TMPDIR:-/tmp}/yangyizhi-updates.XXXXXXXX.tgz")
trap 'rm -f "$archive"' EXIT
entries=()
for path in "$directory"/*; do
  [[ -e $path ]] || continue
  name=${path##*/}
  if [[ $name == stable.json ]]; then
    [[ -f $path && ! -L $path ]] || { echo 'stable.json must be a regular file.' >&2; exit 1; }
  elif [[ $name =~ ^[a-f0-9]{64}$ ]]; then
    [[ -d $path && ! -L $path ]] || { echo 'Content-addressed update entries must be directories.' >&2; exit 1; }
  else
    echo "Unexpected update entry: $name" >&2
    exit 1
  fi
  entries+=("$name")
done
[[ ${#entries[@]} -ge 2 && -f $directory/stable.json ]] || { echo 'Signed feed or content-addressed assets are missing.' >&2; exit 1; }
tar -czf "$archive" -C "$directory" -- "${entries[@]}"
if command -v sha256sum >/dev/null 2>&1; then archive_sha=$(sha256sum "$archive" | cut -d ' ' -f1); else archive_sha=$(shasum -a 256 "$archive" | cut -d ' ' -f1); fi
release_id="$(date -u +%Y%m%dT%H%M%SZ)-${archive_sha:0:12}"
remote_archive="/var/lib/yangyizhi-deploy/incoming/yangyizhi-updates-${release_id}.tgz"
scp -O -- "$archive" "${target}:${remote_archive}"
ssh -- "$target" "sudo -n /usr/local/sbin/yangyizhi-update-deploy $release_id $remote_archive $archive_sha"
printf 'Published signed update feed release %s\n' "$release_id"
