import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBackup, decryptWorkspace, encryptWorkspace, restoreBackup } from '../scripts/workspace-backup.mjs';

test('workspace backups are authenticated encryption and restore exact JSON bytes', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'yangyizhi-backup-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const keyFile = path.join(dir, 'backup.key'), source = path.join(dir, 'workspace.json'), backups = path.join(dir, 'backups'), restored = path.join(dir, 'restored', 'workspace.json');
  const key = Buffer.alloc(32, 0x5a), plain = Buffer.from(JSON.stringify({ version: 1, users: [], nativeSessions: [] }));
  await writeFile(keyFile, key.toString('hex'), { mode: 0o600 }); await writeFile(source, plain, { mode: 0o600 });
  const result = await createBackup({ source, out: backups, keyFile });
  const encrypted = await readFile(result.output);
  assert.equal(encrypted.includes(plain), false);
  assert.deepEqual(decryptWorkspace(encrypted, key), plain);
  await restoreBackup({ restore: result.output, to: restored, keyFile });
  assert.deepEqual(await readFile(restored), plain);
  const changed = Buffer.from(encrypted); changed[changed.length - 1] ^= 1;
  assert.throws(() => decryptWorkspace(changed, key));
});
