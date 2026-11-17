import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const versions = await readJSON('clients/versions.json');
const desktop = await readJSON('clients/windows/package.json');
const config = await readJSON('clients/update-config.json');
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const fail = message => { console.error(`版本检查失败：${message}`); process.exitCode = 1; };
const compare = (a, b) => {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
};

for (const [name, version] of Object.entries({ web: versions.web, windows: versions.windows, android: versions.android?.version, macosArm64: versions.macos?.arm64, macosX64: versions.macos?.x64 })) {
  if (!semver.test(version || '')) fail(`${name} 版本必须是 MAJOR.MINOR.PATCH`);
}
if (!Number.isSafeInteger(versions.android?.versionCode) || versions.android.versionCode < 1) fail('Android versionCode 必须是正整数');
if (desktop.version !== versions.windows) fail('Electron package version 与 versions.json 不一致');
if (config.protocol !== versions.updateProtocol) fail('更新协议版本不一致');
const compatibilityPairs = [
  ['windows', versions.windows, versions.minimumCompatible?.windows],
  ['android', versions.android.version, versions.minimumCompatible?.android],
  ['macos arm64', versions.macos.arm64, versions.minimumCompatible?.macos],
  ['macos x64', versions.macos.x64, versions.minimumCompatible?.macos],
];
for (const [platform, current, minimum] of compatibilityPairs) {
  if (!semver.test(minimum || '') || compare(minimum, current) > 0) fail(`${platform} 最低兼容版本无效或高于当前版本`);
}

try {
  const web = await readJSON('dist/version.json');
  if (web.version !== versions.web || web.protocol !== versions.updateProtocol) fail('dist/version.json 与客户端版本源不一致，请重新构建');
  const html = await readFile(path.join(root, 'dist/index.html'));
  if (!html.length) fail('dist/index.html 是空文件');
  console.log(JSON.stringify({ ok: !process.exitCode, versions, webBytes: html.length, webSha256: createHash('sha256').update(html).digest('hex') }, null, 2));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  fail('缺少构建后的 dist，请运行 npm run build:web');
}
