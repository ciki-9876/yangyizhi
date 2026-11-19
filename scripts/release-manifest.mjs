import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const digest = /^[a-f0-9]{64}$/;
function compareVersion(left, right) {
  if (!semver.test(left) || !semver.test(right)) throw new Error('发布版本无效');
  const a = left.split('.').map(Number), b = right.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function validatePayload(payload) {
  if (!payload || payload.protocol !== 1 || payload.channel !== 'stable' || typeof payload.publishedAt !== 'string') throw new Error('发布清单头部无效');
  const validateAsset = (asset, label) => {
    if (!asset || !semver.test(asset.version || '') || !semver.test(asset.minimumCompatible || '') || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || !digest.test(asset.sha256 || '') || typeof asset.url !== 'string' || !asset.url.startsWith('https://') || typeof asset.releaseNotes !== 'string' || !asset.releaseNotes.trim()) throw new Error(`${label} 发布项不完整`);
    const url = new URL(asset.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.includes(asset.sha256)) throw new Error(`${label} 下载地址不安全`);
    if (asset.installer) {
      const installerUrl = new URL(asset.installer.url);
      if (!Number.isSafeInteger(asset.installer.bytes) || asset.installer.bytes < 1 || !digest.test(asset.installer.sha256 || '') || installerUrl.protocol !== 'https:' || installerUrl.username || installerUrl.password || installerUrl.search || installerUrl.hash || !installerUrl.pathname.includes(asset.installer.sha256)) throw new Error(`${label} 安装器信息无效`);
    }
  };
  validateAsset(payload.web, 'web');
  for (const [platform, value] of Object.entries(payload.clients || {})) {
    if (platform === 'macos') {
      for (const [arch, asset] of Object.entries(value || {})) {
        if (!['arm64', 'x64'].includes(arch)) throw new Error('macOS 架构不支持');
        validateAsset(asset, `macOS ${arch}`);
      }
    } else {
      validateAsset(value, platform);
      if (platform === 'android' && (!Number.isSafeInteger(value.versionCode) || value.versionCode < 1)) throw new Error('Android versionCode 无效');
      if (platform === 'android' && !digest.test(value.certificate || '')) throw new Error('Android 发布证书摘要缺失');
    }
  }
  if (!payload.clients || Object.keys(payload.clients).length === 0) throw new Error('没有客户端发布项');
  return payload;
}

export function makeEnvelope(payload, privateKey) {
  validatePayload(payload);
  const bytes = Buffer.from(JSON.stringify(payload));
  return { payload: bytes.toString('base64'), signature: sign('RSA-SHA256', bytes, privateKey).toString('base64') };
}

export function loadPrivateKey(pem, passphrase) {
  try {
    return passphrase ? createPrivateKey({ key: pem, passphrase }) : createPrivateKey(pem);
  } catch (error) {
    throw new Error(passphrase ? '更新私钥无法解锁，请检查 UPDATE_KEY_PASSPHRASE。' : '更新私钥已加密；请通过 UPDATE_KEY_PASSPHRASE 环境变量提供口令。', { cause: error });
  }
}

export function readEnvelope(envelope, publicKey) {
  if (!envelope || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') throw new Error('签名清单信封无效');
  const bytes = Buffer.from(envelope.payload, 'base64');
  if (bytes.length > 256 * 1024 || !verify('RSA-SHA256', bytes, publicKey, Buffer.from(envelope.signature, 'base64'))) throw new Error('发布清单签名无效');
  return validatePayload(JSON.parse(bytes.toString('utf8')));
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || !argv[i + 1]) throw new Error('参数格式应为 --name value');
    result[argv[i].slice(2)] = argv[i + 1];
  }
  return result;
}

