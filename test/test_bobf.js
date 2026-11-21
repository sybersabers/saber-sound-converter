// BoBF（同じ音源の Proffie／Xeno3／CFX 版）を正解データにして、全方向の変換を音声の中身で確認する。
// 使い方：node test/test_bobf.js <BoBF フォルダの親>
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SSC = require('../src/convert.js');
const base = process.argv[2];

function walk(dir, pre = ''){
  let out = [];
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n), rel = pre ? pre + '/' + n : n;
    if (fs.statSync(p).isDirectory()) out = out.concat(walk(p, rel));
    else out.push({path: rel, abs: p});
  }
  return out;
}
/** wav の data チャンクの md5（メタデータの違いは無視） */
function dataHash(buf){
  let i = 12;
  while (i + 8 <= buf.length) {
    const id = buf.toString('latin1', i, i + 4), sz = buf.readUInt32LE(i + 4);
    if (id === 'data') return crypto.createHash('md5').update(buf.subarray(i + 8, i + 8 + sz)).digest('hex').slice(0, 10);
    i += 8 + sz + (sz & 1);
  }
  return crypto.createHash('md5').update(buf).digest('hex').slice(0, 10);
}
const read = f => fs.readFileSync(f.entry.abs);

(async () => {
  const entries = walk(base);
  const {fonts, ignored} = SSC.groupFonts(entries);
  console.log('fonts:', fonts.map(f => `${f.name}(${f.files.length})`).join(' '), ' ignored:', ignored.length);
  const byFmt = {};
  for (const f of fonts) {
    if (SSC.isExtras(f) || SSC.isTracksOnly(f)) { console.log(`  skip ${f.name}（素材フォルダ）`); continue; }
    const d = SSC.detect(f);
    console.log(`  detect ${f.name.padEnd(10)} → ${d.format}${d.sure ? '' : ' (?)'}  ${JSON.stringify(d.scores)}`);
    byFmt[d.format] = f;
  }
  // 正解：その形式の版の「ファイル名 → 音声ハッシュ」
  const truth = {};
  for (const t of SSC.TARGETS) {
    truth[t] = new Map();
    for (const x of byFmt[t].files) if (SSC.isWav(x.rel)) truth[t].set(x.rel.toLowerCase(), dataHash(read(x)));
  }
  let fail = 0;
  for (const src of ['proffie', 'xeno3', 'cfx', 'verso', 'asteria']) for (const tgt of SSC.TARGETS) {
    if (src === tgt) continue;
    const font = byFmt[src];
    let pl = SSC.plan(font, src, tgt);
    const ex = await SSC.findMixedDupes(pl, read);
    if (ex.size) pl = SSC.plan(font, src, tgt, {exclude: ex});
    SSC.uniquePaths(pl.items);
    const exp = truth[tgt];
    let ok = 0, wrong = [], extra = [];
    const got = new Set();
    for (const it of pl.items) {
      if (!SSC.isWav(it.out)) continue;
      const k = it.out.toLowerCase(); got.add(k);
      const h = dataHash(read(it.src));
      if (tgt === 'proffie') {
        // Proffie 版は番号の付け方が違う（ゼロ埋めなし・置き方もバラバラ）ので、種類ごとの音の並びで比べる
        continue;
      }
      if (!exp.has(k)) extra.push(it.out);
      else if (exp.get(k) !== h) wrong.push(it.out);
      else ok++;
    }
    let missing = [];
    if (tgt === 'proffie') {
      // 種類ごとに、番号順の音声ハッシュ列が一致するか
      const P0 = SSC.plan(byFmt.proffie, 'proffie', 'proffie');
      const P = SSC.plan(byFmt.proffie, 'proffie', 'proffie', {exclude: await SSC.findMixedDupes(P0, read)}).parsed;
      const want = new Map([...P.types].map(([t, l]) => [t, l.map(x => dataHash(read(x.f))).join(',')]));
      const have = new Map();
      for (const it of pl.items) if (SSC.isWav(it.out)) { if (!have.has(it.type)) have.set(it.type, []); have.get(it.type).push(dataHash(read(it.src))); }
      for (const [t, l] of have) { if (!want.has(t)) extra.push(t); else if (want.get(t) === l.join(',')) ok++; else if (want.get(t).startsWith(l.join(','))) { ok++; extra.push(t + '(先頭' + l.length + '件のみ)'); } else wrong.push(t); }
      for (const t of want.keys()) if (!have.has(t)) missing.push(t);
    } else {
      for (const k of exp.keys()) if (!got.has(k)) missing.push(k);
    }
    const bad = wrong.length > 0;
    if (bad) fail++;
    console.log(`\n${bad ? '✗' : '✓'} ${src} → ${tgt}: 一致 ${ok}${wrong.length ? '  ★不一致 ' + wrong.join(' ') : ''}`);
    if (extra.length) console.log(`   正解に無い出力: ${extra.join(' ')}`);
    if (missing.length) console.log(`   出力に無い正解: ${missing.join(' ')}`);
    if (pl.unmapped.length) console.log(`   _unmapped: ${pl.unmapped.map(u => u.src.rel).join(' ')}`);
    if (pl.extra.length) console.log(`   追加: ${pl.extra.map(e => e.out).join(' ')}`);
    console.log(`   警告: ${pl.warnings.map(w => w.key + (Object.keys(w.args).length ? JSON.stringify(w.args) : '')).join(' ')}`);
  }
  // Proffie 出力の見た目サンプル
  const pl = SSC.plan(byFmt.xeno3, 'xeno3', 'proffie');
  console.log('\nXeno3→Proffie 出力例:', pl.items.slice(0, 8).map(i => `${i.src.rel} → ${i.out}`).join(' | '));
  process.exit(fail ? 1 : 0);
})();
