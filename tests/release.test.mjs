import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { makeEnvelope, readEnvelope, sha256, validatePayload } from '../scripts/release-manifest.mjs';

const keys = generateKeyPairSync('rsa', { modulusLength: 3072 });
const asset = {
  version: '1.2.3',
  minimumCompatible: '1.0.0',
  url: 'https://updates.example.test/yangyizhi/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/file.zip',
  bytes: 123,
  sha256: 'a'.repeat(64),
  releaseNotes: '修复问题，优化加载速度。',
};
const payload = {
  protocol: 1,
  channel: 'stable',
  publishedAt: '2026-11-16T00:00:00.000Z',
  web: asset,
  clients: {
    windows: asset,
    android: { ...asset, versionCode: 9, certificate: 'b'.repeat(64) },
    macos: {
      arm64: {
        ...asset,
        installer: {
          url: `https://updates.example.test/yangyizhi/${'c'.repeat(64)}/Yangyizhi-1.2.3-mac-arm64.dmg`,
          bytes: 456,
          sha256: 'c'.repeat(64),
        },
      },
      x64: asset,
    },
  },
};

test('signed update manifest verifies and preserves platform metadata', () => {
  const envelope = makeEnvelope(payload, keys.privateKey);
  const read = readEnvelope(envelope, keys.publicKey);
  assert.equal(read.clients.windows.sha256, 'a'.repeat(64));
  assert.equal(read.clients.android.versionCode, 9);
  assert.equal(read.clients.macos.arm64.installer.sha256, 'c'.repeat(64));
});

test('rejects altered signature, missing hash, incompatible protocol and unsafe URL', () => {
  const envelope = makeEnvelope(payload, keys.privateKey);
  envelope.signature = Buffer.from('tampered').toString('base64');
  assert.throws(() => readEnvelope(envelope, keys.publicKey), /签名/);
  assert.throws(() => validatePayload({ ...payload, web: { ...asset, sha256: 'nope' } }), /发布项/);
  assert.throws(() => validatePayload({ ...payload, protocol: 99 }), /头部/);
  assert.throws(() => validatePayload({ ...payload, clients: { windows: { ...asset, url: 'http://evil.test/file' } } }), /发布项/);
});

test('SHA-256 helper returns a stable lowercase digest', () => {
  assert.equal(sha256(Buffer.from('hello')), '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});
