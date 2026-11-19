import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from './server.mjs';

async function fixture(t, { production = false } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yangyizhi-server-'));
  const dataDir = path.join(directory, 'data'), distDir = path.join(directory, 'dist');
  await mkdir(distDir); await writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>养一只</title>');
  let server;
  const start = async () => {
    server = createServer({ dataDir, distDir, production, origin: production ? 'https://yangyizhi.test' : undefined, cookiePath: '/yangyizhi/' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  let base = await start();
  const close = async () => { if (server?.listening) await new Promise(resolve => server.close(resolve)); };
  t.after(async () => { await close(); await rm(directory, { recursive: true, force: true }); });
  async function request(route, { method = 'GET', body, cookie, token, origin, headers = {} } = {}) {
    const response = await fetch(base + route, { method, headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(origin ? { Origin: origin } : {}), ...headers,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
    return { status: response.status, data, cookie: response.headers.get('set-cookie') };
  }
  return { request, get base() { return base; }, restart: async () => { await close(); base = await start(); }, dataDir };
}

const account = (username = 'yang_user') => ({ username, password: 'a-long-demo-password-123' });
const state = text => ({ v: 2, rev: 1, savedAt: 10, lang: 'zh', offset: 0, bond: 0, goal: null,
  logs: text ? [{ id: 'log-1', text }] : [], habitat: [], tips: {}, agent: { minor: false, usage: {} } });

test('Web accounts isolate versioned saves and keep only salted password hashes', async t => {
  const f = await fixture(t, { production: true });
  const created = await f.request('/api/auth/register', { method: 'POST', body: account(), origin: 'https://yangyizhi.test' });
  assert.equal(created.status, 201); assert.match(created.cookie, /HttpOnly/); assert.match(created.cookie, /Secure/); assert.match(created.cookie, /Path=\/yangyizhi\//);
  const cookie = created.cookie.split(';')[0];
  const saved = await f.request('/api/workspace', { method: 'PUT', cookie, origin: 'https://yangyizhi.test', body: { userId: created.data.user.id, state: state('first save'), revision: 0 } });
  assert.equal(saved.status, 200); assert.equal(saved.data.revision, 1);
  const read = await f.request('/api/workspace', { cookie }); assert.equal(read.data.state.logs[0].text, 'first save');
  const raw = JSON.parse(await readFile(path.join(f.dataDir, 'workspace.json'), 'utf8'));
  assert.equal(raw.users[0].password, undefined); assert.match(raw.users[0].salt, /^[a-f0-9]{32}$/); assert.match(raw.users[0].passwordHash, /^[a-f0-9]{128}$/);
  await f.restart();
  assert.equal((await f.request('/api/account', { cookie })).status, 401, 'web session expires after service restart');
  const login = await f.request('/api/auth/login', { method: 'POST', body: account(), origin: 'https://yangyizhi.test' });
  const restored = await f.request('/api/workspace', { cookie: login.cookie.split(';')[0] });
  assert.equal(restored.data.state.logs[0].text, 'first save');
});

test('stale workspace revision cannot overwrite a newer device save', async t => {
  const f = await fixture(t);
  const created = await f.request('/api/auth/register', { method: 'POST', body: account(), origin: 'http://127.0.0.1' });
  const cookie = created.cookie.split(';')[0];
  const save = rev => f.request('/api/workspace', { method: 'PUT', cookie, origin: 'http://127.0.0.1', body: { userId: created.data.user.id, state: state(`rev ${rev}`), revision: rev } });
  assert.equal((await save(0)).status, 200);
  const [first, stale] = await Promise.all([save(1), save(1)]);
  assert.deepEqual([first.status, stale.status].sort(), [200, 409]);
  const latest = await f.request('/api/workspace', { cookie }); assert.equal(latest.data.revision, 2);
});

test('native sessions share the same workspace and persist only token digests', async t => {
  const f = await fixture(t);
  const registered = await f.request('/api/native/auth/register', { method: 'POST', body: account('mobile_user') });
  assert.equal(registered.status, 201); assert.match(registered.data.token, /^[A-Za-z0-9_-]{32,}$/);
  const token = registered.data.token;
  const saved = await f.request('/api/native/workspace', { method: 'PUT', token, body: { userId: registered.data.user.id, state: state('mobile save'), revision: 0 } });
  assert.equal(saved.status, 200);
  const webAuth = await f.request('/api/auth/login', { method: 'POST', body: account('mobile_user'), origin: 'http://127.0.0.1' });
  const webRead = await f.request('/api/workspace', { cookie: webAuth.cookie.split(';')[0] }); assert.equal(webRead.data.state.logs[0].text, 'mobile save');
  const raw = JSON.parse(await readFile(path.join(f.dataDir, 'workspace.json'), 'utf8'));
  assert.equal(raw.nativeSessions[0].key, (await import('node:crypto')).createHash('sha256').update(token).digest('hex'));
  assert.equal(JSON.stringify(raw).includes(token), false);
  await f.restart(); assert.equal((await f.request('/api/native/account', { token })).status, 200);
});

test('native and browser auth boundaries reject the other client credentials', async t => {
  const f = await fixture(t);
  const web = await f.request('/api/auth/register', { method: 'POST', body: account('hybrid_user'), origin: 'http://127.0.0.1' });
  const webCookie = web.cookie.split(';')[0];
  assert.equal((await f.request('/api/native/workspace', { cookie: webCookie })).status, 400);
  const native = await f.request('/api/native/auth/login', { method: 'POST', body: account('hybrid_user') });
  assert.equal((await f.request('/api/workspace', { token: native.data.token })).status, 401);
  assert.equal((await f.request('/api/native/account', { token: native.data.token, origin: 'https://evil.test' })).status, 400);
});

test('account deletion requires the password and removes cloud state plus all native sessions', async t => {
  const f = await fixture(t);
  const created = await f.request('/api/native/auth/register', { method: 'POST', body: account('delete_user') });
  const token = created.data.token;
  await f.request('/api/native/workspace', { method: 'PUT', token, body: { userId: created.data.user.id, state: state('private data'), revision: 0 } });
  assert.equal((await f.request('/api/native/account/delete', { method: 'POST', token, body: { password: 'wrong-password-value' } })).status, 401);
  assert.equal((await f.request('/api/native/workspace', { token })).data.state.logs[0].text, 'private data');
  assert.equal((await f.request('/api/native/account/delete', { method: 'POST', token, body: { password: account('delete_user').password } })).status, 200);
  assert.equal((await f.request('/api/native/account', { token })).status, 401);
  const raw = JSON.parse(await readFile(path.join(f.dataDir, 'workspace.json'), 'utf8'));
  assert.deepEqual(raw.users, []); assert.deepEqual(raw.nativeSessions, []);
});

test('invalid saves, foreign origins, and oversized bodies leave valid state intact', async t => {
  const f = await fixture(t, { production: true });
  const user = await f.request('/api/auth/register', { method: 'POST', body: account(), origin: 'https://yangyizhi.test' });
  const cookie = user.cookie.split(';')[0];
  const save = body => f.request('/api/workspace', { method: 'PUT', cookie, origin: 'https://yangyizhi.test', body });
  assert.equal((await save({ userId: user.data.user.id, state: state('valid'), revision: 0 })).status, 200);
  assert.equal((await f.request('/api/workspace', { method: 'PUT', cookie, origin: 'https://evil.test', body: { userId: user.data.user.id, state: state('bad'), revision: 1 } })).status, 403);
  assert.equal((await save({ userId: user.data.user.id, state: { ...state('bad'), v: 99 }, revision: 1 })).status, 400);
  const oversized = await f.request('/api/workspace', { method: 'PUT', cookie, origin: 'https://yangyizhi.test', body: { userId: user.data.user.id, state: { ...state('x'.repeat(16000)), logs: Array.from({ length: 400 }, (_, i) => ({ text: `${i}-` + 'x'.repeat(16000) })) }, revision: 1 } });
  assert.equal(oversized.status, 413);
  assert.equal((await f.request('/api/workspace', { cookie })).data.state.logs[0].text, 'valid');
});

test('static health and app routes serve without exposing dotfiles or path traversal', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/healthz')).data.ok, true);
  assert.equal((await f.request('/')).status, 200);
  assert.equal((await f.request('/.env')).status, 404);
  assert.equal((await f.request('/../server.mjs')).status, 404);
});
