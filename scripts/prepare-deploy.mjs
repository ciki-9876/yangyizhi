import { createHash, verify } from 'node:crypto';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

function args(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || !argv[i + 1]) throw new Error('参数格式应为 --name value');
    result[argv[i].slice(2)] = argv[i + 1];
  }
  return result;
}

const values = args(process.argv.slice(2));
if (!values.web || !values.updates || !values.out) throw new Error('用法：node scripts/prepare-deploy.mjs --web dist --updates signed-update-directory --out release-directory');
const web = path.resolve(values.web), updates = path.resolve(values.updates), out = path.resolve(values.out);
if ((await stat(path.join(web, 'index.html'))).size < 1 || !(await stat(path.join(updates, 'stable.json'))).isFile()) throw new Error('缺少 Web 首页或签名更新清单');
const updateConfig = JSON.parse(await readFile(new URL('../clients/update-config.json', import.meta.url), 'utf8'));
const publicKey = updateConfig.publicKey;
if (!publicKey.includes('BEGIN PUBLIC KEY')) throw new Error('客户端更新公钥尚未初始化');
const envelope = JSON.parse(await readFile(path.join(updates, 'stable.json'), 'utf8'));
const payloadBytes = Buffer.from(envelope.payload || '', 'base64');
if (!payloadBytes.length || !verify('RSA-SHA256', payloadBytes, publicKey, Buffer.from(envelope.signature || '', 'base64'))) throw new Error('更新清单签名校验失败');
const payload = JSON.parse(payloadBytes.toString('utf8'));
const artifacts = [payload.web, ...Object.values(payload.clients || {}).flatMap(value => value && value.version ? [value] : Object.values(value || {}))]
  .flatMap(artifact => artifact.installer ? [artifact, artifact.installer] : [artifact]);
for (const artifact of artifacts) {
  const url = new URL(artifact.url);
  const name = decodeURIComponent(url.pathname.split('/').pop());
  const file = path.join(updates, artifact.sha256, name);
  const bytes = await readFile(file);
  if (bytes.length !== artifact.bytes || createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) throw new Error(`更新文件摘要或大小不匹配：${name}`);
}
await mkdir(out, { recursive: false });
await cp(web, path.join(out, 'site'), { recursive: true, errorOnExist: true, force: false });
await cp(updates, path.join(out, 'updates'), { recursive: true, errorOnExist: true, force: false });
await writeFile(path.join(out, 'site', 'healthz'), 'ok\n');
const files = [];
async function walk(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await walk(path.join(directory, entry.name), name);
    else if (entry.isFile()) files.push(name);
    else throw new Error(`发布目录中含特殊文件：${name}`);
  }
}
await walk(out);
if (!files.includes('site/index.html') || !files.includes('site/version.json') || !files.includes('updates/stable.json')) throw new Error('发布目录结构校验失败');
console.log(JSON.stringify({ output: out, files: files.length, siteFiles: files.filter(x => x.startsWith('site/')).length, updateFiles: files.filter(x => x.startsWith('updates/')).length }, null, 2));
