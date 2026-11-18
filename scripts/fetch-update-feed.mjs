import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEnvelope } from './release-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(path.join(root, 'clients/update-config.json'), 'utf8'));
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i]?.startsWith('--') || !process.argv[i + 1]) throw new Error('参数格式应为 --name value');
  args[process.argv[i].slice(2)] = process.argv[i + 1];
}
if (!args.url || !args.out) throw new Error('用法：node scripts/fetch-update-feed.mjs --url HTTPS_URL --out DIRECTORY');
const feedUrl = new URL(args.url);
const configuredUrl = new URL(config.manifestUrl);
if (feedUrl.href !== configuredUrl.href || feedUrl.protocol !== 'https:' || feedUrl.username || feedUrl.password || feedUrl.search || feedUrl.hash) throw new Error('更新清单地址与客户端固定配置不一致');
if (!config.publicKey.includes('BEGIN PUBLIC KEY')) {
  console.log('更新公钥尚未初始化，跳过读取旧更新清单。');
  process.exit(0);
}

const response = await fetch(feedUrl, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
if (response.status === 404) {
  console.log('尚无已发布的更新清单。');
  process.exit(0);
}
if (!response.ok) throw new Error(`读取现有更新清单失败（HTTP ${response.status}）`);
const envelopeText = await response.text();
if (Buffer.byteLength(envelopeText) > 256 * 1024) throw new Error('现有更新清单过大');
const envelope = JSON.parse(envelopeText);
const payload = readEnvelope(envelope, config.publicKey);
const assets = [payload.web, ...Object.values(payload.clients).flatMap(value => value?.version ? [value] : Object.values(value || {}))]
  .flatMap(asset => asset.installer ? [asset, asset.installer] : [asset]);
const out = path.resolve(args.out);
await mkdir(out, { recursive: true });
for (const asset of assets) {
  const url = new URL(asset.url);
  const name = decodeURIComponent(url.pathname.split('/').pop());
  if (url.protocol !== 'https:' || url.origin !== feedUrl.origin || url.username || url.password || url.search || url.hash || !url.pathname.includes(asset.sha256) || !name || name.includes('/') || name === '.' || name === '..') throw new Error('现有更新文件地址不受信任');
  if (!Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > 800 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error(`更新文件元数据无效：${name}`);
  const fileResponse = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(120000) });
  if (!fileResponse.ok) throw new Error(`下载旧版本文件失败（HTTP ${fileResponse.status}）：${name}`);
  const bytes = Buffer.from(await fileResponse.arrayBuffer());
  if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`旧版本文件校验失败：${name}`);
  const target = path.join(out, asset.sha256, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx', mode: 0o644 });
}
await writeFile(path.join(out, 'stable.json'), `${JSON.stringify(envelope, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
console.log(`已恢复 ${assets.length} 个校验通过的更新文件。`);
