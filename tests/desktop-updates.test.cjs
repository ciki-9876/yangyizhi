'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const { compareVersion, verifyEnvelope, checkForUpdate } = require('../clients/windows/update-core.cjs');

test('desktop versions are compared as numeric components', () => {
  assert.equal(compareVersion('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersion('0.1.0', '0.1.0'), 0);
  assert.equal(compareVersion('2.0.0', '2.1.0'), -1);
  assert.throws(() => compareVersion('1.0', '1.0.0'), /版本号/);
});

test('desktop updater verifies signed envelopes before reading platform data', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const payload = Buffer.from(JSON.stringify({ protocol: 1, channel: 'stable', clients: { windows: { version: '1.2.0' } } }));
  const envelope = { payload: payload.toString('base64'), signature: require('node:crypto').sign('RSA-SHA256', payload, privateKey).toString('base64') };
  assert.equal(verifyEnvelope(envelope, publicKey).clients.windows.version, '1.2.0');
  envelope.payload = Buffer.from('tampered').toString('base64');
  assert.throws(() => verifyEnvelope(envelope, publicKey), /签名/);
});

test('desktop updater explains that the first feed has not been published', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('', { status: 404 });
  try {
    await assert.rejects(
      checkForUpdate({ platform: 'win32', arch: 'x64', currentVersion: '0.1.0' }),
      /尚未发布首个更新清单/,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
