/* 养一只 · 声音
 * 全部用 WebAudio 现场合成，没有任何音频文件。第一次点屏幕时才启动，随时可以在设置里关掉。
 * 它说话的「嘟嘟声」音高由这只伙伴的体型和颜色决定，所以每只听起来都不一样。
 */
(function (root) {
  'use strict';
  let ctx = null, master = null, on = true;
  function unlock() {
    if (!on) return;
    try {
      if (!ctx) { const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return; ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination); }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) { ctx = null; }
  }
  const ready = () => on && ctx && ctx.state === 'running';
  /* 一个音：频率、时长、波形、音量、延迟、滑到的频率 */
  function tone(f, dur, type, vol, delay, slide) {
    if (!ready()) return;
    try {
      const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
    } catch (e) { /* 没声音不影响任何功能 */ }
  }
  function noise(dur, vol, delay, hp) {
    if (!ready()) return;
    try {
      const t = ctx.currentTime + (delay || 0), n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 1200;
      s.buffer = buf; g.gain.value = vol || 0.15; s.connect(f); f.connect(g); g.connect(master); s.start(t);
    } catch (e) { /* 同上 */ }
  }
  const N = { C5: 523, D5: 587, E5: 659, G5: 784, A5: 880, C6: 1047, E6: 1319, G6: 1568 };
  const Sfx = {
    unlock, get on() { return on; }, set on(v) { on = !!v; if (on) unlock(); },
    tap() { tone(520, 0.05, 'sine', 0.08, 0, 760); },
    send() { tone(420, 0.12, 'sine', 0.14, 0, 980); },
    gulp() { tone(340, 0.1, 'sine', 0.22, 0, 150); tone(180, 0.12, 'sine', 0.2, 0.09, 420); },
    grow() { tone(N.E5, 0.09, 'triangle', 0.14); tone(N.A5, 0.14, 'triangle', 0.14, 0.07); },
    levelUp() { [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => tone(f, 0.16, 'triangle', 0.16, i * 0.08)); tone(N.E6, 0.4, 'sine', 0.1, 0.34); },
    sparkle() { tone(N.C6, 0.08, 'sine', 0.08); tone(N.G6, 0.14, 'sine', 0.07, 0.06); },
    found() { tone(N.G5, 0.08, 'triangle', 0.12); tone(N.C6, 0.08, 'triangle', 0.12, 0.08); tone(N.E6, 0.18, 'triangle', 0.1, 0.16); },
    crack(i) { noise(0.07, 0.22, 0, 1800); tone(220 + i * 70, 0.07, 'square', 0.07, 0, 110); },
    hatch() { noise(0.16, 0.26, 0, 900); [N.C5, N.G5, N.C6, N.E6, N.G6].forEach((f, i) => tone(f, 0.2, 'triangle', 0.15, 0.08 + i * 0.07)); },
    rumble() { for (let i = 0; i < 6; i++) { tone(90 + i * 14, 0.11, 'sawtooth', 0.07, i * 0.13); noise(0.05, 0.08, i * 0.13 + 0.03, 2400); } },
    molt() { noise(0.22, 0.28, 0, 700); [N.G5, N.C6, N.E6, N.G6].forEach((f, i) => tone(f, 0.24, 'triangle', 0.15, 0.1 + i * 0.09)); tone(N.C6 * 2, 0.5, 'sine', 0.08, 0.5); },
    grown() { [N.C5, N.E5, N.G5, N.C6, N.G5, N.C6, N.E6].forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, i * 0.11)); tone(N.G6, 0.7, 'sine', 0.1, 0.8); },
    wake() { tone(300, 0.14, 'sine', 0.14, 0, 620); tone(660, 0.12, 'sine', 0.1, 0.13, 780); },
    sleep() { tone(520, 0.3, 'sine', 0.1, 0, 260); },
    poke(pitch) { tone((pitch || 600) * 1.25, 0.07, 'triangle', 0.13, 0, (pitch || 600) * 1.7); },
    /* 它说话：每两个字嘟一声 */
    blip(pitch, style) { const p = (pitch || 600) * (0.9 + Math.random() * 0.3); tone(p, style === 'quiet' ? 0.07 : 0.045, style === 'sharp' ? 'square' : 'triangle', style === 'sharp' ? 0.045 : 0.085); },
    buzz(ms) { try { if (on && navigator.vibrate) navigator.vibrate(ms || 10); } catch (e) { /* 不支持就算了 */ } },
  };
  root.Sfx = Sfx;
})(typeof window !== 'undefined' ? window : globalThis);
