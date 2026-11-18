'use strict';

const { app, BrowserWindow, dialog, ipcMain, protocol, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { checkForUpdate, downloadVerified } = require('./update-core.cjs');

const currentVersion = require('./package.json').version;
let mainWindow;
let availableUpdate;
let verifiedInstaller;

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

app.whenReady().then(() => {
  registerAppProtocol();
  ipcMain.handle('app:versions', () => ({ client: currentVersion, platform: process.platform, arch: process.arch }));
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
