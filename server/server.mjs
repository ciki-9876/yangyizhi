import { createServer as httpServer } from 'node:http';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { open, readFile, realpath, rename, stat, unlink } from 'node:fs/promises';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scrypt = promisify(scryptCallback);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_AUTH_BYTES = 16 * 1024;
const MAX_STATE_BYTES = 5 * 1024 * 1024;
const MAX_DATABASE_BYTES = 64 * 1024 * 1024;
const NATIVE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'yangyizhi_web_session';
const DUMMY_SALT = '4f6c70b86c8a6fe31d87ad16f6a4c9a1';

class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const idOk = value => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
const sameKeys = (value, keys) => isRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function validJson(value, depth = 0) {
  if (depth > 32) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 10000 && value.every(item => validJson(item, depth + 1));
  if (!isRecord(value)) return false;
  return Object.keys(value).length <= 10000 && Object.entries(value).every(([key, item]) =>
    !['__proto__', 'prototype', 'constructor'].includes(key) && validJson(item, depth + 1));
}

function validState(state) {
  if (!isRecord(state) || state.v !== 2 || !Array.isArray(state.logs) || !Array.isArray(state.habitat) ||
      !(state.goal === null || isRecord(state.goal)) || state.logs.length > 400 || state.habitat.length > 5000 ||
      !validJson(state)) return false;
  try { return Buffer.byteLength(JSON.stringify(state)) <= MAX_STATE_BYTES; } catch { return false; }
}

function parseAccount(body) {
  if (!sameKeys(body, ['username', 'password']) || typeof body.username !== 'string' || typeof body.password !== 'string')
    fail(400, '请填写用户名与密码。');
  const username = body.username.trim().normalize('NFKC');
  if (!/^[\p{L}\p{N}_-]{3,32}$/u.test(username)) fail(400, '用户名需为 3–32 位文字、数字、下划线或连字符。');
  if (body.password.length < 12 || body.password.length > 128 || Buffer.byteLength(body.password) > 512)
    fail(400, '密码需为 12–128 个字符。');
  return { username, canonical: username.toLocaleLowerCase('en-US'), password: body.password };
}

async function passwordHash(password, salt) {
  return Buffer.from(await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
}

function cookie(value, { secure, path: cookiePath }) {
  return `${COOKIE_NAME}=${value}; Path=${cookiePath}; HttpOnly; SameSite=Lax; Max-Age=${value ? 2592000 : 0}${secure ? '; Secure' : ''}`;
}

function sendJson(response, status, data, headers = {}) {
  const body = Buffer.from(JSON.stringify(data));
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Content-Length': body.length, ...headers });
  response.end(body);
}

async function readJson(request, limit) {
  if (!(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) fail(415, '请求格式必须是 JSON。');
  const length = Number(request.headers['content-length']);
  if (Number.isFinite(length) && length > limit) fail(413, '请求内容超过大小限制。');
  const chunks = []; let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > limit) fail(413, '请求内容超过大小限制。');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail(400, '请求 JSON 无效。'); }
}

