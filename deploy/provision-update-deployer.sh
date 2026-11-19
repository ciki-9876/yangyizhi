#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $# -eq 1 && $(id -u) -eq 0 ]] || { echo 'Run as root with the deploy public key as the only argument.' >&2; exit 2; }
public_key=$1
[[ $public_key =~ ^ssh-ed25519[[:space:]]+[A-Za-z0-9+/]+=*([[:space:]][A-Za-z0-9_.@-]+)?$ ]] || { echo 'Expected one Ed25519 SSH public key.' >&2; exit 2; }

user=yangyizhi-deploy
home=/var/lib/yangyizhi-deploy
incoming=$home/incoming
key_blob=$(awk '{print $2}' <<< "$public_key")
if ! id "$user" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$home" --shell /bin/bash "$user"
  passwd -l "$user" >/dev/null
fi
install -d -o root -g root -m 0755 "$home"
install -d -o "$user" -g "$user" -m 0700 "$incoming"
install -d -o "$user" -g "$user" -m 0700 "$home/.ssh"

install -o root -g root -m 0755 "$(dirname "$0")/yangyizhi-deploy-ssh" /usr/local/sbin/yangyizhi-deploy-ssh
install -o root -g root -m 0750 "$(dirname "$0")/remote-updates-deploy.sh" /usr/local/sbin/yangyizhi-update-deploy
sudoers=/etc/sudoers.d/yangyizhi-deploy
printf '%s ALL=(root) NOPASSWD: /usr/local/sbin/yangyizhi-update-deploy *\n' "$user" > "$sudoers"
chmod 0440 "$sudoers"
visudo -cf "$sudoers"

authorized_keys="$home/.ssh/authorized_keys"
touch "$authorized_keys"
chown "$user:$user" "$authorized_keys"
chmod 0600 "$authorized_keys"
if ! awk -v blob="$key_blob" '$2 == blob {found=1} END {exit !found}' "$authorized_keys"; then
  printf 'restrict,command="/usr/local/sbin/yangyizhi-deploy-ssh" %s\n' "$public_key" >> "$authorized_keys"
fi
printf 'Yangyizhi update deploy access is provisioned for %s.\n' "$user"
