/* =====================================================================
 * 変換ロジック（画面なし・ブラウザでも Node でも動く）
 *
 * 流れ：groupFonts（フォントごとに分ける）→ detect（形式を判定）
 *       → parse（種類＋番号に分解）→ plan（変換先のファイル名を決める）
 * 種類の名前は Proffie のポリフォニック名を「中間名」として使う。
 * 名前の対応は 2026-11-22 に実物の音源（BoBF：Proffie／Xeno3／CFX-GHv3／Verso／Asteria 版）で確認。
 * ===================================================================== */
const SSC = (() => {

  /** 無視するファイル（OS が勝手に作るもの） */
  const JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$|\._|Thumbs\.db$|desktop\.ini$|\.Spotlight|\.Trashes|System Volume Information\/)/i;
  const isWav = p => /\.wav$/i.test(p);
  const AUDIO_OTHER = /\.(mp3|ogg|flac|aif|aiff|m4a)$/i;
  const baseName = p => p.slice(p.lastIndexOf('/') + 1);
  const dirName = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
  const stripExt = n => n.replace(/\.[^.]+$/, '');

  /** ProffieOS の効果名（中間名）。ここにあるものは Proffie → Proffie でそのまま通す */
  const PROFFIE_TYPES = [
    'boot', 'font', 'hum', 'preon', 'out', 'fastout', 'in', 'pstoff',
    'swng', 'swingh', 'swingl', 'slsh', 'spin', 'clsh', 'stab', 'blst', 'force', 'quote',
    'lock', 'bgnlock', 'endlock', 'drag', 'bgndrag', 'enddrag', 'melt', 'bgnmelt', 'endmelt',
    'lb', 'bgnlb', 'endlb', 'ccbegin', 'ccchange', 'ccend', 'bladein', 'bladeout', 'lowbatt',
    'bgnauto', 'auto', 'endauto', 'bgnarm', 'armhum', 'endarm', 'chhum', 'chup', 'chdwn',
    'volup', 'voldown', 'volmin', 'volmax', 'mnum', 'mselect', 'mback', 'menter', 'mclick',
    'tr', 'trloop', 'monosfx', 'bmbeep', 'emtrack', 'blast'
  ];

  /* ---------- 形式ごとの定義 ----------
   * read:  変換元として読むときの「ファイル名の種類 → 中間名」（小文字）
   * write: 変換先として書くときの「中間名 → ファイル名」。無い種類は _unmapped/ へ
   * secondary: Proffie で混ざりがちな別名（中身が同じなら捨てる）
   */
  const F = {};

  F.proffie = {
    id: 'proffie', label: 'PROFFIE', full: 'Proffieboard (ProffieOS)',
    read: Object.assign(Object.fromEntries(PROFFIE_TYPES.map(t => [t, t])), {
      // モノフォニック名・他形式の名前が混ざっていても読む
      clash: 'clsh', blaster: 'blst', lockup: 'lock', swing: 'swng', slash: 'slsh',
      poweron: 'out', poweroff: 'in', pwroff: 'in', color: 'ccchange', track: 'track'
    }),
    secondary: new Set(['clash', 'blaster', 'lockup', 'swing', 'slash', 'poweron', 'poweroff', 'pwroff', 'color']),
    write: null // 中間名そのまま（plan で処理）
  };

  F.xeno3 = {
    id: 'xeno3', label: 'XENO3', full: 'Xenopixel V3',
    read: {
      hum: 'hum', in: 'in', out: 'out', font: 'font', preon: 'preon', postoff: 'pstoff',
      swing: 'swng', swingh: 'swingh', swingl: 'swingl', clash: 'clsh', blaster: 'blst', force: 'force', stab: 'stab',
      lock: 'lock', beginlock: 'bgnlock', endlock: 'endlock',
      drag: 'drag', begindrag: 'bgndrag', enddrag: 'enddrag',
      melt: 'melt', beginmelt: 'bgnmelt', endmelt: 'endmelt',
      lightningblock: 'lb', beginlightningblock: 'bgnlb', endlightningblock: 'endlb',
      // 既存ツールの綴り違い（lighting）も読めるようにする
      lightingblock: 'lb', beginlightingblock: 'bgnlb', endlightingblock: 'endlb',
      poweron: 'boot', track: 'track'
    },
    write: {
      hum: 'hum', in: 'in', out: 'out', font: 'font', preon: 'preon', pstoff: 'postoff',
      swng: 'swing', swingh: 'swingh', swingl: 'swingl', clsh: 'clash', blst: 'blaster', force: 'force', quote: 'force', stab: 'stab',
      lock: 'lock', bgnlock: 'beginlock', endlock: 'endlock',
      drag: 'drag', bgndrag: 'begindrag', enddrag: 'enddrag',
      melt: 'melt', bgnmelt: 'beginmelt', endmelt: 'endmelt',
      lb: 'lightningblock', bgnlb: 'beginlightningblock', endlb: 'endlightningblock',
      boot: 'poweron', track: 'track'
    },
    /** 実物で確認できていない対応（画面と記録に「未確認」と出す） */
    unverified: new Set(['boot', 'pstoff', 'quote', 'preon', 'stab'])
  };

  F.cfx = {
    id: 'cfx', label: 'CFX', full: 'Crystal Focus X / Golden Harvest v3',
    read: {
      boot: 'boot', font: 'font', hum: 'hum', humm: 'hum', poweron: 'out', poweronf: 'fastout', pwron: 'out',
      poweroff: 'in', pwroff: 'in', preon: 'preon', pstoff: 'pstoff',
      swing: 'swng', hswing: 'swingh', lswing: 'swingl', spin: 'spin', clash: 'clsh', stab: 'stab',
      blaster: 'blst', blast: 'blst', force: 'force', fclash: 'force',
      lockup: 'lock', lock: 'lock', startlock: 'bgnlock', bgnlock: 'bgnlock', endlock: 'endlock',
      drag: 'drag', startdrag: 'bgndrag', bgndrag: 'bgndrag', enddrag: 'enddrag',
      melt: 'melt', bgnmelt: 'bgnmelt', endmelt: 'endmelt',
      color: 'ccchange', track: 'track'
    },
    write: {
      boot: 'boot', font: 'font', hum: 'humM', out: 'poweron', fastout: 'poweronf', in: 'poweroff',
      swng: 'swing', swingh: 'hswing', swingl: 'lswing', clsh: 'clash', blst: 'blaster',
      force: 'force', quote: 'force',
      lock: 'lockup', bgnlock: 'startlock', endlock: 'endlock',
      drag: 'drag', bgndrag: 'startdrag', enddrag: 'enddrag',
      ccchange: 'color', track: 'track'
    },
    /** 番号パターン A（1つ目は番号なし、2つ目から 2,3…）。それ以外は B（1 から番号） */
    plainFirst: new Set(['blaster', 'boot', 'poweron', 'poweronf', 'font', 'force', 'lockup', 'drag', 'color', 'poweroff']),
    unverified: new Set(['fastout', 'quote', 'melt', 'bgnmelt', 'endmelt'])
  };

  /* 変換元としてだけ読む形式（BoBF の Verso／Asteria 版で確認） */
  F.verso = {
    id: 'verso', label: 'VERSO', full: 'Verso', inputOnly: true,
    read: { boot: 'boot', font: 'font', hum: 'hum', on: 'out', off: 'in', aswing: 'swng', swingh: 'swingh', swingl: 'swingl',
      clash: 'clsh', deflc: 'blst', lockup: 'lock', endlock: 'endlock', track: 'track' }
  };
  F.asteria = {
    id: 'asteria', label: 'ASTERIA', full: 'Asteria', inputOnly: true,
    read: { bankswitch: 'boot', 'hum/humm': 'hum', 'hum/hum': 'hum', 'out/poweron': 'out', 'in/poweroff': 'in', 'in/pwroff': 'in',
      'hyswing/swing': 'swng', 'clash/clash': 'clsh', 'blaster/blaster': 'blst', 'lockup/lockup': 'lock', 'drag/drag': 'drag',
      'swing/sw_h': 'swingh', 'swing/sw_l': 'swingl' }
  };

  const TARGETS = ['proffie', 'xeno3', 'cfx'];
  const FORMATS = F;

  /** Asteria の種類フォルダ（フォルダ名とファイル名が違うもの） */
  const ASTERIA_DIRS = {hyswing: /^swing\d*$/, swing: /^sw\d+_[hl]$/, in: /^(poweroff|pwroff)\d*$/, out: /^poweron\d*$/, hum: /^humm?\d*$/};
  /** 種類フォルダとして知っている名前（どれかの形式で読める名前＋tracks） */
  let KNOWN = null;
  const known = () => KNOWN || (KNOWN = new Set(['tracks', ...Object.values(F).flatMap(d => Object.keys(d.read))]));
  /** ファイル名から番号を外した「種類の部分」 */
  const typePart = p => stripExt(baseName(p)).toLowerCase().replace(/[\s_-]*\(?\d*\)?$/, '');

  /**
   * 「種類フォルダ」（clsh/、tracks/、Blaster/ など）の一覧を作る。
   * ProffieOS は font/clsh/xxx.wav の「clsh」で種類を決めるので、フォルダ名を優先する。
   * ただし font/ のように中に色々な種類が入っているフォルダは音源そのもの（種類フォルダではない）。
   */
  function effectDirs(paths){
    const parts = new Map();
    for (const p of paths) {
      const d = dirName(p); if (!d) continue;
      if (!parts.has(d)) parts.set(d, new Set());
      parts.get(d).add(typePart(p));
    }
    const out = new Set();
    for (const [d, set] of parts) {
      const dir = baseName(d).toLowerCase();
      if (dir === 'tracks') { out.add(d); continue; }
      if (ASTERIA_DIRS[dir] && [...set].every(b => ASTERIA_DIRS[dir].test(b) || ASTERIA_DIRS[dir].test(b + '1'))) { out.add(d); continue; }
      // 中のファイルが 1 種類（番号違いだけ）で、フォルダ名が知っている名前、またはファイル名と同じ
      const bases = [...set].filter(b => b !== '');
      if (bases.length <= 1 && (known().has(dir) || bases[0] === dir)) out.add(d);
    }
    return out;
  }

  /* ---------- 1. フォントごとに分ける ---------- */
  /**
   * entries: [{path:'BoBF/Xeno3/clash (1).wav', size, ...}]（パス区切りは /）
   * 音声ファイルがある一番近いフォルダを「フォント」とみなす。
   * ただしフォルダ名が効果名（clsh/、tracks/、Blaster/ など）のときは、その1つ上をフォントとする。
   */
  function groupFonts(entries, rootName = 'font'){
    const ok = entries.filter(e => !JUNK.test(e.path) && !e.path.endsWith('/'));
    const eff = effectDirs(ok.filter(e => isWav(e.path) || AUDIO_OTHER.test(e.path)).map(e => e.path));
    const fontRootOf = p => eff.has(dirName(p)) ? dirName(dirName(p)) : dirName(p);
    const roots = new Set(ok.filter(e => isWav(e.path) || AUDIO_OTHER.test(e.path)).map(e => fontRootOf(e.path)));
    // 音声のないファイル（設定ファイルなど）は、いちばん近い祖先のフォントに入れる
    const findRoot = p => { let d = dirName(p); for (;;) { if (roots.has(d)) return d; if (!d) return null; d = dirName(d); } };
    const map = new Map(), ignored = [];
    for (const e of ok) {
      const r = findRoot(e.path);
      if (r == null) { ignored.push(e); continue; }
      if (!map.has(r)) map.set(r, []);
      map.get(r).push(e);
    }
    const fonts = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([root, files]) => ({
      root, name: root ? baseName(root) : rootName,
      files: files.map(e => ({entry: e, rel: root ? e.path.slice(root.length + 1) : e.path}))
    }));
    // 同じ名前のフォントがあれば親フォルダ名を足して区別する
    const cnt = {}; fonts.forEach(f => cnt[f.name] = (cnt[f.name] || 0) + 1);
    fonts.forEach(f => { if (cnt[f.name] > 1 && f.root.includes('/')) f.name = baseName(dirName(f.root)) + '_' + f.name; });
    return {fonts, ignored};
  }

  /* ---------- 2. 形式の自動判定 ---------- */
  /** BGM（tracks）しか入っていない＝音源ではなく、SD カード直下の共通 BGM フォルダ */
  const isTracksOnly = font => { const w = font.files.filter(x => isWav(x.rel)); return w.length > 0 && w.every(x => /^tracks?\//i.test(x.rel)); };

  function detect(font){
    const s = {proffie: 0, xeno3: 0, cfx: 0, verso: 0, asteria: 0};
    let wavs = 0;
    for (const {rel} of font.files) {
      const lo = rel.toLowerCase(), n = baseName(lo), b = stripExt(n);
      if (n === 'config.ini' || n === 'smoothsw.ini') s.proffie += 20;
      if (n === 'font_config.txt' || n === 'leds.txt') s.cfx += 20;
      if (n === 'fontconfig.ini') s.xeno3 += 20;
      if (!isWav(n)) continue;
      wavs++;
      if (/ \(\d+\)$/.test(b)) s.xeno3 += 3;
      if (/^(clsh|swng|blst|bgnlock|bgndrag|bgnmelt|bgnlb|endlb|ccbegin|ccchange|ccend|pstoff|slsh)\d*$/.test(b)) s.proffie += 3;
      if (/^(clsh|swng|blst|in|out|swingh|swingl|boot|lock|drag|melt|force|quote)\//.test(lo)) s.proffie += 3;
      if (/^(humm\d*|pwroff2|hswing\d*|lswing\d*|startlock\d*|startdrag\d*|poweron\d*|poweroff\d*|poweronf\d*|color)$/.test(b)) s.cfx += 3;
      if (/^(aswing|deflc|on|off)\d+$/.test(b)) s.verso += 4;
      if (/^(hyswing|swing|blaster|clash|hum)\//.test(lo) && /^(hyswing|swing|blaster|clash|hum|in|out|lockup|drag)\//.test(lo)) s.asteria += 2;
      if (/^swing\/sw\d+_[hl]$/.test(lo.replace(/\.wav$/, '')) || b === 'bankswitch') s.asteria += 6;
    }
    const order = Object.entries(s).sort((a, b) => b[1] - a[1]);
    const format = order[0][1] > 0 ? order[0][0] : 'proffie';
    return {format, scores: s, wavs, sure: order[0][1] > 0 && order[0][1] >= 2 * (order[1][1] || 0)};
  }

  /* ---------- 3. 種類＋番号に分解 ---------- */
  /** 1つのファイル → {name（種類名・小文字）, num（番号。なければ 0）} */
  function splitName(rel, fmt){
    const lo = rel.toLowerCase(), parts = lo.split('/'), file = stripExt(parts[parts.length - 1]);
    const dir = parts.length > 1 ? parts[parts.length - 2] : '';
    if (fmt === 'asteria') {
      let m = /^sw(\d+)_([hl])$/.exec(file);
      if (dir === 'swing' && m) return {name: 'swing/sw_' + m[2], num: +m[1]};
      m = /^(.*?)(\d*)$/.exec(file);
      return {name: (dir ? dir + '/' : '') + m[1], num: m[2] ? +m[2] : 0};
    }
    let m = /^(.*?)\s*\((\d+)\)$/.exec(file);           // Xeno3：clash (1)
    if (!m) m = /^(.*?)[\s_-]*(\d*)$/.exec(file);         // clash1 / clsh01 / clash_01 / 001
    let name = m[1], num = m[2] ? +m[2] : 0;
    if (!name && dir) name = dir;                          // clsh/001.wav
    if (dir === 'tracks' || dir === 'track') return {name: 'track', num, keep: baseName(rel)};
    // 種類フォルダの中（clsh/xxx.wav）はフォルダ名を優先（ProffieOS と同じ）。ファイル名と違えば記録
    if (dir && parts.length === 2 && F[fmt].read[dir] && name !== dir) return {name: dir, num, misnamed: name};
    if (fmt === 'cfx' && name === 'pwroff' && num === 2) return {name: 'pwroff2', num: 0};
    return {name, num};
  }

  /**
   * フォントを種類ごとに分ける。
   * 戻り値：{types: Map(中間名 → [{f, name, num}...]（番号順）), unknown: [f...], configs: [f...]}
   */
  function parse(font, fmt){
    const def = F[fmt], types = new Map(), unknown = [], configs = [];
    for (const f of font.files) {
      const n = baseName(f.rel);
      if (!isWav(n)) {
        if (AUDIO_OTHER.test(n)) unknown.push({f, why: 'notWav'});
        else configs.push(f);
        continue;
      }
      const sp = splitName(f.rel, fmt);
      let key = sp.name;
      if (key === 'pwroff2') key = 'pwroff';
      const type = def.read[key];
      if (!type) { unknown.push({f, why: 'unknownName'}); continue; }
      if (!types.has(type)) types.set(type, []);
      types.get(type).push({f, name: sp.name, num: sp.num, keep: sp.keep, misnamed: sp.misnamed});
    }
    // 番号順（数値で）。番号なしは先頭。CFX の消灯は poweroff → pwroff2 → poweroff2… の順
    const rank = x => {
      if (fmt === 'cfx' && x.name === 'pwroff2') return 1.5;
      if (fmt === 'cfx' && x.name === 'poweroff' && x.num >= 2) return x.num;
      return x.num;
    };
    for (const list of types.values()) list.sort((a, b) => (rank(a) - rank(b)) || a.f.rel.localeCompare(b.f.rel, 'en', {numeric: true}));
    return {types, unknown, configs};
  }

  /* ---------- 4. 変換先のファイル名を決める ---------- */
  const DEFAULT_OPTS = {digits: 2, meltToDrag: false, addIni: true};

  /** Proffie 用の smoothsw.ini（ProffieOS の既定値＋Version=2）。無いと SmoothSwing が V1 扱いになるため、swingh／swingl があるときだけ足す */
  const PROFFIE_SMOOTHSW = [
    '# smoothsw.ini — added by Saber Sound Converter (ProffieOS default values)',
    'Version=2', 'SwingSensitivity=450.0', 'MaximumHumDucking=75.0', 'SwingSharpness=1.75',
    'SwingStrengthThreshold=20.0', 'Transition1Degrees=45.0', 'Transition2Degrees=160.0', 'MaxSwingVolume=3.0', ''
  ].join('\r\n');

  /**
   * font を target 形式にしたときの出力一覧を作る。
   * 戻り値：{items:[{out, src, type, note}], unmapped:[{out, src, why}], extra:[{out, text}], warnings:[{key, args}]}
   *   src は font.files の要素（中身はまだ読まない）
   */
  function plan(font, srcFmt, target, opts = {}){
    opts = Object.assign({}, DEFAULT_OPTS, opts);
    const P = parse(font, srcFmt), tdef = F[target];
    const dropped = [];
    if (opts.exclude && opts.exclude.size) for (const [t, list] of P.types) {
      const keep = list.filter(x => !opts.exclude.has(x.f));
      dropped.push(...list.filter(x => opts.exclude.has(x.f)).map(x => x.f));
      if (keep.length) P.types.set(t, keep); else P.types.delete(t);
    }
    const items = [], unmapped = [], extra = [], warnings = [];
    const types = new Map([...P.types].map(([k, v]) => [k, v.slice()]));

    // Proffie 入力：同じ効果に別名が混ざっていたら記録（中身の比較は dedupe() で後から）
    const mixed = [];
    if (srcFmt === 'proffie') for (const [t, list] of types) {
      const names = new Set(list.map(x => x.name));
      if (names.size > 1 && list.some(x => F.proffie.secondary.has(x.name))) mixed.push(t);
    }

    // quote は Xeno3／CFX では force に入れる（区別がない）
    if (target !== 'proffie' && types.has('quote')) {
      const q = types.get('quote'); types.delete('quote');
      types.set('force', (types.get('force') || []).concat(q));
      warnings.push({key: 'wQuote', args: {n: q.length}});
    }
    // CFX：メルトはドラッグに統合（オプション）。font は1つだけ（2つ目以降は boot へ）
    if (target === 'cfx') {
      if (opts.meltToDrag) for (const [m, d] of [['melt', 'drag'], ['bgnmelt', 'bgndrag'], ['endmelt', 'enddrag']]) {
        if (!types.has(m)) continue;
        types.set(d, (types.get(d) || []).concat(types.get(m))); types.delete(m);
        warnings.push({key: 'wMeltDrag', args: {}});
      }
      const fl = types.get('font');
      if (fl && fl.length > 1) { types.set('font', fl.slice(0, 1)); types.set('boot', (types.get('boot') || []).concat(fl.slice(1))); warnings.push({key: 'wCfxFont', args: {n: fl.length - 1}}); }
    }

    const order = [...PROFFIE_TYPES, 'track'];
    const sortedTypes = [...types.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    for (const type of sortedTypes) {
      const list = types.get(type);
      let outName = target === 'proffie' ? (type === 'track' || PROFFIE_TYPES.includes(type) ? type : null) : tdef.write[type];
      if (!outName) {
        for (const x of list) unmapped.push({out: '_unmapped/' + x.f.rel, src: x.f, why: 'noTarget', type});
        continue;
      }
      const note = tdef.unverified && tdef.unverified.has(type) ? 'unverified' : '';
      list.forEach((x, i) => items.push({out: outPath(target, type, outName, i, list.length, x, opts), src: x.f, type, note}));
      // CFX：動かしながら消灯した用の pwroff2。消灯音が1つしかないときは同じ音を入れる
      if (target === 'cfx' && type === 'in' && list.length === 1) items.push({out: 'pwroff2.wav', src: list[0].f, type, note: 'copy'});
    }
    for (const u of P.unknown) unmapped.push({out: '_unmapped/' + u.f.rel, src: u.f, why: u.why});
    for (const c of P.configs) {
      const n = baseName(c.rel).toLowerCase();
      const keep = (target === 'proffie' && /^(config\.ini|smoothsw\.ini)$/.test(n) && srcFmt === 'proffie')
        || (target === 'cfx' && /^(font_config\.txt|leds\.txt)$/.test(n) && srcFmt === 'cfx')
        || (target === 'xeno3' && n === 'fontconfig.ini' && srcFmt === 'xeno3');
      if (keep) items.push({out: baseName(c.rel), src: c, type: 'config', note: ''});
      else unmapped.push({out: '_unmapped/' + c.rel, src: c, why: 'config'});
    }
    // Proffie：SmoothSwing のペアがあって smoothsw.ini がなければ足す
    if (target === 'proffie' && opts.addIni) {
      const has = n => items.some(i => i.out.toLowerCase() === n);
      if (!has('smoothsw.ini') && types.has('swingh') && types.has('swingl')) extra.push({out: 'smoothsw.ini', text: PROFFIE_SMOOTHSW});
    }
    if (target === 'proffie' && !(types.has('swingh') && types.has('swingl')) && types.has('swng')) warnings.push({key: 'wNoSmooth', args: {}});
    if (!types.has('hum')) warnings.push({key: 'wNoHum', args: {}});
    for (const t of mixed) warnings.push({key: 'wMixed', args: {t}});
    const mis = [...P.types.values()].flat().filter(x => x.misnamed && x.misnamed !== '').map(x => x.f.rel);
    if (mis.length) warnings.push({key: 'wDirName', args: {n: mis.length, f: mis.join(', ')}});
    if (dropped.length) warnings.push({key: 'wDupDropped', args: {n: dropped.length, f: dropped.map(f => f.rel).join(', ')}});
    if (unmapped.length) warnings.push({key: 'wUnmapped', args: {n: unmapped.length}});
    const unv = [...new Set(items.filter(i => i.note === 'unverified').map(i => i.type))];
    if (unv.length) warnings.push({key: 'wUnverified', args: {t: unv.join(', ')}});
    return {items, unmapped, extra, warnings, mixed, dropped, parsed: P};
  }

  /** 変換先のパス */
  function outPath(target, type, name, i, count, x, opts){
    const n = i + 1;
    if (target === 'proffie') {
      if (type === 'track') return 'tracks/' + (x.keep && x.keep.toLowerCase() !== 'track.wav' && !/^track\s*\(?\d*\)?\.wav$/i.test(x.keep) ? x.keep : `track${String(n).padStart(Math.max(opts.digits, String(count).length), '0')}.wav`);
      if (count === 1) return name + '.wav';
      const num = String(n).padStart(Math.max(opts.digits, String(count).length), '0');
      return `${name}/${name}${num}.wav`;
    }
    if (target === 'xeno3') return `${name} (${n}).wav`;
    // CFX
    if (type === 'track') return `tracks/track${n}.wav`;
    if (type === 'in') {
      // 消灯：1つ目 poweroff、2つ目 pwroff2（動かしながら消灯）、3つ目から poweroff2, poweroff3…（BoBF の CFX 版と同じ並び）
      if (n === 1) return 'poweroff.wav';
      if (n === 2) return 'pwroff2.wav';
      return `poweroff${n - 1}.wav`;
    }
    if (F.cfx.plainFirst.has(name)) return n === 1 ? name + '.wav' : `${name}${n}.wav`;
    return `${name}${n}.wav`;
  }

  /** 出力パスの重複（大文字小文字違いも）があれば後ろに _2 を付ける */
  function uniquePaths(list){
    const seen = new Set();
    for (const it of list) {
      let p = it.out, k = p.toLowerCase(), i = 2;
      while (seen.has(k)) { p = it.out.replace(/(\.[^.\/]+)?$/, m => `_${i}${m}`); k = p.toLowerCase(); i++; }
      it.out = p; seen.add(k);
    }
    return list;
  }

  /**
   * Proffie 入力で別名が混ざった種類（ccchange.wav と color/color.wav など）について、
   * 別名側のファイルが本来の名前のファイルと中身まで同じなら、そのファイルの一覧を返す。
   * plan(..., {exclude}) に渡すと出力から外して番号を詰める。readData(f) → Uint8Array
   */
  async function findMixedDupes(pl, readData){
    const drop = new Set();
    const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
    for (const t of pl.mixed || []) {
      const list = pl.parsed.types.get(t) || [];
      const prim = list.filter(x => !F.proffie.secondary.has(x.name)), sec = list.filter(x => F.proffie.secondary.has(x.name));
      const pd = []; for (const x of prim) pd.push(await readData(x.f));
      for (const x of sec) { const d = await readData(x.f); if (pd.some(p => same(p, d))) drop.add(x.f); }
    }
    return drop;
  }

  /** 対象外の形式（Verso／Asteria）や判定結果の表示用 */
  const label = id => (F[id] || {}).label || id;

  return {isTracksOnly, FORMATS, TARGETS, PROFFIE_TYPES, groupFonts, detect, parse, plan, findMixedDupes, uniquePaths, splitName, label, DEFAULT_OPTS, isWav};
})();
if (typeof module !== 'undefined') module.exports = SSC;
