/* =====================================================================
 * 共通部品（Proffie Web Config と同じ考え方）
 * ===================================================================== */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const pad = n => String(n).padStart(2, '0');
function stamp(d = new Date()){ return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; }
function fmtDate(d = new Date()){ return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
const fmtSize = b => b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
const store = {
  get(k, d){ try { const v = localStorage.getItem('ssc.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v){ try { localStorage.setItem('ssc.' + k, JSON.stringify(v)); } catch {} }
};
function showDialog(title, body){ $('dlgTitle').textContent = title; $('dlgBody').textContent = body; $('dlg').showModal(); }
function toast(msg){
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}
function download(name, blob){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

/** ツールの版（ログとお問い合わせメールに入れる） */
const APP_VER = '0.1.1 (2026-11-22)';
/** お店の情報 */
const SHOP = {name: 'SYBER SABERS', url: 'https://sybersabers.com/', mail: ['info', 'sybersabers.com'], utm: 'utm_source=soundconverter&utm_medium=referral&utm_campaign=saber_sound_converter'};
const shopUrl = (path = '') => SHOP.url + path + (path.includes('?') ? '&' : '?') + SHOP.utm;
/** シェア先の URL：公開先が決まるまでは開いているページの URL を使う */
const SITE_URL = /^https?:/.test(location.protocol) ? location.origin + location.pathname : SHOP.url, SHARE_TAG = 'SaberSoundConverter';
const SHARE_ICON = {
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.6l5.24 6.93zm-1.29 19.5h2.04L6.49 3.24H4.3z"/></svg>',
  fb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>',
  line: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C6.2 2 1.5 5.8 1.5 10.5c0 4.2 3.7 7.7 8.8 8.4.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5s6-3.5 8.2-6c1.5-1.7 2.3-3.4 2.3-5.3C22.5 5.8 17.8 2 12 2zM8 13.3H5.9c-.3 0-.5-.2-.5-.5V8.6c0-.3.2-.5.5-.5s.5.2.5.5v3.7H8c.3 0 .5.2.5.5s-.2.5-.5.5zm2.2-.5c0 .3-.2.5-.5.5s-.5-.2-.5-.5V8.6c0-.3.2-.5.5-.5s.5.2.5.5v4.2zm5 0c0 .2-.1.4-.3.5h-.2c-.2 0-.3-.1-.4-.2l-2.1-2.9v2.6c0 .3-.2.5-.5.5s-.5-.2-.5-.5V8.6c0-.2.1-.4.3-.5h.2c.2 0 .3.1.4.2l2.1 2.9V8.6c0-.3.2-.5.5-.5s.5.2.5.5v4.2zm3.4-2.6c.3 0 .5.2.5.5s-.2.5-.5.5h-1.6v1.1h1.6c.3 0 .5.2.5.5s-.2.5-.5.5h-2.1c-.3 0-.5-.2-.5-.5V8.6c0-.3.2-.5.5-.5h2.1c.3 0 .5.2.5.5s-.2.5-.5.5h-1.6v1.1h1.6z"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/></svg>'
};
function shareHtml(text){
  const u = encodeURIComponent(SITE_URL), tx = encodeURIComponent(text);
  const a = (k, href, label) => `<a class="shr shr-${k}" href="${href}" target="_blank" rel="noopener" title="${label}" aria-label="${label}">${SHARE_ICON[k]}</a>`;
  return `<span class="share">${a('x', `https://twitter.com/intent/tweet?text=${tx}&url=${u}&hashtags=${SHARE_TAG}`, 'X')}${a('fb', `https://www.facebook.com/sharer/sharer.php?u=${u}`, 'Facebook')}${a('line', `https://social-plugins.line.me/lineit/share?url=${u}&text=${tx}`, 'LINE')}<button class="shr shr-link" data-copy="${esc(text + ' #' + SHARE_TAG + ' ' + SITE_URL)}" title="${t('shareCopy')}" aria-label="${t('shareCopy')}">${SHARE_ICON.link}</button></span>`;
}

/* ---------- 入力：フォルダ・ZIP・ドラッグ＆ドロップを同じ形 {path, size, read(), head(n)} にそろえる ---------- */
const Input = {
  /** File（フォルダ選択なら webkitRelativePath つき）→ 入力 1 件 */
  fromFile(file, path){
    return {path: path || file.webkitRelativePath || file.name, size: file.size,
      read: async () => new Uint8Array(await file.arrayBuffer()),
      head: async n => new Uint8Array(await file.slice(0, n).arrayBuffer())};
  },
  /** ZIP の中身。ZIP の直下に音源が直接入っていたら、ZIP の名前をフォルダ名にする */
  async fromZip(file, prefix = ''){
    if (typeof DecompressionStream === 'undefined') throw new Error('NO_DS');
    const list = await Zip.open(file);
    if (list.some(e => e.encrypted)) throw new Error('ZIP_ENC');
    const flat = list.some(e => !e.path.includes('/') && SSC.isWav(e.path));
    const base = file.name.replace(/\.zip$/i, '');
    return list.map(e => Object.assign(e, {path: prefix + (flat ? base + '/' : '') + e.path}));
  },
  /** ドラッグ＆ドロップ（フォルダごと落とされたら中をたどる） */
  async fromDrop(dt){
    const out = [], jobs = [];
    const items = [...(dt.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (!items.length) { for (const f of dt.files || []) jobs.push(this.addFile(out, f, f.name)); await Promise.all(jobs); return out; }
    const walk = async (ent, pre) => {
      if (ent.isFile) { const f = await new Promise((res, rej) => ent.file(res, rej)); await this.addFile(out, f, pre + f.name); return; }
      const rd = ent.createReader();
      for (;;) {
        const batch = await new Promise((res, rej) => rd.readEntries(res, rej));
        if (!batch.length) break;
        for (const c of batch) await walk(c, pre + ent.name + '/');
      }
    };
    for (const ent of items) await walk(ent, '');
    return out;
  },
  async addFile(out, f, path){
    if (/\.zip$/i.test(f.name)) out.push(...await this.fromZip(f, path.slice(0, path.length - f.name.length)));
    else out.push(this.fromFile(f, path));
  }
};
