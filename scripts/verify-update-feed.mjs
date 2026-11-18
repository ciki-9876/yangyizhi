import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEnvelope } from './release-manifest.mjs';

const directory = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Usage: node scripts/verify-update-feed.mjs SIGNED_UPDATE_DIRECTORY');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(path.join(root, 'clients/update-config.json'), 'utf8'));
const key = config.publicKey;
if (!key.includes('BEGIN PUBLIC KEY')) throw new Error('Update public key is not configured.');
const envelope = JSON.parse(await readFile(path.join(directory, 'stable.json'), 'utf8'));
const payload = readEnvelope(envelope, key);
const manifest = new URL(config.manifestUrl);
const expectedBase = manifest.href.slice(0, manifest.href.lastIndexOf('/') + 1);
const assets = [payload.web, ...Object.values(payload.clients).flatMap(value => value?.version ? [value] : Object.values(value || {}))]
  .flatMap(asset => asset.installer ? [asset, asset.installer] : [asset]);
for (const asset of assets) {
  const url = new URL(asset.url);
  if (url.origin !== manifest.origin || !url.href.startsWith(expectedBase)) throw new Error(`Asset URL is outside configured update source: ${url.href}`);
  const name = decodeURIComponent(url.pathname.split('/').pop());
  const bytes = await readFile(path.join(directory, asset.sha256, name));
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== asset.bytes || digest !== asset.sha256) throw new Error(`Update asset size or SHA-256 mismatch: ${name}`);
}
for (const entry of await readdir(directory, { withFileTypes: true })) if (entry.name !== 'stable.json' && (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name))) throw new Error(`Unexpected update directory entry: ${entry.name}`);
console.log(JSON.stringify({ channel: payload.channel, publishedAt: payload.publishedAt, files: assets.length }, null, 2));
