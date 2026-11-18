#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

command -v openssl >/dev/null || { echo '需要安装 OpenSSL。' >&2; exit 1; }
command -v keytool >/dev/null || { echo '需要安装 Java JDK（含 keytool）。' >&2; exit 1; }
signing_dir="${HOME:?}/.local/share/yangyizhi/signing"
mkdir -p "$signing_dir"
chmod 0700 "$signing_dir"
private_key="$signing_dir/update-private.pem"
android_keystore="$signing_dir/android-release.jks"
if [[ -e $private_key || -e $android_keystore ]]; then
  echo '签名材料已存在；脚本不会覆盖。先检查并备份现有密钥。' >&2
  exit 1
fi

UPDATE_KEY_PASSPHRASE=${UPDATE_KEY_PASSPHRASE:-}
ANDROID_KEYSTORE_PASSWORD=${ANDROID_KEYSTORE_PASSWORD:-}
ANDROID_KEY_PASSWORD=${ANDROID_KEY_PASSWORD:-}
CERT_YEARS=${CERT_YEARS:-}
if [[ -z $UPDATE_KEY_PASSPHRASE ]]; then read -r -s -p '更新清单私钥口令：' UPDATE_KEY_PASSPHRASE; echo; fi
if [[ -z $ANDROID_KEYSTORE_PASSWORD ]]; then read -r -s -p 'Android keystore 口令：' ANDROID_KEYSTORE_PASSWORD; echo; fi
if [[ -z $ANDROID_KEY_PASSWORD ]]; then read -r -s -p 'Android key 口令（可与 keystore 口令相同）：' ANDROID_KEY_PASSWORD; echo; fi
if [[ -z $CERT_YEARS ]]; then read -r -p 'Android 证书有效年数 [30]：' CERT_YEARS; fi
CERT_YEARS=${CERT_YEARS:-30}
[[ $CERT_YEARS =~ ^[1-9][0-9]?$ ]] || { echo '证书有效期无效。' >&2; exit 2; }
[[ ${#UPDATE_KEY_PASSPHRASE} -ge 24 && ${#ANDROID_KEYSTORE_PASSWORD} -ge 24 && ${#ANDROID_KEY_PASSWORD} -ge 24 ]] || { echo '签名口令至少需要 24 个字符。' >&2; exit 2; }
export UPDATE_KEY_PASSPHRASE ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_PASSWORD
temporary="$signing_dir/.initializing-$$"
mkdir -m 0700 "$temporary"
cleanup() { unset UPDATE_KEY_PASSPHRASE ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_PASSWORD; rm -rf "$temporary"; }
trap cleanup EXIT

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -aes-256-cbc -pass env:UPDATE_KEY_PASSPHRASE -out "$temporary/update-private.pem"
openssl pkey -in "$temporary/update-private.pem" -passin env:UPDATE_KEY_PASSPHRASE -pubout -out "$temporary/update-public.pem"
keytool -genkeypair -noprompt -keystore "$temporary/android-release.jks" -storetype JKS \
  -alias yangyizhi-release -keyalg RSA -keysize 3072 -validity "$((CERT_YEARS * 365))" \
  -dname 'CN=Yangyizhi Android Release, OU=Release, O=Yangyizhi' \
  -storepass:env ANDROID_KEYSTORE_PASSWORD -keypass:env ANDROID_KEY_PASSWORD
chmod 0600 "$temporary"/*
mv "$temporary/update-private.pem" "$private_key"
mv "$temporary/android-release.jks" "$android_keystore"
cp "$temporary/update-public.pem" "$signing_dir/update-public.pem"
chmod 0600 "$signing_dir/update-public.pem"
cp "$signing_dir/update-public.pem" "$(dirname "$0")/../clients/update-public-key.pem"
node --input-type=module - "$signing_dir/update-public.pem" "$(dirname "$0")/../clients/update-config.json" <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';
const [publicPath, configPath] = process.argv.slice(2);
const config = JSON.parse(await readFile(configPath, 'utf8'));
config.publicKey = (await readFile(publicPath, 'utf8')).trim();
await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o644 });
NODE
keytool -exportcert -keystore "$android_keystore" -alias yangyizhi-release -storepass:env ANDROID_KEYSTORE_PASSWORD -file "$signing_dir/android-release-cert.der" >/dev/null
chmod 0600 "$signing_dir/android-release-cert.der"
printf '\n公钥已写入 clients/update-config.json；私钥与 Android keystore 在 %s。\n' "$signing_dir"
printf 'Android 证书 SHA-256：'
keytool -list -v -keystore "$android_keystore" -alias yangyizhi-release -storepass:env ANDROID_KEYSTORE_PASSWORD | awk -F': ' '/SHA256:/{gsub(/:/,"",$2);print tolower($2);exit}'
echo '请先将 signing 目录加密备份到两处受控的离线位置，再配置 GitHub Secrets。不要把 signing 目录提交到 Git。'