async function fileInfo(file, url) {
  const bytes = await readFile(file);
  return { version: '', url, bytes: bytes.length, sha256: sha256(bytes) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.assets || !args.out || !args.baseUrl || !args.notes || !args.privateKey) throw new Error('用法：node scripts/release-manifest.mjs --assets DIR --out FILE --baseUrl https://host/path/ --notes FILE --privateKey PATH');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const versions = JSON.parse(await readFile(path.join(root, 'clients/versions.json'), 'utf8'));
  const notes = (await readFile(args.notes, 'utf8')).trim();
  const base = new URL(args.baseUrl);
  if (base.protocol !== 'https:' || !base.pathname.endsWith('/') || base.hostname.endsWith('.invalid')) throw new Error('正式下载地址必须是可用的 HTTPS 目录 URL');
  const config = JSON.parse(await readFile(path.join(root, 'clients/update-config.json'), 'utf8'));
  const manifestUrl = new URL(config.manifestUrl);
  if (manifestUrl.origin !== base.origin || manifestUrl.pathname !== base.pathname + 'stable.json') throw new Error('baseUrl 必须与客户端固定的 manifestUrl 目录相同');
  const directory = path.resolve(args.assets);
  const assets = {};
  const macInstallers = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile()) throw new Error('发布目录只允许普通文件');
    const file = path.join(directory, entry.name);
    const item = await fileInfo(file, base.href + entry.name);
    if (item.bytes < 1) throw new Error(`空文件：${entry.name}`);
    const versioned = { ...item, url: base.href + item.sha256 + '/' + encodeURIComponent(entry.name), releaseNotes: notes };
    if (entry.name === 'web.zip') assets.web = { ...versioned, version: versions.web, minimumCompatible: versions.web };
    else if (/^Yangyizhi-\d+\.\d+\.\d+-windows-x64-setup\.exe$/.test(entry.name)) {
      if (entry.name !== `Yangyizhi-${versions.windows}-windows-x64-setup.exe`) throw new Error('Windows 安装包文件名与版本源不一致');
      assets.windows = { ...versioned, version: versions.windows, minimumCompatible: versions.minimumCompatible.windows };
    }
    else if (/^Yangyizhi-\d+\.\d+\.\d+-android\.apk$/.test(entry.name)) {
      if (entry.name !== `Yangyizhi-${versions.android.version}-android.apk`) throw new Error('Android APK 文件名与版本源不一致');
      const certificate = process.env.ANDROID_CERT_SHA256;
      if (!digest.test(certificate || '')) throw new Error('ANDROID_CERT_SHA256 必须来自已验证的正式 APK 签名报告');
      assets.android = { ...versioned, version: versions.android.version, versionCode: versions.android.versionCode, minimumCompatible: versions.minimumCompatible.android, certificate };
    }
    else if (/^Yangyizhi-\d+\.\d+\.\d+-mac-(arm64|x64)\.zip$/.test(entry.name)) {
      const arch = entry.name.match(/-mac-(arm64|x64)\.zip$/)[1];
      if (entry.name !== `Yangyizhi-${versions.macos[arch]}-mac-${arch}.zip`) throw new Error(`macOS ${arch} 更新 ZIP 文件名与版本源不一致`);
      assets.macos ||= {};
      assets.macos[arch] = { ...versioned, version: versions.macos[arch], minimumCompatible: versions.minimumCompatible.macos };
    } else if (/^Yangyizhi-\d+\.\d+\.\d+-mac-(arm64|x64)\.dmg$/.test(entry.name)) {
      const arch = entry.name.match(/-mac-(arm64|x64)\.dmg$/)[1];
      assets.macos ||= {};
      if (entry.name !== `Yangyizhi-${versions.macos[arch]}-mac-${arch}.dmg`) throw new Error(`macOS ${arch} DMG 文件名与版本源不一致`);
      macInstallers[arch] = { url: versioned.url, bytes: versioned.bytes, sha256: versioned.sha256 };
    } else throw new Error(`不认识的发布文件名：${entry.name}`);
  }
  if (!assets.web) throw new Error('缺少 web.zip');
  for (const [arch, installer] of Object.entries(macInstallers)) {
    if (!assets.macos?.[arch]) throw new Error(`macOS ${arch} 需要 ZIP 更新包才能发布 DMG 下载入口`);
    assets.macos[arch].installer = installer;
  }
  const privateKeyPem = await readFile(args.privateKey, 'utf8');
  const privateKey = loadPrivateKey(privateKeyPem, process.env.UPDATE_KEY_PASSPHRASE);
  const publicKey = createPublicKey(privateKey);
  const clients = Object.fromEntries(Object.entries(assets).filter(([key]) => key !== 'web'));
  let previous;
  if (args.previous) {
    previous = readEnvelope(JSON.parse(await readFile(args.previous, 'utf8')), publicKey);
    const webOrder = compareVersion(assets.web.version, previous.web.version);
    if (webOrder < 0 || (webOrder === 0 && assets.web.sha256 !== previous.web.sha256)) throw new Error('Web 版本必须递增；相同版本只能复用完全相同的文件');
    for (const [platform, item] of Object.entries(clients)) {
      if (platform === 'macos') {
        for (const [arch, candidate] of Object.entries(item)) {
          const old = previous.clients.macos?.[arch];
          if (old && compareVersion(candidate.version, old.version) <= 0) throw new Error(`macOS ${arch} 版本必须递增`);
        }
      } else if (previous.clients[platform]) {
        const old = previous.clients[platform];
        if (compareVersion(item.version, old.version) <= 0) throw new Error(`${platform} 版本必须递增`);
        if (platform === 'android' && item.versionCode <= old.versionCode) throw new Error('Android versionCode 必须递增');
      }
    }
    for (const [platform, value] of Object.entries(previous.clients)) {
      if (platform === 'macos') {
        clients.macos ||= {};
        for (const [arch, item] of Object.entries(value)) if (!clients.macos[arch]) clients.macos[arch] = item;
      } else if (!clients[platform]) clients[platform] = value;
    }
  }
  const payload = validatePayload({ protocol: versions.updateProtocol, channel: 'stable', publishedAt: new Date().toISOString(), web: assets.web, clients });
  const envelope = makeEnvelope(payload, privateKey);
  readEnvelope(envelope, publicKey);
  const out = path.resolve(args.out);
  const outputRoot = path.dirname(out);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const source = path.join(directory, entry.name);
    const bytes = await readFile(source);
    const target = path.join(outputRoot, sha256(bytes), entry.name);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  if (previous && args.previous) {
    const previousRoot = path.dirname(path.resolve(args.previous));
    const previousAssets = [previous.web, ...Object.values(previous.clients).flatMap(value => value && value.version ? [value] : Object.values(value || {}))]
      .flatMap(item => item.installer ? [item, item.installer] : [item]);
    for (const item of previousAssets) {
      const name = decodeURIComponent(new URL(item.url).pathname.split('/').pop());
      const source = path.join(previousRoot, item.sha256, name);
      const bytes = await readFile(source);
      if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256) throw new Error(`上一版更新文件缺失或摘要错误：${name}`);
      const target = path.join(outputRoot, item.sha256, name);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
    }
  }
  await writeFile(out, JSON.stringify(envelope, null, 2) + '\n', { mode: 0o644 });
  console.log(JSON.stringify({ manifest: out, artifacts: Object.fromEntries(Object.entries(assets).map(([key, item]) => [key, Array.isArray(item) ? item.map(x => ({ version: x.version, bytes: x.bytes, sha256: x.sha256 })) : { version: item.version, bytes: item.bytes, sha256: item.sha256 }])) }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
