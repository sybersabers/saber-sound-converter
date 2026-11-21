/* =====================================================================
 * ZIP の読み書き（外部ライブラリなし）
 *  読み込み：無圧縮（store）と Deflate。展開はブラウザ標準の DecompressionStream('deflate-raw')
 *            中身は必要になるまで読まない（数百 MB の ZIP でも固まらないように）
 *  書き出し：無圧縮（store）。WAV はほとんど縮まないので速さ優先
 * ===================================================================== */
const Zip = (() => {
  const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8, crc = 0){ crc = ~crc >>> 0; for (let i = 0; i < u8.length; i++) crc = CRC_T[(crc ^ u8[i]) & 255] ^ (crc >>> 8); return ~crc >>> 0; }

  const u8of = async blob => new Uint8Array(await blob.arrayBuffer());
  const dv = u8 => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  /** ファイル名の文字コード：UTF-8 の印があれば UTF-8、なければ UTF-8 として読めるか試して、だめなら Shift_JIS（日本の Windows） */
  function decodeName(bytes, utf8Flag){
    if (utf8Flag) return new TextDecoder('utf-8').decode(bytes);
    if (bytes.every(b => b < 0x80)) return String.fromCharCode(...bytes);
    try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch {}
    try { return new TextDecoder('shift_jis').decode(bytes); } catch {}
    return new TextDecoder('latin1').decode(bytes);
  }

  /** Deflate を展開。limit を渡すと先頭 limit バイトだけ読んで止める */
  async function inflate(blob, limit = Infinity){
    const rd = blob.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const parts = []; let n = 0;
    try {
      for (;;) {
        const {done, value} = await rd.read();
        if (done) break;
        parts.push(value); n += value.length;
        if (n >= limit) { rd.cancel().catch(() => {}); break; }
      }
    } catch (e) { if (n < limit && limit !== Infinity) {} else if (limit === Infinity) throw e; }
    const out = new Uint8Array(Math.min(n, limit)); let o = 0;
    for (const p of parts) { const take = Math.min(p.length, out.length - o); out.set(p.subarray(0, take), o); o += take; if (o >= out.length) break; }
    return out;
  }

  /**
   * ZIP（File/Blob）の目次を読む。戻り値：[{path, size, read(), head(n)}]
   */
  async function open(file){
    const tailLen = Math.min(file.size, 65557);
    const tail = await u8of(file.slice(file.size - tailLen));
    let e = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) { e = i; break; }
    if (e < 0) throw new Error('ZIP_BAD');
    const t = dv(tail);
    let count = t.getUint16(e + 10, true), cdSize = t.getUint32(e + 12, true), cdOff = t.getUint32(e + 16, true);
    if (cdOff === 0xFFFFFFFF || count === 0xFFFF) {           // ZIP64
      const loc = e - 20;
      if (loc >= 0 && t.getUint32(loc, true) === 0x07064b50) {
        const off = Number(t.getBigUint64(loc + 8, true));
        const r = dv(await u8of(file.slice(off, off + 56)));
        count = Number(r.getBigUint64(32, true)); cdSize = Number(r.getBigUint64(40, true)); cdOff = Number(r.getBigUint64(48, true));
      }
    }
    const cd = await u8of(file.slice(cdOff, cdOff + cdSize)), c = dv(cd);
    const list = [];
    for (let p = 0, i = 0; i < count && p + 46 <= cd.length; i++) {
      if (c.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP_BAD');
      const flag = c.getUint16(p + 8, true), method = c.getUint16(p + 10, true);
      let csize = c.getUint32(p + 20, true), usize = c.getUint32(p + 24, true);
      const nl = c.getUint16(p + 28, true), xl = c.getUint16(p + 30, true), cl = c.getUint16(p + 32, true);
      let lho = c.getUint32(p + 42, true);
      const name = decodeName(cd.subarray(p + 46, p + 46 + nl), flag & 0x800).replace(/\\/g, '/');
      // ZIP64 の大きさ・位置
      for (let x = p + 46 + nl; x < p + 46 + nl + xl - 4;) {
        const id = c.getUint16(x, true), sz = c.getUint16(x + 2, true);
        if (id === 1) { let q = x + 4;
          if (usize === 0xFFFFFFFF) { usize = Number(c.getBigUint64(q, true)); q += 8; }
          if (csize === 0xFFFFFFFF) { csize = Number(c.getBigUint64(q, true)); q += 8; }
          if (lho === 0xFFFFFFFF) { lho = Number(c.getBigUint64(q, true)); } }
        x += 4 + sz;
      }
      p += 46 + nl + xl + cl;
      if (name.endsWith('/')) continue;
      const ent = {path: name, size: usize, method, encrypted: !!(flag & 1)};
      let dataStart = null;
      const start = async () => {
        if (dataStart == null) { const h = dv(await u8of(file.slice(lho, lho + 30))); dataStart = lho + 30 + h.getUint16(26, true) + h.getUint16(28, true); }
        return dataStart;
      };
      ent.read = async () => {
        if (ent.encrypted) throw new Error('ZIP_ENC');
        const s = await start(), blob = file.slice(s, s + csize);
        if (method === 0) return u8of(blob);
        if (method === 8) return inflate(blob);
        throw new Error('ZIP_METHOD');
      };
      ent.head = async n => {
        if (ent.encrypted) return new Uint8Array(0);
        const s = await start();
        if (method === 0) return u8of(file.slice(s, s + Math.min(n, csize)));
        if (method === 8) return inflate(file.slice(s, s + csize), n);
        return new Uint8Array(0);
      };
      list.push(ent);
    }
    return list;
  }

  /** 無圧縮の ZIP を作る。add(path, Uint8Array) を順に呼んで、最後に finish() で Blob */
  function writer(){
    const parts = [], central = []; let off = 0, count = 0;
    const now = new Date();
    const dosT = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosD = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const enc = new TextEncoder();
    return {
      add(path, data){
        const name = enc.encode(path), crc = crc32(data), size = data.length;
        if (off + size > 0xFFFFFFF0) throw new Error('ZIP_TOO_BIG');
        const h = new Uint8Array(30 + name.length), d = dv(h);
        d.setUint32(0, 0x04034b50, true); d.setUint16(4, 20, true); d.setUint16(6, 0x800, true); d.setUint16(8, 0, true);
        d.setUint16(10, dosT, true); d.setUint16(12, dosD, true); d.setUint32(14, crc, true); d.setUint32(18, size, true); d.setUint32(22, size, true);
        d.setUint16(26, name.length, true); h.set(name, 30);
        const ch = new Uint8Array(46 + name.length), e = dv(ch);
        e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint16(8, 0x800, true); e.setUint16(10, 0, true);
        e.setUint16(12, dosT, true); e.setUint16(14, dosD, true); e.setUint32(16, crc, true); e.setUint32(20, size, true); e.setUint32(24, size, true);
        e.setUint16(28, name.length, true); e.setUint32(42, off, true); ch.set(name, 46);
        parts.push(new Blob([h, data])); central.push(ch);
        off += h.length + size; count++;
      },
      finish(){
        if (count > 0xFFFF) throw new Error('ZIP_TOO_BIG');
        const cdSize = central.reduce((a, b) => a + b.length, 0);
        const end = new Uint8Array(22), d = dv(end);
        d.setUint32(0, 0x06054b50, true); d.setUint16(8, count, true); d.setUint16(10, count, true); d.setUint32(12, cdSize, true); d.setUint32(16, off, true);
        return new Blob([...parts, ...central, end], {type: 'application/zip'});
      },
      get size(){ return off; }
    };
  }

  return {open, writer, crc32};
})();

