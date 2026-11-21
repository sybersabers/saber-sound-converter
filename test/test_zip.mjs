// ZIP 読み込み（BoBF.zip）→ 書き出し → unzip -t で検証。Shift_JIS 名の ZIP も読む
import fs from 'fs'; import {createRequire} from 'module';
const require = createRequire(import.meta.url);
const {Zip, Wav} = require('../src/zip.js');
const [,, zpath, out, sjis] = process.argv;
const t0 = Date.now();
const list = await Zip.open(await fs.openAsBlob(zpath));
console.log('entries', list.length, 'deflated', list.filter(e => e.method === 8).length, (Date.now() - t0) + 'ms');
const e = list.find(x => x.path.endsWith('Xeno3/hum (1).wav'));
const data = await e.read(), ref = fs.readFileSync('/home/claude/sample/bobf/' + e.path);
console.log('hum read ok:', Buffer.compare(Buffer.from(data), ref) === 0, data.length);
const h = await e.head(4096); console.log('head', h.length, Wav.fmt(Wav.info(h)));
const w = Zip.writer();
for (const x of list.slice(0, 40)) w.add('out/' + x.path, await x.read());
w.add('日本語フォルダ/テスト.txt', new TextEncoder().encode('こんにちは'));
fs.writeFileSync(out, Buffer.from(await w.finish().arrayBuffer()));
if (sjis) { const l2 = await Zip.open(await fs.openAsBlob(sjis)); console.log('sjis names:', l2.map(x => x.path).join(' | '), (await l2[0].read()).length); }
