/* 养一只 · 形象、场景、宝贝
 * 全部是 SVG，不用任何图片。
 * 伙伴 = 体型 × 颜色 × 长出的部位 × 补丁 × 等级斑点。每种表情都画在同一张 SVG 里，
 * 换表情只改根节点的 data-mood，不重绘；眼珠的位置由两个 CSS 变量控制，所以它能看着你。
 * 所有会动的部位都用 transform-box: fill-box 定轴，不依赖画布坐标。
 */
(function (root) {
  'use strict';
  const INK = '#1E1A3C';
  // [身体, 肚皮/浅色, 深色, 白天的天色]
  const HUES = [
    ['#FF7B5A', '#FFD8CA', '#D9532F', '#FFE9B0'], ['#4FD1A1', '#D2F6E7', '#249C72', '#FFDDE9'], ['#5AB0FF', '#D6EBFF', '#2B7FD1', '#FFF0A8'],
    ['#FFCF3A', '#FFF2C2', '#D99E00', '#D5E6FF'], ['#A98BFF', '#E7DEFF', '#7654E0', '#D2F5E1'], ['#FF85B8', '#FFDBEA', '#E0508C', '#D5EEFF'],
  ];
  const SHAPES = [
    { d: 'M120,74 C164,74 192,104 192,142 C192,182 162,208 120,208 C78,208 48,182 48,142 C48,104 76,74 120,74Z', top: 74, eye: 132, xl: 48, xr: 192, sy: 146 },
    { d: 'M120,52 C156,52 176,82 176,120 L176,160 C176,192 152,210 120,210 C88,210 64,192 64,160 L64,120 C64,82 84,52 120,52Z', top: 52, eye: 112, xl: 64, xr: 176, sy: 142 },
    { d: 'M120,66 C150,66 166,96 176,134 C188,178 164,210 120,210 C76,210 52,178 64,134 C74,96 90,66 120,66Z', top: 66, eye: 124, xl: 60, xr: 180, sy: 158 },
    { d: 'M88,70 L152,70 C176,70 188,84 188,108 L188,172 C188,196 174,210 150,210 L90,210 C66,210 52,196 52,172 L52,108 C52,84 64,70 88,70Z', top: 70, eye: 124, xl: 52, xr: 188, sy: 146 },
  ];
  const S = 'stroke="' + INK + '" stroke-linejoin="round" stroke-linecap="round"';
  const flip = s => '<g transform="translate(240,0) scale(-1,1)">' + s + '</g>';
  let uid = 0;

  function critter(look, mood, opt) {
    opt = opt || {};
    const sh = SHAPES[look.shape % SHAPES.length], [body, light, dark] = HUES[look.hue % HUES.length], has = p => look.parts.indexOf(p) >= 0;
    const big = has('eyes'), ey = sh.eye, r = big ? 17 : 12, my = ey + (big ? 26 : 22), id = 'dc' + (++uid);
    const sc = Math.min(1, 0.72 + look.stage * 0.06 + look.level * 0.015), fresh = opt.fresh || '';
    const np = p => p === fresh ? ' newpart' : '';
    let o = '';
    if (has('tail')) o += `<g class="p-tail${np('tail')}"><path d="M${sh.xr - 14},192 C${sh.xr + 34},200 ${sh.xr + 42},162 ${sh.xr + 22},150" fill="none" ${S} stroke-width="17"/><path d="M${sh.xr - 14},192 C${sh.xr + 34},200 ${sh.xr + 42},162 ${sh.xr + 22},150" fill="none" stroke="${body}" stroke-width="8" stroke-linecap="round"/><circle cx="${sh.xr + 21}" cy="148" r="10" fill="${dark}" ${S} stroke-width="5"/></g>`;
    if (has('wings')) { const w = `<g class="p-wing${np('wings')}"><path d="M${sh.xl + 12},${sh.sy - 12} C${sh.xl - 40},${sh.sy - 54} ${sh.xl - 54},${sh.sy + 4} ${sh.xl - 24},${sh.sy + 16} C${sh.xl - 34},${sh.sy + 36} ${sh.xl - 4},${sh.sy + 36} ${sh.xl + 12},${sh.sy + 14}Z" fill="${light}" ${S} stroke-width="5"/></g>`; o += w + flip(w); }
    o += `<ellipse cx="98" cy="209" rx="15" ry="9" fill="${dark}" ${S} stroke-width="5"/><ellipse cx="142" cy="209" rx="15" ry="9" fill="${dark}" ${S} stroke-width="5"/>`;
    o += `<path d="${sh.d}" fill="${body}" ${S} stroke-width="6"/><ellipse cx="120" cy="174" rx="34" ry="27" fill="${light}"/>`;
    o += `<path d="M${sh.xl + 22},${sh.top + 30} Q${sh.xl + 26},${sh.top + 14} ${sh.xl + 44},${sh.top + 10}" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".45"/>`;
    if (has('plates')) { o += `<g class="${np('plates').trim()}">`; for (const y of [158, 172, 186]) o += `<path d="M${y === 172 ? 96 : 102},${y} Q120,${y + 10} ${y === 172 ? 144 : 138},${y}" fill="none" stroke="${dark}" stroke-width="4" stroke-linecap="round"/>`; o += '</g>'; }
    const spots = [[86, 30], [152, 26], [120, 14], [100, 22], [140, 38], [74, 52], [166, 50]];
    for (let i = 0; i < Math.min(look.level, spots.length); i++) o += `<circle cx="${spots[i][0]}" cy="${sh.top + spots[i][1]}" r="${4 + (i % 2)}" fill="${dark}" opacity=".75"/>`;
    if (look.patches > 0) o += `<g transform="rotate(-12 ${sh.xl + 30} ${sh.sy + 24})"><rect x="${sh.xl + 16}" y="${sh.sy + 12}" width="26" height="24" rx="5" fill="#FFF6DC" ${S} stroke-width="3" stroke-dasharray="5 4"/></g>`;
    if (look.patches > 1) o += `<g transform="rotate(14 ${sh.xr - 34} ${sh.sy + 34})"><rect x="${sh.xr - 46}" y="${sh.sy + 24}" width="22" height="20" rx="5" fill="#D9F2FF" ${S} stroke-width="3" stroke-dasharray="5 4"/></g>`;
    o += `<g class="cheeks"><ellipse cx="80" cy="${ey + 17}" rx="9" ry="6" fill="#FF8FA8" opacity=".75"/><ellipse cx="160" cy="${ey + 17}" rx="9" ry="6" fill="#FF8FA8" opacity=".75"/></g>`;
    // 眼睛：睁着（眼珠会动）、笑眯、闭着
    let open = '', happy = '', sleep = '';
    for (const x of [94, 146]) {
      open += `<circle cx="${x}" cy="${ey}" r="${r}" fill="#fff" ${S} stroke-width="4"/><g class="pupil"><circle cx="${x + 1}" cy="${ey}" r="${big ? 8 : 6}" fill="${INK}"/><circle cx="${x + 4}" cy="${ey - 3}" r="${big ? 3 : 2.2}" fill="#fff"/></g>`;
      happy += `<path d="M${x - 10},${ey + 3} Q${x},${ey - 12} ${x + 10},${ey + 3}" fill="none" ${S} stroke-width="5"/>`;
      sleep += `<path d="M${x - 10},${ey} Q${x},${ey + 9} ${x + 10},${ey}" fill="none" ${S} stroke-width="5"/>`;
    }
    o += `<g class="e-open${np('eyes')}"><g class="blink">${open}</g></g><g class="e-happy">${happy}</g><g class="e-sleep">${sleep}</g>`;
    // 嘴：微笑、圆嘴、大笑、抿着、说话
    o += `<path class="m-smile" d="M110,${my} Q120,${my + 9} 130,${my}" fill="none" ${S} stroke-width="4"/>`;
    o += `<ellipse class="m-o" cx="120" cy="${my + 2}" rx="5" ry="6" fill="${INK}"/>`;
    o += `<path class="m-happy" d="M107,${my - 2} Q120,${my + 16} 133,${my - 2}Z" fill="#FF5A7A" ${S} stroke-width="4"/>`;
    o += `<path class="m-flat" d="M114,${my + 2} L126,${my + 2}" ${S} stroke-width="4"/>`;
    o += `<ellipse class="m-talk" cx="120" cy="${my + 2}" rx="7" ry="6" fill="#FF5A7A" ${S} stroke-width="4"/>`;
    if (has('horns')) { const h = `<g class="${np('horns').trim()}"><path d="M90,${sh.top + 16} Q74,${sh.top - 16} 94,${sh.top - 26} Q98,${sh.top - 4} 108,${sh.top + 6}Z" fill="#FFF4D2" ${S} stroke-width="5"/></g>`; o += h + flip(h); }
    if (has('antenna')) { const ax = has('horns') ? 104 : 84, bx = has('horns') ? 112 : 106, cx = has('horns') ? 110 : 98; const a = `<g class="p-ant${np('antenna')}"><path d="M${bx},${sh.top + 4} Q${cx},${sh.top - 30} ${ax},${sh.top - 38}" fill="none" ${S} stroke-width="5"/><circle cx="${ax}" cy="${sh.top - 38}" r="7" fill="${light}" ${S} stroke-width="4"/></g>`; o += a + flip(a); }
    const z = `<g class="zzz" fill="#fff" stroke="${INK}" stroke-width="5" paint-order="stroke" stroke-linejoin="round" font-family="inherit" font-weight="700"><text x="176" y="${sh.top + 4}" font-size="22">z</text><text x="194" y="${sh.top - 16}" font-size="16">z</text></g>`;
    // 画布按它的个头裁：小的时候不留一大片空白
    const reach = sh.top - (has('antenna') ? 50 : has('horns') ? 30 : 8) - 26;
    const y0 = Math.max(0, Math.min(110, Math.floor(218 - (218 - reach) * sc - 14)));
    const filter = opt.plain ? '' : `<defs><filter id="${id}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius="4.5" result="d"/><feFlood flood-color="#fff"/><feComposite in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
    return `<svg class="critter" data-mood="${mood || 'awake'}" viewBox="0 ${y0} 240 ${236 - y0}" role="img" aria-label="${look.name || ''}">${filter}<ellipse class="shadow" cx="120" cy="220" rx="${60 * sc}" ry="7" fill="${INK}" opacity=".18"/><g transform="translate(120 218) scale(${sc}) translate(-120 -218)"><g class="act"><g class="idle"><g${opt.plain ? '' : ` filter="url(#${id})"`}>${o}</g></g>${z}</g></g></svg>`;
  }

  /* 蛋：花纹由目标的类别决定；cracks 是敲出来的裂缝数（0–3） */
  function egg(hue, kind, cracks) {
    const [body, light, dark] = HUES[hue % HUES.length], d = 'M120,40 C164,40 190,110 190,152 C190,194 160,216 120,216 C80,216 50,194 50,152 C50,110 76,40 120,40Z', id = 'eg' + (++uid);
    let pat = '';
    if (kind === 'read') pat = [92, 128, 164].map(y => `<rect x="40" y="${y}" width="160" height="16" fill="${body}"/>`).join('');
    else if (kind === 'learn') pat = [[90, 100], [150, 96], [120, 130], [78, 158], [162, 156], [108, 186], [142, 190], [120, 74]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="10" fill="${body}"/>`).join('');
    else if (kind === 'body') pat = [-40, 0, 40, 80, 120].map(x => `<path d="M${x},230 L${x + 110},30 L${x + 132},30 L${x + 22},230Z" fill="${body}"/>`).join('');
    else pat = `<path d="M40,120 L66,96 L93,120 L120,96 L147,120 L174,96 L200,120 L200,150 L174,126 L147,150 L120,126 L93,150 L66,126 L40,150Z" fill="${body}"/><path d="M40,176 L66,160 L93,176 L120,160 L147,176 L174,160 L200,176 L200,192 L174,176 L147,192 L120,176 L93,192 L66,176 L40,192Z" fill="${dark}"/>`;
    const cr = ['M120,44 L112,66 L126,80 L116,98', 'M168,100 L150,112 L158,130 L140,140 L146,158', 'M66,128 L84,138 L76,156 L96,164 L90,184 L108,190'];
    let ck = ''; for (let i = 0; i < Math.min(3, cracks | 0); i++) ck += `<path d="${cr[i]}" fill="none" ${S} stroke-width="4.5"/>`;
    return `<svg class="eggsvg" viewBox="0 20 240 216" role="img" aria-label="蛋"><defs><clipPath id="${id}"><path d="${d}"/></clipPath><filter id="${id}f" x="-20%" y="-20%" width="140%" height="140%"><feMorphology in="SourceAlpha" operator="dilate" radius="4.5" result="d"/><feFlood flood-color="#fff"/><feComposite in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><ellipse cx="120" cy="220" rx="56" ry="7" fill="${INK}" opacity=".18"/><g class="eggbody"><g filter="url(#${id}f)"><path d="${d}" fill="${light}"/><g clip-path="url(#${id})">${pat}</g><path d="${d}" fill="none" ${S} stroke-width="6"/><path d="M92,74 Q100,62 112,58" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".8"/>${ck}</g></g></svg>`;
  }

  /* 它捡的宝贝：24 种，每种一个小图标（24×24，圆心在原点） */
  const G = 'stroke="' + INK + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
  const GLYPH = {
    stone: `<ellipse rx="9" ry="6.5" fill="#C9CDD8" ${G}/><path d="M-5,-2 Q-2,-4 2,-3.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
    pencil: `<g transform="rotate(-35)"><rect x="-10" y="-3.2" width="15" height="6.4" fill="#FFCF3A" ${G}/><path d="M5,-3.2 L11,0 L5,3.2Z" fill="#FFE9C9" ${G}/><rect x="-10" y="-3.2" width="3.5" height="6.4" fill="#FF8FA8" ${G}/></g>`,
    ginkgo: `<path d="M0,10 L0,2 C-13,3 -12,-10 0,-9 C12,-10 13,3 0,2" fill="#FFD23F" ${G}/><path d="M0,2 L0,-5" fill="none" ${G}/>`,
    key: `<circle cx="-5" cy="0" r="5" fill="#E8B766" ${G}/><circle cx="-5" cy="0" r="1.6" fill="${INK}"/><path d="M0,0 H10 M6,0 V4 M9.5,0 V3" fill="none" ${G}/>`,
    marble: `<circle r="8.5" fill="#7FD3FF" ${G}/><path d="M-4,3 C-2,-5 4,-5 3,2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`,
    ticket: `<path d="M-10,-6 H10 V-2 a2,2 0 0 0 0,4 V6 H-10 V2 a2,2 0 0 0 0,-4Z" fill="#FF9CB8" ${G}/><path d="M3,-5 V5" fill="none" stroke="${INK}" stroke-width="1.6" stroke-dasharray="2 2.4"/>`,
    feather: `<path d="M-8,9 C-11,-4 2,-12 9,-9 C10,-1 2,8 -8,9Z" fill="#6BB8FF" ${G}/><path d="M-8,9 L5,-5" fill="none" ${G}/>`,
    cap: `<circle r="8.5" fill="#FF7B5A" ${G} stroke-dasharray="3.2 2.2"/><circle r="4.5" fill="#FFD8CA" ${G}/>`,
    yarn: `<circle r="8.5" fill="#FF85B8" ${G}/><path d="M-7,-3 Q0,2 7,-3 M-8,2 Q0,7 8,2 M-3,-8 Q-6,0 -2,8" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>`,
    coin: `<circle r="8.5" fill="#FFCF3A" ${G}/><circle r="5" fill="none" stroke="#D99E00" stroke-width="2"/>`,
    clover: `<path d="M0,2 L3,11" fill="none" ${G}/><circle cx="-4.2" cy="-4.2" r="4.4" fill="#4FD1A1" ${G}/><circle cx="4.2" cy="-4.2" r="4.4" fill="#4FD1A1" ${G}/><circle cx="-4.2" cy="4.2" r="4.4" fill="#4FD1A1" ${G}/><circle cx="4.2" cy="4.2" r="4.4" fill="#4FD1A1" ${G}/>`,
    crane: `<path d="M-11,3 L-1,-2 L10,-9 L4,2 L9,8 L0,3 L-5,9Z" fill="#fff" ${G}/><path d="M-1,-2 L0,3 L4,2" fill="none" ${G}/>`,
    puzzle: `<path d="M-8,-7 H-3 a3.2,3.2 0 1 1 6,0 H8 V8 H-8Z" fill="#A98BFF" ${G}/>`,
    pinecone: `<ellipse rx="6.8" ry="9.5" fill="#B9834F" ${G}/><path d="M-6,-3 Q0,1 6,-3 M-6.5,2 Q0,6 6.5,2" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`,
    string: `<path d="M-8,7 C-11,-8 8,-11 7,1 C6,8 -3,7 -2,0" fill="none" stroke="${INK}" stroke-width="5.5" stroke-linecap="round"/><path d="M-8,7 C-11,-8 8,-11 7,1 C6,8 -3,7 -2,0" fill="none" stroke="#FF5A7A" stroke-width="2.6" stroke-linecap="round"/>`,
    candy: `<path d="M-4,0 L-11,-5 V5Z M4,0 L11,-5 V5Z" fill="#FFD9E9" ${G}/><rect x="-5" y="-5" width="10" height="10" rx="3" fill="#FF85B8" ${G}/>`,
    shell: `<path d="M0,8 C-13,6 -12,-8 0,-8 C12,-8 13,6 0,8Z" fill="#FFE1C4" ${G}/><path d="M0,8 V-7 M0,8 L-6,-5 M0,8 L6,-5" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`,
    clip: `<path d="M-5,-4 V5 a4,4 0 0 0 8,0 V-6 a2.6,2.6 0 0 0 -5.2,0 V4" fill="none" stroke="${INK}" stroke-width="5.2" stroke-linecap="round"/><path d="M-5,-4 V5 a4,4 0 0 0 8,0 V-6 a2.6,2.6 0 0 0 -5.2,0 V4" fill="none" stroke="#C9CDD8" stroke-width="2" stroke-linecap="round"/>`,
    flower: [0, 72, 144, 216, 288].map(a => `<circle cx="${(Math.sin(a * Math.PI / 180) * 5.6).toFixed(1)}" cy="${(-Math.cos(a * Math.PI / 180) * 5.6).toFixed(1)}" r="4" fill="#FFB8D4" ${G}/>`).join('') + `<circle r="3" fill="#FFCF3A" ${G}/>`,
    button: `<circle r="8.5" fill="#5AB0FF" ${G}/><circle cx="-2.6" cy="-2.6" r="1.3" fill="${INK}"/><circle cx="2.6" cy="-2.6" r="1.3" fill="${INK}"/><circle cx="-2.6" cy="2.6" r="1.3" fill="${INK}"/><circle cx="2.6" cy="2.6" r="1.3" fill="${INK}"/>`,
    candle: `<rect x="-4" y="-3" width="8" height="12" rx="1.5" fill="#FFF2C2" ${G}/><path d="M0,-3 V-5" fill="none" ${G}/><path d="M0,-11 C3,-8 2.5,-5 0,-5 C-2.5,-5 -3,-8 0,-11Z" fill="#FF9E3A" ${G}/>`,
    eraser: `<g transform="rotate(-20)"><rect x="-9" y="-5" width="18" height="10" rx="2.5" fill="#fff" ${G}/><rect x="-9" y="-5" width="8" height="10" rx="2.5" fill="#6BB8FF" ${G}/></g>`,
    stamp: `<rect x="-8" y="-9" width="16" height="18" fill="#D2F6E7" ${G} stroke-dasharray="2.6 2"/><circle cy="-1" r="3.6" fill="#4FD1A1" ${G}/><path d="M-4,5 H4" fill="none" ${G}/>`,
    bell: `<path d="M-8,5 C-7,-2 -6,-8 0,-8 C6,-8 7,-2 8,5Z" fill="#FFCF3A" ${G}/><circle cy="7.5" r="2.4" fill="#D99E00" ${G}/><path d="M0,-8 V-10.5" fill="none" ${G}/>`,
  };
  const ITEMS = Object.keys(GLYPH);
  const glyph = (id, size) => `<svg class="glyph" viewBox="-13 -13 26 26" width="${size || 28}" height="${size || 28}" aria-hidden="true">${GLYPH[id] || GLYPH.stone}</svg>`;

  /* 场景：跟着真实时间走。白天的天色是这只伙伴自己的颜色，夜里有月亮和星星。窝里摆着它捡的宝贝。 */
  function phaseOf(hour) { return hour < 5 ? 'night' : hour < 8 ? 'dawn' : hour < 17 ? 'day' : hour < 20 ? 'dusk' : 'night'; }
  function scene(phase, hue, items, opt) {
    opt = opt || {}; const id = 'sc' + (++uid), day = HUES[hue % HUES.length][3];
    const sky = { day: [day, day], dawn: ['#FFD9C2', '#FFF0C9'], dusk: ['#B9A4F2', '#FFC4A6'], night: ['#1A1846', '#38357E'] }[phase];
    const ground = { day: '#BDE9AE', dawn: '#BCE6B9', dusk: '#9FD6A8', night: '#3D7668' }[phase], gshade = { day: '#8FD08A', dawn: '#93D09D', dusk: '#78BD8C', night: '#2C5B52' }[phase];
    let sk = '';
    if (phase === 'night') {
      sk += `<circle cx="322" cy="118" r="20" fill="#FFF3C4" ${S} stroke-width="3"/><circle cx="315" cy="112" r="4" fill="#F2DFA0"/><circle cx="328" cy="124" r="2.6" fill="#F2DFA0"/>`;
      const st = [[40, 100], [84, 140], [120, 96], [168, 128], [214, 104], [258, 150], [286, 92], [364, 160], [58, 176], [236, 176], [150, 170], [376, 108]];
      sk += st.map((p, i) => `<circle class="star" style="animation-delay:${(i * 0.37).toFixed(2)}s" cx="${p[0]}" cy="${p[1]}" r="${i % 3 ? 1.6 : 2.4}" fill="#FFF7D6"/>`).join('');
    } else {
      const sun = { day: [326, 116, '#FFE27A'], dawn: [70, 196, '#FFB08A'], dusk: [330, 200, '#FF8E7A'] }[phase];
      sk += `<circle cx="${sun[0]}" cy="${sun[1]}" r="21" fill="${sun[2]}" ${S} stroke-width="3"/>`;
      const cloud = (x, y, s) => `<g class="cloud" transform="translate(${x} ${y}) scale(${s})"><path d="M-30,8 a12,12 0 0 1 4,-23 a17,17 0 0 1 32,-3 a13,13 0 0 1 18,26Z" fill="#fff" ${S} stroke-width="${3 / s}" opacity=".95"/></g>`;
      sk += cloud(168, 112, 0.9) + cloud(262, 152, 0.66);
    }
    let nest = '';
    if (items && items.length) {
      const pos = [[300, 252, -8], [326, 247, 10], [352, 252, 6], [376, 247, -14], [288, 264, 12], [314, 262, 16], [340, 264, -6]];
      nest += `<ellipse cx="332" cy="262" rx="62" ry="9" fill="${INK}" opacity=".12"/>`;
      items.slice(-7).forEach((it, i) => { const p = pos[i]; nest += `<g transform="translate(${p[0]} ${p[1]}) rotate(${p[2]}) scale(1.05)"${it.fresh ? ' class="dropin"' : ''}>${GLYPH[it.id] || GLYPH.stone}</g>`; });
    }
    const tuft = (x, y) => `<path d="M${x},${y} l-4,-9 M${x},${y} l0,-11 M${x},${y} l4,-9" fill="none" stroke="${gshade}" stroke-width="2.6" stroke-linecap="round"/>`;
    return `<svg class="scene ${phase}" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset=".25" stop-color="${sky[0]}"/><stop offset=".85" stop-color="${sky[1]}"/></linearGradient></defs>` +
      `<rect width="400" height="300" fill="url(#${id})"/>${sk}<path d="M0,238 Q90,186 190,226 T400,204 L400,300 L0,300Z" fill="${INK}" opacity="${phase === 'night' ? 0.28 : 0.09}"/>` +
      `<path d="M-4,250 Q200,226 404,250 L404,304 L-4,304Z" fill="${ground}" ${S} stroke-width="3"/>${tuft(36, 268)}${tuft(92, 286)}${tuft(232, 290)}${opt.noNest ? '' : nest}</svg>`;
  }

  root.Critter = { critter, egg, scene, phaseOf, glyph, ITEMS, HUES, SHAPES: SHAPES.length, INK };
})(typeof window !== 'undefined' ? window : globalThis);
