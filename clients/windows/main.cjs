'use strict';

const { app, BrowserWindow, dialog, ipcMain, net, protocol, safeStorage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { checkForUpdate, downloadVerified } = require('./update-core.cjs');

const currentVersion = require('./package.json').version;
let mainWindow;
let availableUpdate;
let verifiedInstaller;
let cloudSession = null;
let cloudBaseUrl = '';
let cloudGeneration = 0;
let cloudSessionReady = Promise.resolve();

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }]);

function contentType(file) {
  return ({ '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' })[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function registerAppProtocol() {
  const root = path.resolve(process.resourcesPath, 'web');
  protocol.handle('app', async request => {
    const url = new URL(request.url);
    if (url.host !== 'yangyizhi' || url.search || url.hash) return new Response('Not found', { status: 404 });
    let relative;
    try { relative = decodeURIComponent(url.pathname); } catch { return new Response('Not found', { status: 404 }); }
    const target = path.resolve(root, `.${relative === '/' ? '/index.html' : relative}`);
    if (target !== root && !target.startsWith(root + path.sep)) return new Response('Not found', { status: 404 });
    try { return new Response(await fs.readFile(target), { headers: { 'Content-Type': contentType(target), 'Cache-Control': 'no-store' } }); }
    catch { return new Response('Not found', { status: 404 }); }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 820,
    minWidth: 360,
    minHeight: 600,
    title: '养一只',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadURL('app://yangyizhi/index.html');
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'app:' || parsed.host !== 'yangyizhi') event.preventDefault();
    } catch { event.preventDefault(); }
  });
}

function cloudSessionFile() { return path.join(app.getPath('userData'), 'cloud-session.enc'); }
function validCloudSession(value) {
  if (!value || typeof value.token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(value.token) || !value.user ||
      typeof value.user.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.user.id) || typeof value.user.username !== 'string' || value.user.username.length > 32) throw new Error('云端登录信息无效。');
  return { token: value.token, user: { id: value.user.id, username: value.user.username } };
}
async function readCloudSession() {
  try {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用，请升级系统后登录。');
    const encrypted = await fs.readFile(cloudSessionFile());
    if (encrypted.length > 8192) throw new Error('本机登录信息无效，请重新登录。');
    return validCloudSession(JSON.parse(safeStorage.decryptString(encrypted)));
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function writeCloudSession(value) {
  if (!value) { await fs.rm(cloudSessionFile(), { force: true }); return; }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用，无法保存登录状态。');
  const encrypted = safeStorage.encryptString(JSON.stringify(validCloudSession(value)));
  const target = cloudSessionFile(), temporary = `${target}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  try { await fs.writeFile(temporary, encrypted, { mode: 0o600 }); await fs.rename(temporary, target); }
  finally { await fs.rm(temporary, { force: true }); }
}
async function cloudRequest(input) {
  await cloudSessionReady;
  const pathValue = input?.path, method = input?.method, body = input?.body;
  const allowedPath = /^(?:health|account|account\/delete|workspace(?:\?since=\d{1,15})?|auth\/(?:login|register|logout))$/;
  if (!allowedPath.test(pathValue || '') || !['GET', 'POST', 'PUT'].includes(method) || (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body)))) throw new Error('云端请求无效。');
  if (!cloudBaseUrl) throw new Error('云同步服务尚未配置。');
  const base = new URL(cloudBaseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/')) throw new Error('云同步服务尚未配置。');
  const url = new URL(pathValue, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw new Error('云端地址无效。');
  const authenticating = pathValue === 'auth/login' || pathValue === 'auth/register';
  const version = authenticating ? ++cloudGeneration : cloudGeneration;
  const bound = cloudSession;
  if (!authenticating && pathValue !== 'health' && !bound) return { status: 401, data: { message: '请先登录养一只账号。' } };
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (bound && !authenticating && pathValue !== 'health') headers.Authorization = `Bearer ${bound.token}`;
  const response = await net.fetch(url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(45000) });
  const text = await response.text();
  if (Buffer.byteLength(text) > 5 * 1024 * 1024 + 16384) throw new Error('云端响应超过大小限制。');
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { message: '云端响应格式无效。' }; }
  if (authenticating && response.ok) {
    if (version !== cloudGeneration) throw new Error('登录状态已变化，请重试。');
    const next = validCloudSession(data);
    await writeCloudSession(next); cloudSession = next; delete data.token;
  } else if (!authenticating && ['auth/logout', 'account/delete'].includes(pathValue) && (response.ok || response.status === 401)) {
    if (bound === cloudSession && version === cloudGeneration) { await writeCloudSession(null); cloudSession = null; cloudGeneration++; }
  } else if (!authenticating && response.status === 401 && pathValue !== 'health') {
    if (bound === cloudSession && version === cloudGeneration) { await writeCloudSession(null); cloudSession = null; cloudGeneration++; }
  }
  if (!authenticating && !['health', 'auth/logout', 'account/delete'].includes(pathValue) && bound !== cloudSession) throw new Error('登录账号已变化，请重试。');
  return { status: response.status, data };
}

app.whenReady().then(() => {
  registerAppProtocol();
  const cloudConfigPath = app.isPackaged ? path.join(process.resourcesPath, 'web', 'cloud-config.json') : path.resolve(__dirname, '../../dist/cloud-config.json');
  try { cloudBaseUrl = JSON.parse(require('node:fs').readFileSync(cloudConfigPath, 'utf8')).nativeApiBaseUrl || ''; }
  catch { cloudBaseUrl = ''; }
  cloudSessionReady = readCloudSession().then(value => { cloudSession = value; }).catch(() => { cloudSession = null; });
  ipcMain.handle('app:versions', () => ({ client: currentVersion, platform: process.platform, arch: process.arch }));
  ipcMain.handle('cloud:request', (event, input) => {
    if (!String(event.senderFrame?.url || '').startsWith('app://yangyizhi/')) throw new Error('云端请求来源无效。');
    return cloudRequest(input);
  });
  ipcMain.handle('updates:check', async () => {
    availableUpdate = await checkForUpdate({ platform: process.platform, arch: process.arch, currentVersion });
    return availableUpdate;
  });
  ipcMain.handle('updates:download', async () => {
    if (!availableUpdate?.available) throw new Error('请先检查更新');
    const choice = await dialog.showSaveDialog(mainWindow, { defaultPath: path.basename(new URL(availableUpdate.url).pathname) });
    if (choice.canceled || !choice.filePath) return { canceled: true };
    const result = await downloadVerified(availableUpdate, choice.filePath);
    verifiedInstaller = { ...result };
    return { path: result.path, bytes: result.bytes, sha256: result.sha256 };
  });
  ipcMain.handle('updates:open', async () => {
    if (!verifiedInstaller) throw new Error('没有已校验的更新文件');
    const bytes = await fs.readFile(verifiedInstaller.path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== verifiedInstaller.bytes || sha256 !== verifiedInstaller.sha256) throw new Error('更新文件已变化，拒绝打开');
    const error = await shell.openPath(verifiedInstaller.path);
    if (error) throw new Error(`无法打开更新文件：${error}`);
    return { ok: true };
  });
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