/* ---------- WAV の形式チェック（先頭だけ読む） ---------- */
const Wav = {
  /** 先頭のバイト列から {rate, ch, bits, tag} を読む。読めなければ null */
  info(u8){
    if (u8.length < 12) return null;
    const d = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const s4 = i => String.fromCharCode(u8[i], u8[i + 1], u8[i + 2], u8[i + 3]);
    if (s4(0) !== 'RIFF' || s4(8) !== 'WAVE') return null;
    for (let i = 12; i + 8 <= u8.length;) {
      const id = s4(i), sz = d.getUint32(i + 4, true);
      if (id === 'fmt ' && i + 24 <= u8.length) {
        let tag = d.getUint16(i + 8, true);
        const bits = d.getUint16(i + 22, true);
        if (tag === 0xFFFE && i + 34 <= u8.length) tag = d.getUint16(i + 32, true); // WAVE_FORMAT_EXTENSIBLE
        return {tag, ch: d.getUint16(i + 10, true), rate: d.getUint32(i + 12, true), bits};
      }
      i += 8 + sz + (sz & 1);
    }
    return null;
  },
  /** ProffieOS などで推奨の 44.1kHz／16bit／モノラル PCM か */
  isStd: f => f && f.tag === 1 && f.rate === 44100 && f.bits === 16 && f.ch === 1,
  fmt: f => f ? `${f.rate / 1000}kHz/${f.bits}bit/${f.ch === 1 ? 'mono' : f.ch === 2 ? 'stereo' : f.ch + 'ch'}${f.tag === 1 ? '' : '/fmt' + f.tag}` : '?'
};
if (typeof module !== 'undefined') module.exports = {Zip, Wav};
