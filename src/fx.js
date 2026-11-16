/* 养一只 · 粒子
 * 一层盖住全屏、不挡点击的画布。只在有东西要画的时候才跑动画帧。
 * 用到的地方：敲蛋的碎壳、讲的话飞进它嘴里的光点、长大时的星星、蜕壳的碎片、长成时的彩屑。
 */
(function (root) {
  'use strict';
  let cv = null, c = null, parts = [], raf = 0, last = 0, W = 0, H = 0;
  const reduce = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function setup() {
    if (cv) return true; cv = document.getElementById('fx'); if (!cv) return false; c = cv.getContext('2d'); resize(); root.addEventListener('resize', resize); return true;
  }
  function resize() { const d = Math.min(2, root.devicePixelRatio || 1); W = root.innerWidth; H = root.innerHeight; cv.width = W * d; cv.height = H * d; c.setTransform(d, 0, 0, d, 0, 0); }
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts; c.clearRect(0, 0, W, H);
    parts = parts.filter(p => (p.t += dt) < p.life);
    for (const p of parts) {
      const k = p.t / p.life;
      if (p.kind === 'orb') {
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, x = p.x0 + (p.x1 - p.x0) * e, y = p.y0 + (p.y1 - p.y0) * e - Math.sin(k * Math.PI) * p.arc;
        c.globalAlpha = 1; c.fillStyle = p.color; c.strokeStyle = '#1E1A3C'; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, 9 * (1 - k * 0.45), 0, 7); c.fill(); c.stroke();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(x - 3, y - 3, 2.6, 0, 7); c.fill();
        if (Math.random() < 0.6) parts.push({ kind: 'dot', x, y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, g: 0, t: 0, life: 0.35, size: 3, color: p.color, rot: 0, vr: 0 });
        if (k > 0.88 && p.cb) p.cb();
        continue;
      }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.vx *= 1 - 1.2 * dt;
      c.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1; c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.color;
      if (p.kind === 'star') { star(p.size * (1 - k * 0.3)); c.fill(); c.strokeStyle = '#1E1A3C'; c.lineWidth = 1.6; c.stroke(); }
      else if (p.kind === 'shard') { c.beginPath(); c.moveTo(-p.size, p.size * 0.6); c.lineTo(0, -p.size); c.lineTo(p.size, p.size * 0.5); c.closePath(); c.fill(); c.strokeStyle = '#1E1A3C'; c.lineWidth = 2; c.stroke(); }
      else if (p.kind === 'dot') { c.beginPath(); c.arc(0, 0, p.size * (1 - k), 0, 7); c.fill(); }
      else if (p.kind === 'ring') { c.globalAlpha = 1 - k; c.strokeStyle = p.color; c.lineWidth = 5 * (1 - k) + 1; c.beginPath(); c.arc(0, 0, p.size + k * p.grow, 0, 7); c.stroke(); }
      else if (p.kind === 'text') { c.font = '400 ' + p.size + 'px "ZCOOL KuaiLe", "PingFang SC", sans-serif'; c.textAlign = 'center'; c.lineJoin = 'round'; c.lineWidth = 6; c.strokeStyle = '#1E1A3C'; c.strokeText(p.text, 0, 0); c.fillText(p.text, 0, 0); }
      else { c.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66); }
      c.restore();
    }
    c.globalAlpha = 1;
    if (parts.length) raf = requestAnimationFrame(loop); else { raf = 0; c.clearRect(0, 0, W, H); }
  }
  function star(r) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, q = i % 2 ? r * 0.45 : r; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.closePath(); }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const POP = ['#FFD23F', '#FF85B8', '#5AB0FF', '#4FD1A1', '#A98BFF', '#FF7B5A'];
  const Fx = {
    center,
    burst(x, y, o) {
      if (reduce() || !setup()) return; o = o || {}; const n = o.count || 16, colors = o.colors || POP, sp = o.speed || 260;
      for (let i = 0; i < n; i++) { const a = (o.up ? -Math.PI / 2 + (Math.random() - 0.5) * (o.spread || 2.4) : Math.random() * Math.PI * 2), v = sp * (0.4 + Math.random() * 0.8);
        parts.push({ kind: o.kind || 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: o.gravity == null ? 520 : o.gravity, t: 0, life: (o.life || 0.9) * (0.7 + Math.random() * 0.6), size: (o.size || 8) * (0.7 + Math.random() * 0.6), color: colors[i % colors.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10 }); }
      kick();
    },
    ring(x, y, color) { if (reduce() || !setup()) return; parts.push({ kind: 'ring', x, y, vx: 0, vy: 0, g: 0, t: 0, life: 0.6, size: 20, grow: 90, color: color || '#FFD23F', rot: 0, vr: 0 }); kick(); },
    confetti() {
      if (reduce() || !setup()) return;
      for (let i = 0; i < 90; i++) parts.push({ kind: i % 4 ? 'rect' : 'star', x: Math.random() * W, y: -20 - Math.random() * 120, vx: (Math.random() - 0.5) * 120, vy: 120 + Math.random() * 220, g: 160, t: 0, life: 2.4 + Math.random() * 1.4, size: 7 + Math.random() * 7, color: POP[i % POP.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
      kick();
    },
    text(x, y, text, color) { if (reduce() || !setup()) return; parts.push({ kind: 'text', x, y, vx: 0, vy: -46, g: 0, t: 0, life: 1.1, size: 26, color: color || '#FFD23F', rot: 0, vr: 0, text }); kick(); },
    /* 一颗光点从 a 飞到 b，到了以后回调。不能动画时直接回调 */
    orb(a, b, color, cb) {
      let fired = false; const once = () => { if (!fired) { fired = true; if (cb) cb(); } };
      if (reduce() || !setup()) { once(); return; }
      parts.push({ kind: 'orb', x0: a[0], y0: a[1], x1: b[0], y1: b[1], arc: 60, t: 0, life: 0.55, color: color || '#FFD23F', cb: once }); kick();
      setTimeout(once, 800);   // 标签页在后台时动画帧不跑，回调不能丢
    },
  };
  root.Fx = Fx;
})(typeof window !== 'undefined' ? window : globalThis);
