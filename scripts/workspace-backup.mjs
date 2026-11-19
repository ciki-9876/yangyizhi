import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmod, mkdir, open, readFile, readdir, realpath, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAGIC = Buffer.from('YZW1');
const MAX_FILE = 64 * 1024 * 1024;

function parseKey(text) {
  const value = text.trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('Backup key must contain exactly 64 hexadecimal characters.');
  return Buffer.from(value, 'hex');
}

export function encryptWorkspace(plain, key, iv = randomBytes(12)) {
  if (plain.length < 2 || plain.length > MAX_FILE || iv.length !== 12 || key.length !== 32) throw new Error('Workspace backup input is invalid or too large.');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);
}

export function decryptWorkspace(packed, key) {
  if (packed.length < 34 || packed.length > MAX_FILE + 32 || !packed.subarray(0, 4).equals(MAGIC) || key.length !== 32) throw new Error('Workspace backup envelope is invalid.');
  const iv = packed.subarray(4, 16), tag = packed.subarray(16, 32), encrypted = packed.subarray(32);
  const decipher = createDecipheriv('aes-256-gcm', key, iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function argsOf(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || !argv[index + 1]) throw new Error('Use --source FILE --out DIR --key-file FILE [--retention-days N] or --restore FILE --to FILE --key-file FILE.');
    out[argv[index].slice(2)] = argv[index + 1];
  }
  return out;
}

async function readKey(keyFile) {
  const info = await stat(keyFile);
  if (process.platform !== 'win32' && (info.mode & 0o077) !== 0) throw new Error('Backup key permissions must be 0600 or stricter.');
  return parseKey(await readFile(keyFile, 'utf8'));
}

async function atomicWrite(filename, bytes, mode = 0o600) {
  const folder = path.dirname(filename); await mkdir(folder, { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  let handle;
  try { handle = await open(temporary, 'wx', mode); await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null; await rename(temporary, filename); await chmod(filename, mode); }
  finally { if (handle) await handle.close().catch(() => {}); await unlink(temporary).catch(() => {}); }
}

export async function createBackup({ source, out, keyFile, retentionDays = 7 }) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) throw new Error('Retention days must be between 1 and 365.');
  if ((await stat(source)).size > MAX_FILE) throw new Error('Workspace database exceeds the backup size limit.');
  await mkdir(out, { recursive: true, mode: 0o700 }); await chmod(out, 0o700);
  const plain = await readFile(source); const database = JSON.parse(plain.toString('utf8'));
  if (database.version !== 1 || !Array.isArray(database.users) || !Array.isArray(database.nativeSessions)) throw new Error('Workspace database does not match the expected schema.');
  const encrypted = encryptWorkspace(plain, await readKey(keyFile));
  const name = `yangyizhi-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}.workspace.enc`;
  const output = path.join(out, name); await atomicWrite(output, encrypted);
  const cutoff = Date.now() - retentionDays * 86400_000;
  for (const entry of await readdir(out, { withFileTypes: true })) {
    if (!entry.isFile() || !/^yangyizhi-\d{8}T\d{6}Z\.workspace\.enc$/.test(entry.name)) continue;
    const filename = path.join(out, entry.name); if ((await stat(filename)).mtimeMs < cutoff) await unlink(filename);
  }
  return { output, bytes: encrypted.length };
}

export async function restoreBackup({ restore, to, keyFile }) {
  const packed = await readFile(restore); const plain = decryptWorkspace(packed, await readKey(keyFile));
  const database = JSON.parse(plain.toString('utf8'));
  if (database.version !== 1 || !Array.isArray(database.users) || !Array.isArray(database.nativeSessions)) throw new Error('Backup database schema is invalid.');
  await atomicWrite(to, plain);
  return { output: to, bytes: plain.length };
}

const invokedPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => '') : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  const args = argsOf(process.argv.slice(2)); const keyFile = args['key-file'];
  if (!keyFile) throw new Error('Missing --key-file.');
  if (args.restore && args.to) {
    const result = await restoreBackup({ restore: args.restore, to: args.to, keyFile });
    console.log(`Restored encrypted workspace to ${result.output} (${result.bytes} bytes). Stop the service before restoring.`);
  } else if (args.source && args.out) {
    const result = await createBackup({ source: args.source, out: args.out, keyFile, retentionDays: Number(args['retention-days'] || 7) });
    console.log(`Created encrypted workspace backup ${result.output} (${result.bytes} bytes).`);
  } else throw new Error('Use --source FILE --out DIR --key-file FILE [--retention-days N] or --restore FILE --to FILE --key-file FILE.');
}
