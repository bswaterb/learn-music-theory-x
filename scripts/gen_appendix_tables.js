// 用 theory.js 生成附录里的和弦、音阶、调号表格（保证拼写准确）
// 用法：node scripts/gen_appendix_tables.js > /tmp/tables.json
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/theory.js'), 'utf8'), ctx);
const MT = ctx.window.MT;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const ascii = n => n.letter + ({ '-2': 'bb', '-1': 'b', '0': '', '1': '#', '2': '##' })[n.acc] + n.octave;

// 和弦
const groups = [
  ['三和弦', ['maj', 'min', 'dim', 'aug']],
  ['七和弦', ['maj7', 'dom7', 'min7', 'm7b5', 'dim7', 'mMaj7']],
  ['挂留、加音与其他', ['sus2', 'sus4', 'maj6', 'min6', 'add9', 'dom9', 'maj9', 'min9', 'power']]
];
let chords = '';
groups.forEach(([g, types]) => {
  chords += `<tr class="group-row"><td colspan="6">${g}</td></tr>\n`;
  types.forEach(t => {
    const d = MT.CHORDS[t];
    const notes = MT.chord('C4', t);
    const names = notes.map(n => MT.pcName(n)).join(' ');
    const steps = [];
    for (let i = 1; i < notes.length; i++) steps.push(MT.interval(notes[i - 1], notes[i]).zh);
    chords += `<tr><td><b>${d.zh}</b></td><td class="nn">C${esc(d.symbol)}</td><td>${esc(d.formula)}</td><td class="nn">${names}</td><td class="small">${steps.join(' + ')}</td><td class="c"><button class="play-btn sm icon-only" data-play="${notes.map(ascii).join(' ')}" data-mode="arp-chord" data-gap="0.18" aria-label="播放 C${esc(d.symbol)}"></button></td></tr>\n`;
  });
});

// 音阶
let scales = '';
Object.keys(MT.SCALES).forEach(t => {
  const d = MT.SCALES[t];
  const notes = MT.scale('C4', t);
  const steps = t === 'chromatic' ? '全部半音' : MT.scaleSteps(t).join(' ');
  scales += `<tr><td><b>${d.zh}</b><div class="en">${d.en}</div></td><td>${steps}</td><td class="nn">${notes.map(n => MT.pcName(n)).join(' ')}</td><td class="small">${esc(d.feel)}</td><td class="c"><button class="play-btn sm icon-only" data-play="${notes.map(ascii).join(' ')}" data-bpm="200" aria-label="播放${d.zh}"></button></td></tr>\n`;
});

// 调号
const order = [0, 1, 2, 3, 4, 5, 6, 7, -1, -2, -3, -4, -5, -6, -7];
const majByCount = {}; Object.keys(MT.MAJOR_KEYS).forEach(k => majByCount[MT.MAJOR_KEYS[k]] = k);
const minByCount = {}; Object.keys(MT.MINOR_KEYS).forEach(k => minByCount[MT.MINOR_KEYS[k]] = k);
let keys = '';
order.forEach(c => {
  const maj = majByCount[c], min = minByCount[c];
  const ks = MT.keySignature(maj);
  const label = c === 0 ? '无升降号' : (c > 0 ? c + ' 个升号' : -c + ' 个降号');
  const sc = MT.scale(maj + '4', 'major');
  keys += `<div class="key-card"><div class="kc-head"><b>${MT.pretty(maj)} 大调</b><span>${MT.pretty(min).toLowerCase()} 小调</span></div>` +
    `<div data-staff="" data-key="${maj}" data-playable="false" data-scale="0.9" data-min-width="${Math.max(90, Math.abs(c) * 9 + 70)}"></div>` +
    `<div class="kc-foot">${label}${ks.names.length ? '：' + ks.names.join(' ') : ''}` +
    ` <button class="play-btn sm icon-only" data-play="${sc.map(ascii).join(' ')}" data-bpm="220" aria-label="播放 ${MT.pretty(maj)} 大调音阶"></button></div></div>\n`;
});

// 速度
let tempo = '';
MT.TEMPO_TERMS.forEach(t => {
  const range = t.max >= 1000 ? `${t.min} 以上` : t.min === 0 ? `${t.max} 以下` : `${t.min} ～ ${t.max}`;
  tempo += `<tr><td><b>${t.it}</b></td><td>${t.zh}</td><td>${range}</td><td>${t.desc}</td></tr>\n`;
});
process.stdout.write(JSON.stringify({ chords, scales, keys, tempo }));
