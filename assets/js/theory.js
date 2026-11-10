/*!
 * theory.js — 乐理计算核心库
 * 全局对象：window.MT
 *
 * 音符对象（Note）：{ letter: 'C'..'B', acc: -2..2, octave: 4, midi: 60 }
 *   - 字符串写法：'C4'、'C#4'、'Db4'、'Bb3'、'F##5'、'Ebb4'、'Fn4'(强调还原)，八度省略时默认为 4
 *   - MIDI 编号：中央 C(C4) = 60，A4 = 69 = 440Hz
 * 音程写法：'P1' 'm2' 'M2' 'm3' 'M3' 'P4' 'A4' 'd5' 'P5' 'm6' 'M6' 'm7' 'M7' 'P8' 'M9' ……
 *   P=纯 M=大 m=小 A=增 d=减
 */
(function (global) {
  'use strict';

  var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var SOLFEGE = { C: 'do', D: 're', E: 'mi', F: 'fa', G: 'sol', A: 'la', B: 'si' };
  var NUMBER = { C: '1', D: '2', E: '3', F: '4', G: '5', A: '6', B: '7' };
  var ACC_UNICODE = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' };
  var ACC_ASCII = { '-2': 'bb', '-1': 'b', '0': '', '1': '#', '2': '##' };
  var SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  // 和弦根音的常用拼法（流行/爵士惯例）
  var ROOT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var ROOT_NAMES_MINOR = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

  function mod(n, m) { return ((n % m) + m) % m; }

  /* ---------------- 音符 ---------------- */
  var NOTE_RE = /^([A-Ga-g])(##|#|x|bb|b|♯♯|♯|♭♭|♭|𝄪|𝄫|n|♮)?(-?\d+)?$/u;

  function parseNote(input, defaultOctave) {
    if (input == null) return null;
    if (typeof input === 'number') return fromMidi(input);
    if (typeof input === 'object' && input.letter) return input;
    var s = String(input).trim();
    var m = NOTE_RE.exec(s);
    if (!m) return null;
    var letter = m[1].toUpperCase();
    var acc = 0, natural = false;
    switch (m[2]) {
      case '#': case '♯': acc = 1; break;
      case '##': case 'x': case '♯♯': case '𝄪': acc = 2; break;
      case 'b': case '♭': acc = -1; break;
      case 'bb': case '♭♭': case '𝄫': acc = -2; break;
      case 'n': case '♮': natural = true; break;
    }
    var octave = m[3] !== undefined ? parseInt(m[3], 10) : (defaultOctave != null ? defaultOctave : 4);
    var note = { letter: letter, acc: acc, octave: octave, midi: (octave + 1) * 12 + LETTER_PC[letter] + acc };
    if (natural) note.natural = true;
    return note;
  }

  function fromMidi(midi, preferFlat) {
    midi = Math.round(midi);
    var pc = mod(midi, 12);
    var octave = Math.floor(midi / 12) - 1;
    var name = (preferFlat ? FLAT_NAMES : SHARP_NAMES)[pc];
    return parseNote(name + octave);
  }

  function toMidi(x) {
    if (typeof x === 'number') return x;
    var n = parseNote(x);
    return n ? n.midi : NaN;
  }

  function diatonicIndex(n) { return LETTERS.indexOf(n.letter) + n.octave * 7; }

  /** 音名（不带八度），如 'F♯' */
  function pcName(n, ascii) {
    n = parseNote(n);
    return n.letter + (ascii ? ACC_ASCII[n.acc] : ACC_UNICODE[n.acc]);
  }
  /** 完整音名，如 'F♯4' */
  function noteName(n, opts) {
    n = parseNote(n);
    opts = opts || {};
    var s = n.letter + (opts.ascii ? ACC_ASCII[n.acc] : ACC_UNICODE[n.acc]);
    if (opts.octave !== false) s += n.octave;
    return s;
  }
  /** 唱名，如 'sol'、'♯fa' */
  function solfege(n) {
    n = parseNote(n);
    return ACC_UNICODE[n.acc] + SOLFEGE[n.letter];
  }
  /** 简谱数字（固定调，C=1），如 '5'、'♯4' */
  function jianpuNumber(n) {
    n = parseNote(n);
    return ACC_UNICODE[n.acc] + NUMBER[n.letter];
  }
  /** 把 ASCII 记号转成好看的 Unicode：'F#' → 'F♯'，'Bb7' → 'B♭7' */
  function pretty(str) {
    return String(str)
      .replace(/([A-G])##/g, '$1𝄪').replace(/([A-G])#/g, '$1♯')
      .replace(/([A-G])bb/g, '$1𝄫').replace(/([A-G])b/g, '$1♭');
  }
  function sameNote(a, b) { a = parseNote(a); b = parseNote(b); return a.letter === b.letter && a.acc === b.acc && a.octave === b.octave; }
  function enharmonic(a, b) { return toMidi(a) === toMidi(b); }

  function midiToFreq(m, a4) { return (a4 || 440) * Math.pow(2, (m - 69) / 12); }
  function freqToMidi(f, a4) { return 69 + 12 * Math.log2(f / (a4 || 440)); }
  function noteToFreq(n, a4) { return midiToFreq(toMidi(n), a4); }

  /* ---------------- 音程 ---------------- */
  var INTERVAL_BASE = [0, 0, 2, 4, 5, 7, 9, 11]; // 下标 = 单音程度数（1~7），值 = 大/纯音程的半音数
  var PERFECT = { 1: true, 4: true, 5: true };
  var QUALITY_ZH = { P: '纯', M: '大', m: '小', A: '增', d: '减', AA: '倍增', dd: '倍减' };
  var NUM_ZH = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];

  function parseInterval(str) {
    if (typeof str === 'object') return str;
    var m = /^(AA|dd|P|M|m|A|d)(\d+)$/.exec(String(str).trim());
    if (!m) throw new Error('无法识别的音程：' + str);
    var q = m[1], num = parseInt(m[2], 10);
    var simple = ((num - 1) % 7) + 1, oct = Math.floor((num - 1) / 7);
    var semis = INTERVAL_BASE[simple] + 12 * oct;
    var adj = PERFECT[simple]
      ? { P: 0, A: 1, AA: 2, d: -1, dd: -2 }[q]
      : { M: 0, m: -1, A: 1, AA: 2, d: -2, dd: -3 }[q];
    if (adj === undefined) throw new Error('音程性质与度数不匹配：' + str);
    return { quality: q, num: num, simple: simple, semis: semis + adj, name: q + num, zh: intervalZh(q, num) };
  }

  function intervalZh(q, num) {
    if (!q) return '?';
    return QUALITY_ZH[q] + (NUM_ZH[num] || num) + '度';
  }

  /** 两个音之间的音程（按音名计算，能区分增四度/减五度） */
  function interval(a, b) {
    var n1 = parseNote(a), n2 = parseNote(b);
    var d1 = diatonicIndex(n1), d2 = diatonicIndex(n2);
    var desc = false;
    if (d2 < d1 || (d2 === d1 && n2.midi < n1.midi)) { var t = n1; n1 = n2; n2 = t; var td = d1; d1 = d2; d2 = td; desc = true; }
    var num = d2 - d1 + 1;
    var semis = n2.midi - n1.midi;
    var simple = ((num - 1) % 7) + 1, oct = Math.floor((num - 1) / 7);
    var diff = semis - (INTERVAL_BASE[simple] + 12 * oct);
    var q = PERFECT[simple]
      ? ({ '0': 'P', '1': 'A', '2': 'AA', '-1': 'd', '-2': 'dd' })[diff]
      : ({ '0': 'M', '-1': 'm', '1': 'A', '2': 'AA', '-2': 'd', '-3': 'dd' })[diff];
    return { quality: q || '?', num: num, simple: simple, semis: semis, name: (q || '?') + num, zh: intervalZh(q, num), descending: desc };
  }

  /** 把音符移动一个音程（保持正确的拼写）。dir = 1 向上，-1 向下 */
  function transpose(note, iv, dir) {
    var n = parseNote(note);
    var i = parseInterval(iv);
    dir = dir === -1 ? -1 : 1;
    var li = diatonicIndex(n) + dir * (i.num - 1);
    var letter = LETTERS[mod(li, 7)];
    var octave = Math.floor(li / 7);
    var midi = n.midi + dir * i.semis;
    var acc = midi - ((octave + 1) * 12 + LETTER_PC[letter]);
    return { letter: letter, acc: acc, octave: octave, midi: midi };
  }

  /** 按半音数移动（自动选择拼写） */
  function transposeSemis(note, semis, preferFlat) { return fromMidi(toMidi(note) + semis, preferFlat); }

  /** 0~12 半音的常见音程表（练耳、速查用） */
  var INTERVALS = [
    { semis: 0, name: 'P1', zh: '纯一度', aka: '同度', feel: '完全相同的两个音' },
    { semis: 1, name: 'm2', zh: '小二度', feel: '非常紧张、刺耳（《大白鲨》主题）' },
    { semis: 2, name: 'M2', zh: '大二度', feel: '平稳的一步（do→re）' },
    { semis: 3, name: 'm3', zh: '小三度', feel: '柔和、略带忧伤' },
    { semis: 4, name: 'M3', zh: '大三度', feel: '明亮、温暖' },
    { semis: 5, name: 'P4', zh: '纯四度', feel: '开阔、庄重（《婚礼进行曲》开头）' },
    { semis: 6, name: 'A4', zh: '增四度', alt: '减五度', aka: '三全音', feel: '不稳定、诡异' },
    { semis: 7, name: 'P5', zh: '纯五度', feel: '空旷、稳固（《小星星》1→5）' },
    { semis: 8, name: 'm6', zh: '小六度', feel: '深情、略带伤感' },
    { semis: 9, name: 'M6', zh: '大六度', feel: '甜美、舒展' },
    { semis: 10, name: 'm7', zh: '小七度', feel: '有张力、想继续' },
    { semis: 11, name: 'M7', zh: '大七度', feel: '尖锐、强烈想往上走' },
    { semis: 12, name: 'P8', zh: '纯八度', feel: '同一个音的高低版本' }
  ];

  /* ---------------- 音阶 ---------------- */
  var SCALES = {
    major: { zh: '自然大调', en: 'Major', intervals: ['P1', 'M2', 'M3', 'P4', 'P5', 'M6', 'M7'], feel: '明亮、稳定、开朗' },
    naturalMinor: { zh: '自然小调', en: 'Natural Minor', intervals: ['P1', 'M2', 'm3', 'P4', 'P5', 'm6', 'm7'], feel: '柔和、忧伤' },
    harmonicMinor: { zh: '和声小调', en: 'Harmonic Minor', intervals: ['P1', 'M2', 'm3', 'P4', 'P5', 'm6', 'M7'], feel: '带异域色彩，第 6→7 级有增二度' },
    melodicMinor: { zh: '旋律小调（上行）', en: 'Melodic Minor', intervals: ['P1', 'M2', 'm3', 'P4', 'P5', 'M6', 'M7'], feel: '上行流畅，下行通常还原为自然小调' },
    majorPentatonic: { zh: '大调五声音阶（宫调式）', en: 'Major Pentatonic', intervals: ['P1', 'M2', 'M3', 'P5', 'M6'], feel: '中国风、民歌感，没有半音' },
    minorPentatonic: { zh: '小调五声音阶（羽调式）', en: 'Minor Pentatonic', intervals: ['P1', 'm3', 'P4', 'P5', 'm7'], feel: '摇滚/布鲁斯独奏常用' },
    blues: { zh: '布鲁斯音阶', en: 'Blues', intervals: ['P1', 'm3', 'P4', 'd5', 'P5', 'm7'], feel: '蓝调味道，加入了"蓝调音"♭5' },
    dorian: { zh: '多利亚调式', en: 'Dorian', intervals: ['P1', 'M2', 'm3', 'P4', 'P5', 'M6', 'm7'], feel: '小调但带一点明亮（第 6 级是大六度）' },
    phrygian: { zh: '弗里几亚调式', en: 'Phrygian', intervals: ['P1', 'm2', 'm3', 'P4', 'P5', 'm6', 'm7'], feel: '西班牙/弗拉门戈风味' },
    lydian: { zh: '利底亚调式', en: 'Lydian', intervals: ['P1', 'M2', 'M3', 'A4', 'P5', 'M6', 'M7'], feel: '梦幻、飘浮（升高的第 4 级）' },
    mixolydian: { zh: '混合利底亚调式', en: 'Mixolydian', intervals: ['P1', 'M2', 'M3', 'P4', 'P5', 'M6', 'm7'], feel: '大调但更"布鲁斯/摇滚"' },
    locrian: { zh: '洛克里亚调式', en: 'Locrian', intervals: ['P1', 'm2', 'm3', 'P4', 'd5', 'm6', 'm7'], feel: '极不稳定，很少单独使用' },
    chromatic: { zh: '半音阶', en: 'Chromatic', intervals: ['P1', 'A1', 'M2', 'A2', 'M3', 'P4', 'A4', 'P5', 'A5', 'M6', 'A6', 'M7'], feel: '包含全部 12 个半音' }
  };

  /**
   * 构建音阶。root 可以是 'D4'、'Bb3'、'G'（默认第 4 八度）
   * opts: { octaves: 1, top: true(包含最高的主音), descending: false }
   */
  function scale(root, type, opts) {
    opts = opts || {};
    var def = SCALES[type || 'major'];
    if (!def) throw new Error('未知音阶类型：' + type);
    var r = parseNote(root);
    var octaves = opts.octaves || 1;
    var out = [];
    for (var o = 0; o < octaves; o++) {
      var base = o === 0 ? r : transpose(r, 'P' + (o * 7 + 1));
      def.intervals.forEach(function (iv) { out.push(transpose(base, iv)); });
    }
    if (opts.top !== false) out.push(transpose(r, 'P' + (octaves * 7 + 1)));
    if (opts.descending) out.reverse();
    return out;
  }

  /** 音阶的全音/半音结构，如 ['全','全','半',…] */
  function scaleSteps(type) {
    var def = SCALES[type];
    var semis = def.intervals.map(function (iv) { return parseInterval(iv).semis; }).concat([12]);
    var out = [];
    for (var i = 1; i < semis.length; i++) {
      var d = semis[i] - semis[i - 1];
      out.push(d === 1 ? '半' : d === 2 ? '全' : d === 3 ? '全半' : String(d));
    }
    return out;
  }

  /* ---------------- 和弦 ---------------- */
  var CHORDS = {
    maj: { zh: '大三和弦', symbol: '', intervals: ['P1', 'M3', 'P5'], formula: '1 3 5', feel: '明亮、稳定' },
    min: { zh: '小三和弦', symbol: 'm', intervals: ['P1', 'm3', 'P5'], formula: '1 ♭3 5', feel: '柔和、忧伤' },
    dim: { zh: '减三和弦', symbol: 'dim', intervals: ['P1', 'm3', 'd5'], formula: '1 ♭3 ♭5', feel: '紧张、不安' },
    aug: { zh: '增三和弦', symbol: 'aug', intervals: ['P1', 'M3', 'A5'], formula: '1 3 ♯5', feel: '悬疑、梦幻' },
    sus2: { zh: '挂二和弦', symbol: 'sus2', intervals: ['P1', 'M2', 'P5'], formula: '1 2 5', feel: '空灵、开放' },
    sus4: { zh: '挂四和弦', symbol: 'sus4', intervals: ['P1', 'P4', 'P5'], formula: '1 4 5', feel: '悬而未决，想回到大三和弦' },
    maj7: { zh: '大七和弦', symbol: 'maj7', intervals: ['P1', 'M3', 'P5', 'M7'], formula: '1 3 5 7', feel: '温柔、梦幻、有爵士感' },
    dom7: { zh: '属七和弦', symbol: '7', intervals: ['P1', 'M3', 'P5', 'm7'], formula: '1 3 5 ♭7', feel: '有张力，强烈想"回家"' },
    min7: { zh: '小七和弦', symbol: 'm7', intervals: ['P1', 'm3', 'P5', 'm7'], formula: '1 ♭3 5 ♭7', feel: '柔和、慵懒' },
    m7b5: { zh: '半减七和弦', symbol: 'm7♭5', intervals: ['P1', 'm3', 'd5', 'm7'], formula: '1 ♭3 ♭5 ♭7', feel: '暗淡、过渡感' },
    dim7: { zh: '减七和弦', symbol: 'dim7', intervals: ['P1', 'm3', 'd5', 'd7'], formula: '1 ♭3 ♭5 𝄫7', feel: '非常紧张、戏剧化' },
    mMaj7: { zh: '小大七和弦', symbol: 'm(maj7)', intervals: ['P1', 'm3', 'P5', 'M7'], formula: '1 ♭3 5 7', feel: '神秘、电影感' },
    maj6: { zh: '大六和弦', symbol: '6', intervals: ['P1', 'M3', 'P5', 'M6'], formula: '1 3 5 6', feel: '甜美、复古' },
    min6: { zh: '小六和弦', symbol: 'm6', intervals: ['P1', 'm3', 'P5', 'M6'], formula: '1 ♭3 5 6', feel: '忧郁中带一点亮色' },
    add9: { zh: '加九和弦', symbol: 'add9', intervals: ['P1', 'M3', 'P5', 'M9'], formula: '1 3 5 9', feel: '清新、流行' },
    dom9: { zh: '属九和弦', symbol: '9', intervals: ['P1', 'M3', 'P5', 'm7', 'M9'], formula: '1 3 5 ♭7 9', feel: '放克、灵魂乐' },
    maj9: { zh: '大九和弦', symbol: 'maj9', intervals: ['P1', 'M3', 'P5', 'M7', 'M9'], formula: '1 3 5 7 9', feel: '丰满、梦幻' },
    min9: { zh: '小九和弦', symbol: 'm9', intervals: ['P1', 'm3', 'P5', 'm7', 'M9'], formula: '1 ♭3 5 ♭7 9', feel: '柔和、R&B 感' },
    madd9: { zh: '小加九和弦', symbol: 'madd9', intervals: ['P1', 'm3', 'P5', 'M9'], formula: '1 ♭3 5 9', feel: '柔美、略带忧伤' },
    aug7: { zh: '增七和弦', symbol: '+7', intervals: ['P1', 'M3', 'A5', 'm7'], formula: '1 3 ♯5 ♭7', feel: '紧张、急于解决' },
    augMaj7: { zh: '增大七和弦', symbol: '+maj7', intervals: ['P1', 'M3', 'A5', 'M7'], formula: '1 3 ♯5 7', feel: '梦幻、悬浮' },
    power: { zh: '强力和弦', symbol: '5', intervals: ['P1', 'P5'], formula: '1 5', feel: '厚重，摇滚吉他常用' }
  };
  var MINORISH = { min: 1, dim: 1, min7: 1, m7b5: 1, dim7: 1, mMaj7: 1, min6: 1, min9: 1, madd9: 1 };
  // 允许"省略五音"识别的和弦（钢琴/吉他伴奏中很常见）
  var OMIT5_OK = { maj7: 1, dom7: 1, min7: 1, mMaj7: 1, dom9: 1, maj9: 1, min9: 1 };

  /**
   * 构建和弦。root：'C4' / 'Bb3' / 'F#'（默认第 4 八度）
   * opts: { inversion: 0|1|2|3 }
   */
  function chord(root, type, opts) {
    opts = opts || {};
    var def = CHORDS[type || 'maj'];
    if (!def) throw new Error('未知和弦类型：' + type);
    var r = parseNote(root);
    var notes = def.intervals.map(function (iv) { return transpose(r, iv); });
    var inv = opts.inversion || 0;
    for (var i = 0; i < inv && i < notes.length - 1; i++) {
      notes.push(transpose(notes.shift(), 'P8'));
    }
    return notes;
  }

  /** 和弦符号，如 chordSymbol('F#', 'min7') → 'F♯m7' */
  function chordSymbol(root, type, bass) {
    var s = pcName(parseNote(root)) + CHORDS[type].symbol;
    if (bass) s += '/' + pcName(parseNote(bass));
    return s;
  }

  var INVERSION_ZH = ['原位', '第一转位', '第二转位', '第三转位', '第四转位'];

  /**
   * 和弦识别：输入一组音（MIDI 数字或音名），返回按可能性排序的候选
   * 每个候选：{ symbol, zh, root, type, inversion, inversionZh, bass, notes }
   */
  function detectChord(input) {
    var midis = [];
    (input || []).forEach(function (x) { var m = toMidi(x); if (isFinite(m) && midis.indexOf(m) < 0) midis.push(m); });
    midis.sort(function (a, b) { return a - b; });
    if (midis.length < 2) return [];
    var bassPc = mod(midis[0], 12);
    var pcs = [];
    midis.forEach(function (m) { var p = mod(m, 12); if (pcs.indexOf(p) < 0) pcs.push(p); });
    if (pcs.length < 2) return [];
    var results = [];
    pcs.forEach(function (rootPc) {
      var rel = pcs.map(function (p) { return mod(p - rootPc, 12); }).sort(function (a, b) { return a - b; });
      Object.keys(CHORDS).forEach(function (type) {
        var def = CHORDS[type];
        var full = [];
        def.intervals.forEach(function (iv) { var s = mod(parseInterval(iv).semis, 12); if (full.indexOf(s) < 0) full.push(s); });
        full.sort(function (a, b) { return a - b; });
        function same(c) { if (c.length !== rel.length) return false; for (var i = 0; i < rel.length; i++) if (rel[i] !== c[i]) return false; return true; }
        var omit5 = false;
        if (!same(full)) {
          if (!OMIT5_OK[type] || full.indexOf(7) < 0) return;
          if (!same(full.filter(function (x) { return x !== 7; }))) return;
          omit5 = true;
        }
        var rootName = (MINORISH[type] ? ROOT_NAMES_MINOR : ROOT_NAMES)[rootPc];
        var tones = chord(rootName + '4', type);
        var bassIdx = -1;
        tones.forEach(function (t, i) { if (mod(t.midi, 12) === bassPc && bassIdx < 0) bassIdx = i; });
        var score = 100 - def.intervals.length * 2;
        if (bassPc === rootPc) score += 30;
        if (type === 'power' || type === 'sus2' || type === 'sus4') score -= 6;
        if (type === 'maj6' || type === 'min6') score -= 3;
        if (type === 'aug7' || type === 'augMaj7' || type === 'madd9') score -= 4;
        if (omit5) {
          score -= 10;
          var r0 = tones[0].midi;
          tones = tones.filter(function (t) { return mod(t.midi - r0, 12) !== 7; });
          bassIdx = -1;
          tones.forEach(function (t, i) { if (mod(t.midi, 12) === bassPc && bassIdx < 0) bassIdx = i; });
        }
        var bassNote = tones[bassIdx] || fromMidi(midis[0]);
        var sym = pcName(tones[0]) + def.symbol + (bassPc !== rootPc ? '/' + pcName(bassNote) : '');
        results.push({
          symbol: sym, zh: pcName(tones[0]) + ' ' + def.zh + (omit5 ? '（省略五音）' : ''), root: tones[0], type: type, def: def, omit5: omit5,
          inversion: bassIdx, inversionZh: bassIdx >= 0 && bassIdx < 4 ? INVERSION_ZH[bassIdx] : '其他排列',
          bass: bassNote, notes: tones, score: score
        });
      });
    });
    results.sort(function (a, b) { return b.score - a.score; });
    return results;
  }

  /* ---------------- 调与调号 ---------------- */
  var SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  var FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
  var MAJOR_KEYS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
  var MINOR_KEYS = { A: 0, E: 1, B: 2, 'F#': 3, 'C#': 4, 'G#': 5, 'D#': 6, 'A#': 7, D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6, Ab: -7 };
  /** 五度圈顺序（顺时针，从 C 开始），含常用等音调 */
  var CIRCLE = [
    { major: 'C', minor: 'A', count: 0 },
    { major: 'G', minor: 'E', count: 1 },
    { major: 'D', minor: 'B', count: 2 },
    { major: 'A', minor: 'F#', count: 3 },
    { major: 'E', minor: 'C#', count: 4 },
    { major: 'B', minor: 'G#', count: 5, enharmonic: { major: 'Cb', minor: 'Ab', count: -7 } },
    { major: 'F#', minor: 'D#', count: 6, enharmonic: { major: 'Gb', minor: 'Eb', count: -6 } },
    { major: 'Db', minor: 'Bb', count: -5, enharmonic: { major: 'C#', minor: 'A#', count: 7 } },
    { major: 'Ab', minor: 'F', count: -4 },
    { major: 'Eb', minor: 'C', count: -3 },
    { major: 'Bb', minor: 'G', count: -2 },
    { major: 'F', minor: 'D', count: -1 }
  ];

  /** 解析调名：'G' 'Bb' 'F#' → 大调；'Am' 'a' 'c#m' 'F# minor' → 小调 */
  function parseKey(str) {
    if (!str) return { tonic: 'C', mode: 'major' };
    if (typeof str === 'object') return str;
    var s = String(str).trim().replace('♯', '#').replace('♭', 'b');
    var m = /^([A-Ga-g])(#|b)?\s*(m|min|minor|小调|大调|major|maj)?$/.exec(s);
    if (!m) return { tonic: 'C', mode: 'major' };
    var mode = 'major';
    if (m[3] && /^(m|min|minor|小调)$/.test(m[3])) mode = 'minor';
    else if (!m[3] && m[1] === m[1].toLowerCase()) mode = 'minor';
    return { tonic: m[1].toUpperCase() + (m[2] || ''), mode: mode };
  }

  /**
   * 调号：keySignature('D') → { count: 2, type: 'sharp', letters: ['F','C'], map: {F:1, C:1}, names: ['F♯','C♯'] }
   * count > 0 为升号个数，< 0 为降号个数
   */
  function keySignature(key) {
    var k = parseKey(key);
    var table = k.mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS;
    var count = table[k.tonic];
    if (count === undefined) count = 0;
    var letters = count > 0 ? SHARP_ORDER.slice(0, count) : FLAT_ORDER.slice(0, -count);
    var map = {};
    letters.forEach(function (l) { map[l] = count > 0 ? 1 : -1; });
    return {
      count: count, type: count > 0 ? 'sharp' : count < 0 ? 'flat' : 'none', letters: letters, map: map,
      names: letters.map(function (l) { return l + (count > 0 ? '♯' : '♭'); }),
      tonic: k.tonic, mode: k.mode
    };
  }

  function keyName(key, opts) {
    var k = parseKey(key);
    var t = pretty(k.tonic);
    if (k.mode === 'minor') return (opts && opts.lower ? t.toLowerCase() : t) + ' 小调';
    return t + ' 大调';
  }
  function relativeMinor(majorTonic) { return pcName(transpose(parseNote(majorTonic + '4'), 'm3', -1), true); }
  function relativeMajor(minorTonic) { return pcName(transpose(parseNote(minorTonic + '4'), 'm3'), true); }

  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

  /** 判断三个/四个音（按三度叠置，根音在前）构成的和弦类型 */
  function chordTypeOf(notes) {
    var root = notes[0];
    var ivs = notes.map(function (n) { return mod(n.midi - root.midi, 12); });
    var keys = Object.keys(CHORDS);
    for (var i = 0; i < keys.length; i++) {
      var def = CHORDS[keys[i]];
      if (def.intervals.length !== notes.length) continue;
      var ok = def.intervals.every(function (iv, j) { return mod(parseInterval(iv).semis, 12) === ivs[j]; });
      if (ok) return keys[i];
    }
    return null;
  }

  var FUNC_MAJOR = ['T', 'S', 'T', 'S', 'D', 'T', 'D'];
  var FUNC_ZH = { T: '主功能', S: '下属功能', D: '属功能' };

  /**
   * 调内和弦：diatonicChords('C') → [{ degree:1, roman:'I', root, type, symbol, notes, func:'T' }, …]
   * opts: { sevenths: false, scale: 'major'|'naturalMinor'|'harmonicMinor', octave: 4 }
   */
  function diatonicChords(key, opts) {
    opts = opts || {};
    var k = parseKey(key);
    var scaleType = opts.scale || (k.mode === 'minor' ? 'naturalMinor' : 'major');
    var sc = scale(k.tonic + (opts.octave || 4), scaleType, { octaves: 2, top: false });
    var size = opts.sevenths ? 4 : 3;
    var out = [];
    for (var d = 0; d < 7; d++) {
      var tones = [];
      for (var j = 0; j < size; j++) tones.push(sc[d + j * 2]);
      var type = chordTypeOf(tones);
      var def = CHORDS[type] || { symbol: '?', zh: '?' };
      var numeral = ROMAN[d];
      var isMinorish = /^(min|dim|min7|m7b5|dim7|mMaj7)$/.test(type);
      var rn = isMinorish ? numeral.toLowerCase() : numeral;
      var suffix = { dim: '°', aug: '+', maj7: 'maj7', dom7: '7', min7: '7', m7b5: 'ø7', dim7: '°7', mMaj7: '(maj7)', aug7: '+7', augMaj7: '+maj7' }[type] || '';
      var func = k.mode === 'minor' ? ['T', 'S', 'T', 'S', 'D', 'S', 'D'][d] : FUNC_MAJOR[d];
      out.push({
        degree: d + 1, roman: rn + suffix, root: tones[0], type: type, def: def,
        symbol: pcName(tones[0]) + def.symbol, zh: def.zh, notes: tones, func: func, funcZh: FUNC_ZH[func]
      });
    }
    return out;
  }

  /**
   * 按调拼写一个 MIDI 音：在调内就用调内拼法，否则升号调用升号、降号调用降号
   */
  function spellInKey(midi, key) {
    var k = parseKey(key || 'C');
    var sc = scale(k.tonic + '4', k.mode === 'minor' ? 'naturalMinor' : 'major', { top: false });
    var pc = mod(midi, 12);
    for (var i = 0; i < sc.length; i++) {
      if (mod(sc[i].midi, 12) === pc) {
        var n = sc[i];
        var octave = Math.floor((midi - LETTER_PC[n.letter] - n.acc) / 12) - 1;
        return { letter: n.letter, acc: n.acc, octave: octave, midi: midi };
      }
    }
    var ks = keySignature(k);
    return fromMidi(midi, ks.count < 0);
  }

  /** 罗马数字级数 → 和弦（流行音乐常用写法：'I' 'ii' 'V7' 'vi' 'bVII' 'iv' 'V/V'(不支持)） */
  function romanToChord(roman, key, octave) {
    var k = parseKey(key);
    var m = /^(b|♭|#|♯)?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(°|o|ø|\+)?(maj7|7|m7|6|sus2|sus4|add9|9)?$/.exec(String(roman).trim());
    if (!m) return null;
    var degree = ROMAN.indexOf(m[2].toUpperCase());
    var sc = scale(k.tonic + (octave || 4), k.mode === 'minor' ? 'naturalMinor' : 'major', { top: false });
    var root = sc[degree];
    if (m[1] === 'b' || m[1] === '♭') root = transpose(root, 'A1', -1);
    if (m[1] === '#' || m[1] === '♯') root = transpose(root, 'A1');
    var lower = m[2] === m[2].toLowerCase();
    var type;
    if (m[3] === '°' || m[3] === 'o') type = m[4] === '7' ? 'dim7' : 'dim';
    else if (m[3] === 'ø') type = 'm7b5';
    else if (m[3] === '+') type = 'aug';
    else if (lower) type = m[4] === '7' || m[4] === 'm7' ? 'min7' : m[4] === '6' ? 'min6' : m[4] === '9' ? 'min9' : m[4] === 'add9' ? 'madd9' : 'min';
    else type = ({ maj7: 'maj7', '7': 'dom7', '6': 'maj6', sus2: 'sus2', sus4: 'sus4', add9: 'add9', '9': 'dom9' })[m[4]] || 'maj';
    return { roman: roman, root: root, type: type, symbol: pcName(root) + CHORDS[type].symbol, notes: chord(root, type), zh: CHORDS[type].zh };
  }

  /* ---------------- 速度术语 ---------------- */
  var TEMPO_TERMS = [
    { it: 'Grave', zh: '庄板', min: 0, max: 40, desc: '极慢、庄严' },
    { it: 'Largo', zh: '广板', min: 40, max: 60, desc: '宽广、缓慢' },
    { it: 'Larghetto', zh: '小广板', min: 60, max: 66, desc: '比广板稍快' },
    { it: 'Adagio', zh: '柔板', min: 66, max: 76, desc: '舒缓、从容' },
    { it: 'Andante', zh: '行板', min: 76, max: 108, desc: '像散步一样' },
    { it: 'Moderato', zh: '中板', min: 108, max: 120, desc: '不快不慢' },
    { it: 'Allegro', zh: '快板', min: 120, max: 168, desc: '快速、活泼' },
    { it: 'Presto', zh: '急板', min: 168, max: 200, desc: '非常快' },
    { it: 'Prestissimo', zh: '最急板', min: 200, max: 1000, desc: '极快' }
  ];
  function tempoTerm(bpm) {
    for (var i = 0; i < TEMPO_TERMS.length; i++) if (bpm >= TEMPO_TERMS[i].min && bpm < TEMPO_TERMS[i].max) return TEMPO_TERMS[i];
    return TEMPO_TERMS[TEMPO_TERMS.length - 1];
  }

  /* ---------------- 其他工具 ---------------- */
  function isBlack(midi) { return [1, 3, 6, 8, 10].indexOf(mod(midi, 12)) >= 0; }
  function range(start, end) {
    var a = toMidi(start), b = toMidi(end), out = [];
    for (var m = a; m <= b; m++) out.push(m);
    return out;
  }
  /** 把以空格/逗号分隔的音名字符串解析为音符数组 */
  function parseNotes(str) {
    if (Array.isArray(str)) return str.map(function (x) { return parseNote(x); }).filter(Boolean);
    return String(str || '').split(/[\s,]+/).filter(Boolean).map(function (x) { return parseNote(x); }).filter(Boolean);
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  global.MT = {
    LETTERS: LETTERS, LETTER_PC: LETTER_PC, SOLFEGE: SOLFEGE, NUMBER: NUMBER, SHARP_NAMES: SHARP_NAMES, FLAT_NAMES: FLAT_NAMES,
    ACC_UNICODE: ACC_UNICODE, mod: mod,
    parseNote: parseNote, fromMidi: fromMidi, toMidi: toMidi, diatonicIndex: diatonicIndex, parseNotes: parseNotes,
    pcName: pcName, noteName: noteName, solfege: solfege, jianpuNumber: jianpuNumber, pretty: pretty,
    sameNote: sameNote, enharmonic: enharmonic, isBlack: isBlack, range: range,
    midiToFreq: midiToFreq, freqToMidi: freqToMidi, noteToFreq: noteToFreq,
    parseInterval: parseInterval, interval: interval, intervalZh: intervalZh, transpose: transpose, transposeSemis: transposeSemis,
    INTERVALS: INTERVALS,
    SCALES: SCALES, scale: scale, scaleSteps: scaleSteps,
    CHORDS: CHORDS, chord: chord, chordSymbol: chordSymbol, detectChord: detectChord, chordTypeOf: chordTypeOf, INVERSION_ZH: INVERSION_ZH,
    SHARP_ORDER: SHARP_ORDER, FLAT_ORDER: FLAT_ORDER, MAJOR_KEYS: MAJOR_KEYS, MINOR_KEYS: MINOR_KEYS, CIRCLE: CIRCLE,
    parseKey: parseKey, keySignature: keySignature, keyName: keyName, relativeMinor: relativeMinor, relativeMajor: relativeMajor,
    diatonicChords: diatonicChords, spellInKey: spellInKey, romanToChord: romanToChord, ROMAN: ROMAN, FUNC_ZH: FUNC_ZH,
    TEMPO_TERMS: TEMPO_TERMS, tempoTerm: tempoTerm,
    shuffle: shuffle, pick: pick
  };
})(window);
