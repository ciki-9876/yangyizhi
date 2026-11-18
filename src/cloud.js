/* Cloud account transport. Browser sessions use same-origin HttpOnly cookies;
 * native clients send bearer tokens through a host-owned secure bridge. */
(function () {
  'use strict';
  const native = window.Capacitor?.registerPlugin ? window.Capacitor.registerPlugin('YangyizhiCloud') : null;
  const desktop = window.YangyizhiDesktop;
  let settings = { webApiBasePath: 'api/', nativeApiBaseUrl: '' };
  let ready = Promise.resolve();
  if (location.protocol !== 'file:') ready = fetch('cloud-config.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(value => {
    if (value && typeof value === 'object') settings = { ...settings, ...value };
  }).catch(() => {});

  function isNative() { return !!(native || desktop?.cloudRequest); }
  function isConfigured() {
    if (isNative()) return /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?\/[A-Za-z0-9._~/-]+\/$/.test(settings.nativeApiBaseUrl || '');
    return !!settings.webApiBasePath;
  }
  async function request(path, method = 'GET', body) {
    await ready;
    if (!/^(?:health|account|account\/delete|workspace(?:\?since=\d{1,15})?|auth\/(?:login|register|logout))$/.test(path) || !['GET', 'POST', 'PUT'].includes(method)) throw new Error('云端请求无效。');
    if (!isConfigured()) throw new Error('云同步服务尚未配置。');
    if (native) {
      const result = await native.request({ path, method, ...(body === undefined ? {} : { body }) });
      return { status: result.status, data: result.data };
    }
    if (desktop?.cloudRequest) return desktop.cloudRequest({ path, method, ...(body === undefined ? {} : { body }) });
    const base = new URL(settings.webApiBasePath, location.href);
    if (base.protocol !== 'https:' && location.protocol === 'https:') throw new Error('云端地址必须使用 HTTPS。');
    const response = await fetch(new URL(path, base), { method, credentials: 'include', cache: 'no-store', redirect: 'error',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    let data; try { data = await response.json(); } catch { data = { message: '云端响应格式无效。' }; }
    return { status: response.status, data };
  }
  async function unwrap(path, method, body) {
    const result = await request(path, method, body);
    if (result.status < 200 || result.status >= 300) {
      const error = new Error(result.data?.message || result.data?.error || '云端请求失败。');
      error.status = result.status; error.revision = result.data?.revision; throw error;
    }
    return result.data;
  }
  window.YangyizhiCloud = Object.freeze({
    ready, isConfigured, isNative,
    async account() { return unwrap('account', 'GET'); },
    async authenticate(mode, credentials) { return unwrap(`auth/${mode}`, 'POST', credentials); },
    async logout() { return unwrap('auth/logout', 'POST', {}); },
    async deleteAccount(password) { return unwrap('account/delete', 'POST', { password }); },
    async loadWorkspace(since) { return unwrap(Number.isSafeInteger(since) ? `workspace?since=${since}` : 'workspace', 'GET'); },
    async saveWorkspace(userId, state, revision) { return unwrap('workspace', 'PUT', { userId, state, revision }); },
  });
})();
