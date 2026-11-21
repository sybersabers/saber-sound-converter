/* =====================================================================
 * 画面
 *  01 SOURCE：音源を入れる → 02 TARGET：変換先 → 03 PREVIEW：変換前 → 変換後 → 04 CONVERT：ZIP
 * ===================================================================== */
const App = {
  entries: [], fonts: [], ignored: 0, busy: false, last: null,
  target: 'proffie', opts: {},

  init(){
    lang = store.get('lang', (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en');
    this.target = store.get('target', 'proffie');
    this.opts = Object.assign({}, SSC.DEFAULT_OPTS, store.get('opts', {}));
    $('langSel').value = lang;
    $('langSel').onchange = e => { lang = e.target.value; store.set('lang', lang); this.renderAll(); };
    $('dlgOk').onclick = () => $('dlg').close();
    $('btnConvert').onclick = () => this.convert();
    $('mailLink').onclick = e => { e.preventDefault(); this.openMail(); };
    document.addEventListener('click', async e => {
      const b = e.target.closest('.shr-link'); if (!b) return;
      try { await navigator.clipboard.writeText(b.dataset.copy); toast(t('shareCopied')); } catch { toast(t('error')); }
    });
    // ファイルの入力
    $('inFolder').onchange = e => { this.addInput([...e.target.files].map(f => Input.fromFile(f))); e.target.value = ''; };
    $('inZip').onchange = async e => { const fs = [...e.target.files]; e.target.value = ''; this.addInput(async () => { const out = []; for (const f of fs) await Input.addFile(out, f, f.name); return out; }); };
    // ページのどこに落としても受け付ける
    let depth = 0;
    window.addEventListener('dragenter', e => { if (this.busy || !e.dataTransfer.types.includes('Files')) return; depth++; document.body.classList.add('dragging'); });
    window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('dragging'); } });
    window.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
    window.addEventListener('drop', e => {
      e.preventDefault(); depth = 0; document.body.classList.remove('dragging');
      if (this.busy) return;
      const dt = e.dataTransfer; const p = Input.fromDrop(dt);
      this.addInput(() => p);
    });
    window.addEventListener('beforeunload', e => { if (this.busy) { e.preventDefault(); e.returnValue = t('leaveWarn'); } });
    this.renderAll();
  },

  /** 入力を足す（配列、または配列を返す関数） */
  async addInput(src){
    this.setStatus(t('loading'));
    try {
      const list = typeof src === 'function' ? await src() : src;
      if (!list.length) { this.setStatus(''); return; }
      // 同じパスは後から入れたほうで置き換える
      const map = new Map(this.entries.map(e => [e.path, e]));
      for (const e of list) map.set(e.path.replace(/\\/g, '/'), Object.assign(e, {path: e.path.replace(/\\/g, '/')}));
      this.entries = [...map.values()];
      this.regroup();
    } catch (err) {
      console.error(err);
      const m = String(err && err.message);
      showDialog(t('error'), m === 'ZIP_ENC' ? t('errEnc') : m === 'NO_DS' ? t('errBrowser') : /ZIP/.test(m) ? t('errZip') : m);
    }
    this.setStatus('');
  },

  regroup(){
    const old = new Map(this.fonts.map(f => [f.root, f]));
    const {fonts, ignored} = SSC.groupFonts(this.entries);
    this.ignored = ignored.length;
    this.fonts = fonts.map(f => {
      const o = old.get(f.root);
      const det = SSC.detect(f);
      const sys = SSC.isSystemFolder(f), tracksOnly = SSC.isTracksOnly(f);
      return Object.assign(f, {det, sys, tracksOnly, alias: o ? o.alias : '', xnum: o ? o.xnum : (/^\d+$/.test(f.name) ? +f.name : null),
        fmt: o ? o.fmt : det.format, include: o ? o.include : det.format !== this.target && !tracksOnly && !sys, exclude: new Map(), wavBad: o ? o.wavBad : null, open: o ? o.open : false});
    });
    this.numberFonts();
    this.renderAll();
    this.loadFontTxt();
    this.scanFonts();
  },

  /** Xeno3 のフォルダ番号：フォルダ名が数字ならその番号、なければ空いている番号を 1 から順に */
  numberFonts(){
    const used = new Set(this.fonts.filter(f => f.xnum).map(f => f.xnum));
    let n = 1;
    for (const f of this.fonts) if (!f.xnum && !f.sys && !f.tracksOnly) { while (used.has(n)) n++; f.xnum = n; used.add(n); }
  },
  /** Xeno3 の SD にある font.txt（「34 darksaber」の一覧）から音源の名前を拾う */
  async loadFontTxt(){
    let changed = false;
    for (const e of this.entries.filter(e => /(^|\/)font\.txt$/i.test(e.path))) {
      const dir = e.path.replace(/\/?font\.txt$/i, '');
      let text = ''; try { text = new TextDecoder().decode(await e.read()); } catch { continue; }
      for (const line of text.split(/\r?\n/)) {
        const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(line); if (!m) continue;
        const f = this.fonts.find(f => f.name === m[1] && f.root === (dir ? dir + '/' : '') + m[1]);
        if (f && !f.alias) { f.alias = m[2]; changed = true; }
      }
    }
    if (changed) this.renderPreview();
  },

  /** WAV の形式チェックと、Proffie の別名の重複チェック（どちらも中身を読むので後から） */
  async scanFonts(){
    const job = this.scanJob = {};
    for (const f of this.fonts) {
      if (f.wavBad) continue;
      const wavs = f.files.filter(x => SSC.isWav(x.rel)), bad = [];
      let i = 0;
      const worker = async () => {
        while (i < wavs.length) {
          const x = wavs[i++];
          try { const info = Wav.info(await x.entry.head(65536)); if (!Wav.isStd(info)) bad.push({rel: x.rel, fmt: Wav.fmt(info)}); } catch { bad.push({rel: x.rel, fmt: '?'}); }
        }
      };
      await Promise.all([1, 2, 3, 4, 5, 6].map(worker));
      if (job !== this.scanJob) return;
      f.wavBad = bad;
      this.renderPreview(); this.renderBar();
    }
    await this.checkDupes();
  },
  async checkDupes(){
    let changed = false;
    for (const f of this.fonts) {
      if (f.fmt !== 'proffie' || f.exclude.has('proffie')) continue;
      const pl = SSC.plan(f, 'proffie', this.target, this.opts);
      f.exclude.set('proffie', pl.mixed.length ? await SSC.findMixedDupes(pl, x => x.entry.read()) : new Set());
      if (f.exclude.get('proffie').size) changed = true;
    }
    if (changed) { this.renderPreview(); this.renderBar(); }
  },

  planFor(f){
    const pl = SSC.plan(f, f.fmt, this.target, Object.assign({}, this.opts, {exclude: f.exclude.get(f.fmt), xenoKey: /^\d+$/.test(f.name) && f.alias ? f.alias : f.name}));
    SSC.uniquePaths(pl.items.concat(pl.extra).concat(pl.unmapped));
    return pl;
  },

  /* ---------- 描画 ---------- */
  renderAll(){
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-t]').forEach(el => el.innerHTML = t(el.dataset.t));
    $('shopLink').href = shopUrl();
    $('shareFoot').innerHTML = `<span>Share</span>${shareHtml(t('shareText'))}`;
    this.renderSource(); this.renderTarget(); this.renderPreview(); this.renderBar();
  },
  setStatus(s){ $('status').textContent = s; },

  renderSource(){
    const n = this.fonts.length, files = this.fonts.reduce((a, f) => a + f.files.length, 0);
    $('srcInfo').innerHTML = n ? `<span class="mono badge">${esc(t('loaded', {fonts: n, files}))}</span>${this.ignored ? ` <small>${esc(t('ignored', {n: this.ignored}))}</small>` : ''} <button class="btn tiny" id="btnClear">${t('clear')}</button>` : '';
    const c = $('btnClear'); if (c) c.onclick = () => { this.entries = []; this.fonts = []; this.ignored = 0; this.last = null; this.renderAll(); };
    $('drop').classList.toggle('has', n > 0);
  },

  renderTarget(){
    $('tgts').innerHTML = SSC.TARGETS.map(id => {
      const F = SSC.FORMATS[id];
      return `<button class="tgt${id === this.target ? ' on' : ''}" data-tgt="${id}" aria-pressed="${id === this.target}"><b>${F.label}</b><span>${esc(F.full)}</span><code class="mono">${esc(t('tgtEx')[id])}</code></button>`;
    }).join('');
    $('tgts').querySelectorAll('[data-tgt]').forEach(b => b.onclick = () => {
      const prev = this.target; this.target = b.dataset.tgt; store.set('target', this.target);
      // 「変換先と同じ形式なので外す」を付け直す
      for (const f of this.fonts) { if (f.fmt === this.target) f.include = false; else if (f.fmt === prev && !f.tracksOnly) f.include = true; }
      this.last = null; this.renderTarget(); this.renderOpts(); this.renderPreview(); this.renderBar();
    });
    this.renderOpts();
  },
  renderOpts(){
    const o = this.opts, tg = this.target;
    $('opts').innerHTML = `
      ${tg === 'proffie' ? `<label class="inl">${t('optDigits')} <select id="oDigits">${[1, 2, 3].map(d => `<option value="${d}"${o.digits === d ? ' selected' : ''}>${['1, 2, 3', '01, 02, 03', '001, 002, 003'][d - 1]}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" id="oIni"${o.addIni ? ' checked' : ''}>${t('optIni')}</label>` : ''}
      ${tg === 'cfx' ? `<label class="chk"><input type="checkbox" id="oMelt"${o.meltToDrag ? ' checked' : ''}>${t('optMelt')}</label>` : ''}
      ${tg === 'xeno3' ? `<label class="chk"><input type="checkbox" id="oXIni"${o.xenoIni ? ' checked' : ''}>${t('optXenoIni')}</label>` : ''}`;
    const save = () => { store.set('opts', {digits: o.digits, addIni: o.addIni, meltToDrag: o.meltToDrag, xenoIni: o.xenoIni}); this.last = null; this.renderPreview(); this.renderBar(); };
    if ($('oDigits')) $('oDigits').onchange = e => { o.digits = +e.target.value; save(); };
    if ($('oIni')) $('oIni').onchange = e => { o.addIni = e.target.checked; save(); };
    if ($('oXIni')) $('oXIni').onchange = e => { o.xenoIni = e.target.checked; save(); };
    if ($('oMelt')) $('oMelt').onchange = e => { o.meltToDrag = e.target.checked; save(); };
  },

  /** 一覧を短く：1つなら名前、複数なら「最初 … 最後」 */
  span(list){
    if (!list.length) return '';
    const n = s => esc(s.replace(/\.wav$/i, ''));
    return list.length === 1 ? n(list[0]) : `${n(list[0])}<i>〜</i>${n(list[list.length - 1])}`;
  },

  renderPreview(){
    const el = $('preview');
    if (!this.fonts.length) { el.innerHTML = `<p class="hint empty">${t('noFonts')}</p>`; return; }
    const tgtLabel = SSC.label(this.target);
    el.innerHTML = this.fonts.map((f, fi) => {
      const pl = this.planFor(f);
      const wavItems = pl.items.filter(i => SSC.isWav(i.out));
      // 種類ごとにまとめる
      const groups = new Map();
      for (const it of pl.items) { if (!groups.has(it.type)) groups.set(it.type, []); groups.get(it.type).push(it); }
      const rows = [...groups].map(([type, its]) => {
        const unv = its.some(i => i.note === 'unverified');
        return `<tr${unv ? ' class="unv"' : ''}><td class="mono ty">${esc(type)}${unv ? ` <span class="warnmark" title="${esc(t('unverifiedTip'))}">⚠</span>` : ''}</td>
          <td class="mono">${this.span(its.map(i => i.src.rel))}</td><td class="arr">→</td><td class="mono to">${this.span(its.map(i => i.out))}</td><td><span class="badge">${its.length}</span></td></tr>`;
      }).join('');
      const extra = pl.extra.map(x => `<tr class="add"><td class="mono ty">+</td><td></td><td class="arr">→</td><td class="mono to">${esc(x.out)}</td><td></td></tr>`).join('');
      const warns = pl.warnings.map(w => t(w.key, w.args));
      if (f.wavBad && f.wavBad.length) warns.push(t('wFormat', {n: f.wavBad.length, f: f.wavBad[0].rel, fmt: f.wavBad[0].fmt}));
      if (f.fmt === this.target) warns.unshift(t('same'));
      if (f.tracksOnly) warns.unshift(t('wTracksOnly'));
      if (f.sys) warns.unshift(t('wSystem'));
      if (this.target === 'xeno3' && f.include && this.selected().some(g => g !== f && g.xnum === f.xnum)) warns.unshift(t('wNumDup', {n: f.xnum}));
      const fmtSel = Object.values(SSC.FORMATS).map(F => `<option value="${F.id}"${F.id === f.fmt ? ' selected' : ''}>${F.label}${F.inputOnly ? ' *' : ''}</option>`).join('');
      const all = pl.items.concat(pl.extra.map(x => ({out: x.out, src: {rel: '(new)'}}))).map(i => `${i.src.rel}  →  ${i.out}`).join('\n');
      const un = pl.unmapped.map(u => `<li><span class="mono">${esc(u.src.rel)}</span> <small>— ${esc(t('why')[u.why] || u.why)}</small></li>`).join('');
      return `<section class="font${f.include ? '' : ' off'}" data-fi="${fi}">
        <div class="font-h">
          <label class="chk"><input type="checkbox" data-inc="${fi}"${f.include ? ' checked' : ''}><span class="sr">${t('include')}</span></label>
          <b class="fname">${esc(f.name)}</b>${f.alias ? `<span class="falias">${esc(f.alias)}</span>` : ''}<small class="mono froot">${esc(f.root || '/')}</small>
          <span class="hsp"></span>
          <label class="mono fsel"><span>${t('detected')}</span><select data-fmt="${fi}" aria-label="${t('detected')}">${fmtSel}</select></label>
          <span class="mono farrow">→ <b>${tgtLabel}</b></span>
          ${this.target === 'xeno3' && !f.sys && !f.tracksOnly ? `<label class="mono fnum" title="${esc(t('xnumTip'))}"><span>${t('xnum')}</span><input type="number" min="1" max="999" data-num="${fi}" value="${f.xnum || 1}"></label>` : ''}
        </div>
        <div class="fstats mono"><span>${f.files.length} ${t('files')}</span><span class="ok">${wavItems.length} ${t('converted')}</span>${pl.unmapped.length ? `<span class="wn">${pl.unmapped.length} ${t('unmapped')}</span>` : ''}${SSC.FORMATS[f.fmt].inputOnly ? `<span>* ${t('inputOnly')}</span>` : ''}</div>
        ${warns.length ? `<ul class="warns">${warns.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
        <div class="tw"><table class="map"><thead><tr><th>${t('colType')}</th><th>${t('colFrom')}</th><th></th><th>${t('colTo')} (${tgtLabel})</th><th></th></tr></thead><tbody>${rows}${extra}</tbody></table></div>
        ${un ? `<details class="unm"><summary>${t('unmappedT')}（${pl.unmapped.length}）</summary><ul>${un}</ul></details>` : ''}
        <details class="all"><summary>${t('showAll')}</summary><pre class="log">${esc(all)}</pre></details>
      </section>`;
    }).join('');
    el.querySelectorAll('[data-inc]').forEach(c => c.onchange = () => { this.fonts[+c.dataset.inc].include = c.checked; this.last = null; this.renderPreview(); this.renderBar(); });
    el.querySelectorAll('[data-num]').forEach(i => i.onchange = () => {
      const v = Math.max(1, Math.min(999, parseInt(i.value, 10) || 1));
      this.fonts[+i.dataset.num].xnum = v; this.last = null; this.renderPreview(); this.renderBar();
    });
    el.querySelectorAll('[data-fmt]').forEach(s => s.onchange = async () => {
      const f = this.fonts[+s.dataset.fmt]; f.fmt = s.value; this.last = null;
      this.renderPreview(); this.renderBar(); await this.checkDupes();
    });
  },

  selected(){ return this.fonts.filter(f => f.include); },
  renderBar(){
    const sel = this.selected();
    const files = sel.reduce((a, f) => { const pl = this.planFor(f); return a + pl.items.length + pl.extra.length + pl.unmapped.length; }, 0);
    $('sumBar').textContent = sel.length ? t('sumBar', {fonts: sel.length, files, tgt: SSC.label(this.target)}) : (this.fonts.length ? t('nothing') : '');
    $('btnConvert').disabled = !sel.length || this.busy;
    const r = $('result');
    if (this.last) {
      r.hidden = false;
      r.innerHTML = `<div class="done-h"><b class="disp">${t('done')}</b><span>${esc(t('doneSub', {name: this.last.name, size: fmtSize(this.last.blob.size)}))}</span>
        <button class="btn small" id="btnAgain">${t('again')}</button></div>
        <details><summary>${t('logT')}</summary><pre class="log">${esc(this.last.log)}</pre></details>`;
      $('btnAgain').onclick = () => download(this.last.name, this.last.blob);
    } else r.hidden = true;
  },

  /* ---------- 変換 ---------- */
  async convert(){
    const sel = this.selected(); if (!sel.length || this.busy) return;
    this.busy = true; document.body.classList.add('is-busy'); this.renderBar();
    const tg = this.target, T = SSC.label(tg);
    const jobs = [];
    const log = [`Saber Sound Converter ${APP_VER}`, `${fmtDate()}  →  ${T}`, `Options: ${JSON.stringify({digits: this.opts.digits, addIni: this.opts.addIni, meltToDrag: this.opts.meltToDrag})}`, ''];
    const used = new Set();
    for (const f of sel) {
      const pl = this.planFor(f);
      // Xeno3 はフォルダ番号がフォルダ名。他は名前（font.txt の名前があればそれ）
      const base = tg === 'xeno3' ? String(f.xnum || 1) : (f.alias || f.name);
      let dir = base.replace(/[<>:"|?*\\/]/g, '_') || 'font', k = 2;
      while (used.has(dir.toLowerCase())) dir = `${base}_${k++}`;
      used.add(dir.toLowerCase());
      log.push(`==== ${f.name}${f.alias ? ' ' + f.alias : ''}  (${f.root || '/'})  ${SSC.label(f.fmt)} → ${T}  [${dir}/]`);
      for (const w of pl.warnings) log.push(`! ${t(w.key, w.args)}`);
      if (f.wavBad && f.wavBad.length) { log.push(`! ${t('wFormat', {n: f.wavBad.length, f: f.wavBad[0].rel, fmt: f.wavBad[0].fmt})}`); for (const b of f.wavBad) log.push(`    ${b.rel}  ${b.fmt}`); }
      for (const it of pl.items) { jobs.push({path: `${dir}/${it.out}`, src: it.src}); log.push(`  ${it.src.rel}  →  ${it.out}${it.note === 'unverified' ? '   [unverified]' : it.note === 'copy' ? '   [copy]' : ''}`); }
      for (const x of pl.extra) { jobs.push({path: `${dir}/${x.out}`, text: x.text}); log.push(`  (new)  →  ${x.out}${x.out === 'fontconfig.ini' ? '   ' + x.text : ''}`); }
      for (const u of pl.unmapped) { jobs.push({path: `${dir}/${u.out}`, src: u.src}); log.push(`  ${u.src.rel}  →  ${u.out}   [${t('why')[u.why] || u.why}]`); }
      log.push('');
    }
    const logText = log.join('\r\n');
    this.busyShow(true);
    try {
      const zw = Zip.writer(), enc = new TextEncoder();
      for (let i = 0; i < jobs.length; i++) {
        const j = jobs[i];
        this.busyStep(i, jobs.length, j.path);
        zw.add(j.path, j.text != null ? enc.encode(j.text) : await j.src.entry.read());
        if (i % 8 === 7) await new Promise(r => setTimeout(r));
      }
      zw.add('conversion_log.txt', enc.encode('﻿' + logText));
      this.busyStep(jobs.length, jobs.length, '');
      const blob = zw.finish();
      const name = sel.length === 1 ? `${sel[0].name}_${T}.zip` : `SoundFonts_${T}_${stamp()}.zip`;
      this.last = {name, blob, log: logText};
      download(name, blob);
    } catch (err) {
      console.error(err);
      const m = String(err && err.message);
      showDialog(t('error'), m === 'ZIP_TOO_BIG' ? t('errBig') : m === 'ZIP_ENC' ? t('errEnc') : m);
    } finally {
      await new Promise(r => setTimeout(r, 350));
      this.busyShow(false);
      this.busy = false; document.body.classList.remove('is-busy');
      this.renderBar();
    }
  },
  busyShow(on){ const b = $('busy'); b.classList.toggle('on', on); if (on) this.busyStep(0, 1, ''); },
  busyStep(i, n, path){
    const p = Math.floor(i / Math.max(1, n) * 100);
    $('busyFill').style.width = p + '%'; $('busyPct').textContent = p;
    $('busyStep').textContent = `${t('busy')} ${t('busyRead', {i, n})}`;
    $('busySub').textContent = path;
  },

  openMail(){
    const ua = navigator.userAgentData;
    const browser = ua && ua.brands ? ua.brands.filter(x => !/Not/.test(x.brand)).map(x => `${x.brand} ${x.version}`).join(', ') + ` / ${ua.platform}` : navigator.userAgent;
    const info = ['', '', '----', `Saber Sound Converter ${APP_VER}`, `Browser: ${browser}`, `Language: ${lang}`];
    location.href = `mailto:${SHOP.mail.join('@')}?subject=${encodeURIComponent(t('mailSubject'))}&body=${encodeURIComponent(t('mailBody') + info.join('\n'))}`;
  }
};
