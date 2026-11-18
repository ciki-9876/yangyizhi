'use strict';

const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const { createHash, verify } = require('node:crypto');
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_INSTALLER_BYTES = 800 * 1024 * 1024;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const configFile = process.versions.electron && process.resourcesPath ? path.join(process.resourcesPath, 'update-config.json') : path.join(__dirname, '../update-config.json');
const config = JSON.parse(fssync.readFileSync(configFile, 'utf8'));

function compareVersion(left, right) {
  if (!SEMVER.test(left) || !SEMVER.test(right)) throw new Error('版本号无效');
  const a = left.split('.').map(Number), b = right.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

function verifyEnvelope(input, publicKey = config.publicKey) {
  const envelope = typeof input === 'string' ? JSON.parse(input) : input;
  if (!envelope || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') throw new Error('更新清单格式无效');
  const bytes = Buffer.from(envelope.payload, 'base64');
  if (!bytes.length || bytes.length > MAX_MANIFEST_BYTES) throw new Error('更新清单过大');
  if (!verify('RSA-SHA256', bytes, publicKey, Buffer.from(envelope.signature, 'base64'))) throw new Error('更新清单签名校验失败');
  const payload = JSON.parse(bytes.toString('utf8'));
  if (payload.protocol !== config.protocol || payload.channel !== 'stable' || !payload.clients || typeof payload.clients !== 'object') throw new Error('更新协议不兼容');
  return payload;
}

function updateEntry(payload, platform, arch) {
  if (platform === 'win32') return payload.clients.windows;
  if (platform === 'darwin') return payload.clients.macos?.[arch];
  return null;
}

async function fetchBytes(url, maxBytes) {
  const endpoint = new URL(config.manifestUrl);
  if (endpoint.protocol !== 'https:' || endpoint.hostname.endsWith('.invalid') || config.publicKey.startsWith('REPLACE')) throw new Error('更新服务还没有配置。当前版本可以正常使用。');
  const target = new URL(url);
  if (endpoint.protocol !== 'https:' || target.origin !== endpoint.origin || target.username || target.password || target.search || target.hash) throw new Error('更新下载地址不受信任');
  const response = await fetch(target, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(120000) });
  if (!response.ok && response.status === 404 && maxBytes === MAX_MANIFEST_BYTES) {
    throw new Error('更新服务尚未发布首个更新清单。当前版本可以正常使用。');
  }
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`);
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error('下载文件超过大小限制');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('下载内容为空');
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new Error('下载文件超过大小限制'); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  if (!length) throw new Error('下载文件为空');
  return Buffer.concat(chunks, length);
}

async function checkForUpdate({ platform, arch, currentVersion }) {
  const bytes = await fetchBytes(config.manifestUrl, MAX_MANIFEST_BYTES);
  const payload = verifyEnvelope(bytes.toString('utf8'));
  const item = updateEntry(payload, platform, arch);
  if (!item) return { available: false, currentVersion, message: '此平台暂未发布原生客户端更新' };
  if (!SEMVER.test(item.version) || !SEMVER.test(item.minimumCompatible) || !Number.isSafeInteger(item.bytes) || item.bytes < 1 || item.bytes > MAX_INSTALLER_BYTES || !/^[a-f0-9]{64}$/.test(item.sha256) || typeof item.releaseNotes !== 'string') throw new Error('客户端更新信息无效');
  const available = compareVersion(item.version, currentVersion) > 0;
  if (compareVersion(currentVersion, item.minimumCompatible) < 0) throw new Error('当前客户端版本过低，请从官方网站下载新版安装包');
  const endpoint = new URL(config.manifestUrl), target = new URL(item.url);
  if (target.origin !== endpoint.origin || target.protocol !== 'https:' || !target.pathname.includes(item.sha256) || target.pathname.includes('..')) throw new Error('客户端更新地址无效');
  return { available, currentVersion, version: item.version, minimumCompatible: item.minimumCompatible, releaseNotes: item.releaseNotes, bytes: item.bytes, sha256: item.sha256, url: item.url };
}

async function downloadVerified(item, destination) {
  const bytes = await fetchBytes(item.url, MAX_INSTALLER_BYTES);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== item.bytes || sha256 !== item.sha256) throw new Error('安装包校验失败，已取消保存');
  const temporary = `${destination}.${process.pid}.partial`;
  try {
    await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, destination);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
  return { path: destination, bytes: bytes.length, sha256 };
}

module.exports = { compareVersion, verifyEnvelope, checkForUpdate, downloadVerified };