function clientIp(request, trustProxy) {
  const peer = request.socket.remoteAddress || 'unknown';
  if (trustProxy && (peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1')) {
    const forwarded = request.headers['x-yangyizhi-client-ip'];
    if (typeof forwarded === 'string' && forwarded.length <= 64 && /^[0-9a-f:.]+$/i.test(forwarded)) return forwarded;
  }
  return peer;
}

function contentType(file) {
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json' })[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/** Single-process account/workspace service. Workspace file is atomically replaced after each serialized write. */
export function createServer(options = {}) {
  const dataDir = path.resolve(options.dataDir || process.env.YANGYIZHI_DATA_DIR || path.join(root, '.data'));
  const distDir = path.resolve(options.distDir || path.join(root, 'dist'));
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const trustedProxy = options.trustedProxy ?? process.env.YANGYIZHI_TRUST_LOCAL_PROXY === '1';
  const cookiePath = options.cookiePath || process.env.YANGYIZHI_COOKIE_PATH || '/';
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(cookiePath)) throw new Error('YANGYIZHI_COOKIE_PATH must end in /');
  const originString = options.origin || process.env.YANGYIZHI_ORIGIN || '';
  let publicOrigin = null;
  if (originString) {
    const origin = new URL(originString);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
      throw new Error('YANGYIZHI_ORIGIN must be an origin URL without a path');
    if (production && origin.protocol !== 'https:') throw new Error('Production requires HTTPS');
    publicOrigin = origin.origin;
  }
  if (production && !publicOrigin) throw new Error('Production requires YANGYIZHI_ORIGIN');
  const secureCookie = production;
  const databasePath = path.join(dataDir, 'workspace.json');
  const sessions = new Map();
  const rateLimits = new Map();
  let database = { version: 1, users: [], nativeSessions: [] };
  let queue = Promise.resolve();

  const serialized = operation => {
    const next = queue.then(operation);
    queue = next.catch(() => {});
    return next;
  };
  const commit = async next => {
    next.nativeSessions = next.nativeSessions.filter(session => session.expiresAt > Date.now());
    if (next.users.length > 10000) fail(507, '账号存储已满，请联系管理员。');
    const serializedDatabase = JSON.stringify(next);
    if (Buffer.byteLength(serializedDatabase) > MAX_DATABASE_BYTES) fail(507, '云端存储已满，已有数据没有修改。');
    const temporary = path.join(dataDir, `.workspace-${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(serializedDatabase); await handle.sync(); await handle.close(); handle = null;
      await rename(temporary, databasePath); database = next;
      if (process.platform === 'linux') { const directory = await open(dataDir, 'r'); try { await directory.sync(); } finally { await directory.close(); } }
    } finally { if (handle) await handle.close().catch(() => {}); await unlink(temporary).catch(() => {}); }
  };
  const rateLimit = (key, maximum, windowMs) => {
    const now = Date.now(); let entry = rateLimits.get(key);
    if (!entry || entry.resetAt <= now) { entry = { count: 0, resetAt: now + windowMs }; rateLimits.set(key, entry); }
    entry.count++;
    if (entry.count > maximum) fail(429, '操作太频繁，请稍后再试。', { retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) });
  };
  const userView = user => ({ id: user.id, username: user.username });
  const webCookieValue = request => {
    const raw = request.headers.cookie || '';
    for (const item of raw.split(';')) { const [name, ...parts] = item.trim().split('='); if (name === COOKIE_NAME) return parts.join('='); }
    return '';
  };
  const createNativeSession = async user => {
    const token = randomBytes(32).toString('base64url');
    const entry = { key: sha256(token), userId: user.id, expiresAt: Date.now() + NATIVE_SESSION_MS };
    await serialized(() => commit({ ...database, nativeSessions: [...database.nativeSessions, entry] }));
    return token;
  };
  const requestUser = (request, native) => {
    if (native) {
      if (request.headers.origin || request.headers.cookie || request.headers.cookie2) fail(400, '原生请求格式无效。');
      const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(request.headers.authorization || '');
      if (!match) fail(401, '请先登录。');
      const session = database.nativeSessions.find(item => item.key === sha256(match[1]) && item.expiresAt > Date.now());
      const user = session && database.users.find(item => item.id === session.userId);
      if (!user) fail(401, '登录已过期，请重新登录。');
      return { user, session };
    }
    const token = webCookieValue(request), userId = sessions.get(token);
    const user = userId && database.users.find(item => item.id === userId);
    if (!user) fail(401, '请先登录。');
    return { user, session: { key: token } };
  };

  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  chmodSync(dataDir, 0o700);
  // Load synchronously before accepting requests; corruption fails closed and preserves the file for recovery.
  if (existsSync(databasePath)) {
    if (statSync(databasePath).size > MAX_DATABASE_BYTES) throw new Error('Yangyizhi workspace file exceeds the configured size limit.');
    const raw = JSON.parse(readFileSync(databasePath, 'utf8'));
    if (!sameKeys(raw, ['version', 'users', 'nativeSessions']) || raw.version !== 1 || !Array.isArray(raw.users) || !Array.isArray(raw.nativeSessions) ||
        !raw.users.every(user => isRecord(user) && idOk(user.id) && typeof user.username === 'string' && typeof user.canonical === 'string' &&
          /^[a-f0-9]{32}$/.test(user.salt) && /^[a-f0-9]{128}$/.test(user.passwordHash) && Number.isSafeInteger(user.revision) && user.revision >= 0 &&
          (user.state === null || validState(user.state))) ||
        !raw.nativeSessions.every(session => sameKeys(session, ['key', 'userId', 'expiresAt']) && /^[a-f0-9]{64}$/.test(session.key) && idOk(session.userId) && Number.isSafeInteger(session.expiresAt)))
      throw new Error('Invalid Yangyizhi workspace file. Preserve it and restore a known-good backup.');
    database = raw;
  }

  const server = httpServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || '/', 'http://localhost').pathname;
      if (pathname === '/healthz' || pathname === '/api/health' || pathname === '/api/native/health') {
        sendJson(response, 200, { ok: true, version: 1 }); return;
      }
      const native = pathname.startsWith('/api/native/');
      const apiPath = native ? pathname.slice('/api/native'.length) : pathname.startsWith('/api/') ? pathname.slice(4) : null;
      if (apiPath) {
        const origin = request.headers.origin;
        if (origin && publicOrigin && origin !== publicOrigin) fail(403, '请求来源不受信任。');
        if (production && !native && request.method !== 'GET' && (!origin || !publicOrigin || origin !== publicOrigin)) fail(403, '请求来源不受信任。');
        const ip = clientIp(request, trustedProxy);
        const authRoute = apiPath === '/auth/register' || apiPath === '/auth/login';
        if (authRoute && request.method === 'POST') {
          rateLimit(`auth:${ip}`, 30, 15 * 60_000);
          const input = parseAccount(await readJson(request, MAX_AUTH_BYTES));
          rateLimit(`login:${ip}:${input.canonical}`, 12, 15 * 60_000);
          let user;
          if (apiPath === '/auth/register') {
            rateLimit(`register:${ip}`, 6, 60 * 60_000);
            const salt = randomBytes(16).toString('hex');
            const hash = (await passwordHash(input.password, salt)).toString('hex');
            user = await serialized(async () => {
              if (database.users.some(item => item.canonical === input.canonical)) fail(409, '这个用户名已经注册。');
              const created = { id: randomUUID(), username: input.username, canonical: input.canonical, salt, passwordHash: hash, state: null, revision: 0 };
              await commit({ ...database, users: [...database.users, created] }); return created;
            });
          } else {
            user = database.users.find(item => item.canonical === input.canonical);
            const actual = await passwordHash(input.password, user?.salt || DUMMY_SALT);
            const expected = user ? Buffer.from(user.passwordHash, 'hex') : Buffer.alloc(64);
            if (!timingSafeEqual(actual, expected) || !user) fail(401, '用户名或密码不正确。');
          }
          if (native) {
            const token = await createNativeSession(user);
            sendJson(response, apiPath.endsWith('register') ? 201 : 200, { user: userView(user), token, revision: user.revision });
          } else {
            const token = randomBytes(32).toString('base64url'); sessions.set(token, user.id);
            sendJson(response, apiPath.endsWith('register') ? 201 : 200, { user: userView(user), revision: user.revision }, { 'Set-Cookie': cookie(token, { secure: secureCookie, path: cookiePath }) });
          }
          return;
        }
        if (apiPath === '/auth/logout' && request.method === 'POST') {
          const { session } = requestUser(request, native);
          if (native) await serialized(() => commit({ ...database, nativeSessions: database.nativeSessions.filter(item => item.key !== session.key) }));
          else { sessions.delete(session.key); response.setHeader('Set-Cookie', cookie('', { secure: secureCookie, path: cookiePath })); }
          sendJson(response, 200, { ok: true }); return;
        }
        if (apiPath === '/account' && request.method === 'GET') {
          const { user } = requestUser(request, native); sendJson(response, 200, { user: userView(user) }); return;
        }
        if (apiPath === '/account/delete' && request.method === 'POST') {
          const { user } = requestUser(request, native);
          const body = await readJson(request, MAX_AUTH_BYTES);
          if (!sameKeys(body, ['password']) || typeof body.password !== 'string' || body.password.length > 128) fail(400, '请重新输入账号密码。');
          const supplied = await passwordHash(body.password, user.salt), expected = Buffer.from(user.passwordHash, 'hex');
          if (!timingSafeEqual(supplied, expected)) fail(401, '密码不正确，云端账号没有删除。');
          await serialized(() => commit({ ...database,
            users: database.users.filter(item => item.id !== user.id),
            nativeSessions: database.nativeSessions.filter(item => item.userId !== user.id),
          }));
          for (const [token, userId] of sessions) if (userId === user.id) sessions.delete(token);
          if (!native) response.setHeader('Set-Cookie', cookie('', { secure: secureCookie, path: cookiePath }));
          sendJson(response, 200, { ok: true }); return;
        }
        if (apiPath === '/workspace' && ['GET', 'PUT'].includes(request.method)) {
          const { user } = requestUser(request, native);
          if (request.method === 'GET') {
            const since = new URL(request.url || '/', 'http://localhost').searchParams.get('since');
            if (since && /^\d{1,15}$/.test(since) && Number(since) === user.revision) {
              sendJson(response, 200, { user: userView(user), revision: user.revision, unchanged: true }); return;
            }
            sendJson(response, 200, { user: userView(user), state: user.state, revision: user.revision }); return;
          }
          const body = await readJson(request, MAX_STATE_BYTES + 4096);
          if (!sameKeys(body, ['userId', 'state', 'revision']) || !idOk(body.userId)) fail(400, '云存档请求无效，已有数据没有修改。');
          if (body.userId !== user.id) fail(401, '登录账号已变化，请重新登录。');
          if (!validState(body.state) || !Number.isSafeInteger(body.revision) || body.revision < 0) fail(400, '存档格式无效，已有数据没有修改。');
          const revision = await serialized(async () => {
            const current = database.users.find(item => item.id === user.id);
            if (!current || current.id !== body.userId) fail(401, '登录账号已变化，请重新登录。');
            if (current.revision !== body.revision) fail(409, '云端存档已变化，本次没有覆盖。请先读取云端并处理冲突。', { revision: current.revision });
            if (current.revision >= Number.MAX_SAFE_INTEGER) fail(409, '存档版本已达到上限。');
            const next = { ...current, state: body.state, revision: current.revision + 1 };
            await commit({ ...database, users: database.users.map(item => item.id === user.id ? next : item) }); return next.revision;
          });
          sendJson(response, 200, { user: userView(user), revision }); return;
        }
        fail(404, '接口不存在。');
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') fail(405, '不支持的请求方法。');
      let relative = decodeURIComponent(pathname).replace(/^\/+/, '');
      if (!relative || relative.endsWith('/')) relative += 'index.html';
      if (relative.split('/').some(segment => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) fail(404, '页面不存在。');
      const distRoot = await realpath(distDir);
      let target = path.resolve(distRoot, relative);
      if (!target.startsWith(distRoot + path.sep)) fail(404, '页面不存在。');
      try { await stat(target); }
      catch {
        if (!path.extname(relative)) target = path.join(distRoot, 'index.html');
        else fail(404, '文件不存在。');
      }
      const realTarget = await realpath(target);
      if (!realTarget.startsWith(distRoot + path.sep)) fail(404, '文件不存在。');
      const bytes = await readFile(realTarget);
      response.writeHead(200, { 'Content-Type': contentType(realTarget), 'Content-Length': bytes.length,
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Cache-Control': path.basename(realTarget) === 'index.html' ? 'no-cache' : 'public, max-age=300' });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      const status = error instanceof HttpError ? error.status : 500;
      const message = status === 500 ? '服务暂时不可用，请稍后重试。' : error.message;
      sendJson(response, status, { error: message, message, ...(error instanceof HttpError ? error.extra : {}) });
    }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000; server.keepAliveTimeout = 5_000;
  return server;
}

const invokedPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => '') : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 52171); const host = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const server = createServer(); server.listen(port, host, () => console.log(`养一只服务已启动：http://${host}:${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => process.exit(0)));
}
