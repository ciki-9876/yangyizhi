import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
const versions = JSON.parse(await readFile(path.join(root, 'clients/versions.json'), 'utf8'));
const version = target === 'windows' ? versions.windows : target === 'macos-arm64' ? versions.macos.arm64 : target === 'macos-x64' ? versions.macos.x64 : null;
if (!version) throw new Error('target must be windows, macos-arm64, or macos-x64');
const packageFile = path.join(root, 'clients/windows/package.json');
const lockFile = path.join(root, 'clients/windows/package-lock.json');
const packageJson = JSON.parse(await readFile(packageFile, 'utf8'));
packageJson.version = version;
await writeFile(packageFile, JSON.stringify(packageJson, null, 2) + '\n');
try {
  const lock = JSON.parse(await readFile(lockFile, 'utf8'));
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  await writeFile(lockFile, JSON.stringify(lock, null, 2) + '\n');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
console.log(`Desktop packaging version set to ${version} (${target}).`);
