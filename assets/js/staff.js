/*!
 * staff.js — 轻量五线谱渲染器（SVG，无外部依赖）+ 播放
 * 全局对象：window.Staff
 *
 * 用法：Staff.render(el, {
 *   notes: 'C4:q D4 E4 F4 | G4:h G4 |]',   // 单行谱表
 *   clef: 'treble' | 'bass' | 'alto' | 'rhythm'(单线节奏谱) | 'none',
 *   // 大谱表：treble: '…', bass: '…'
 *   key: 'G' | 'Bb' | 'Am',  time: '4/4' | '3/4' | '6/8' | 'C',
 *   names: false | 'name' | 'solfege' | 'number',   // 在音符下方自动标注
 *   spacing: 'proportional' | 'even',  scale: 1.15,  bpm: 90,
 *   playable: true, click: false(播放时带节拍器), countIn: 0(预备小节数),
 *   instrument: null, staffLabels: false(标出"第一线…第四间"), minWidth: 0
 * })
 *
 * 记谱语法（空格分隔）：
 *   音符     C4  F#4  Bb3  Ebb5  Fn4(强制显示还原号)
 *   时值     :w 全  :h 二分  :q 四分  :8 八分  :16 十六分  可加附点 :q. :h.  三连音 :8t
 *            省略时值时沿用上一个音符的时值（初始为四分）
 *   和弦     [C4 E4 G4]:h      单音高亮 [C4 E4* G4]
 *   休止     R:q  R:h …        无音高节奏音符 X:8（用于节奏谱）
 *   小节线   |  ||  |]  |:  :|  :|:
 *   修饰（写在时值之后，文字类放最后）：
 *     ~ 延音线(连到下一个同音)  ( ) 圆滑线起止  * 高亮(橙) *2 紫 *3 绿
 *     @s 跳音  @a 重音  @t 保持音  @f 延长记号
 *     !p !mf !ff … 力度   !< 渐强开始  !> 渐弱开始  !. 结束渐强/渐弱
 *     ^文字 上方文字（如和弦名 ^Am7）   _文字 下方文字（如歌词、唱名）
 *   独立记号："rit."（上方文字）  _"文字"（下方文字）  {1} {2} 第一/二房子  $segno  $coda
 */
(function (global) {
  'use strict';

  var CLEF = {
    treble: { bottom: 30, keyShift: 0, width: 32 },
    bass: { bottom: 18, keyShift: -2, width: 32 },
    alto: { bottom: 24, keyShift: -1, width: 28 },
    rhythm: { bottom: 30, keyShift: 0, width: 20, single: true },
    none: { bottom: 30, keyShift: 0, width: 4 }
  };
  var SHARP_STEPS = [8, 5, 9, 6, 3, 7, 4];
  var FLAT_STEPS = [4, 7, 3, 6, 2, 5, 1];
  var DUR = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25, '32': 0.125 };
  var BASE = { w: 'w', '1': 'w', h: 'h', '2': 'h', q: 'q', '4': 'q', '8': '8', '16': '16', '32': '32' };
  var FLAGS = { w: 0, h: 0, q: 0, '8': 1, '16': 2, '32': 3 };
  var DYN_VEL = { ppp: 0.2, pp: 0.3, p: 0.42, mp: 0.56, mf: 0.68, f: 0.84, ff: 0.96, fff: 1, sfz: 1, sf: 1, fp: 0.84 };
  var BAR_W = { '|': 10, '||': 12, '|]': 13, '|:': 18, ':|': 18, ':|:': 26 };
  // 打击乐音色（spec.instrument）：用于节奏谱播放
  var PERC = { clap: 1, wood: 1, drum: 1, click: 1 };
  function percHit(kind, time, vel) {
    var S = global.Sound;
    if (kind === 'wood') S.click(time, { sound: 'wood', accent: 1, level: vel == null ? 0.9 : vel + 0.2 });
    else if (kind === 'click') S.click(time, { sound: 'tick', accent: 2, level: vel == null ? 0.9 : vel + 0.2 });
    else S.drum(kind === 'drum' ? 'snare' : 'clap', time, vel == null ? 0.85 : vel + 0.15);
  }
  var HEAD_DX = 11.6;

  function f(n) { return Math.round(n * 100) / 100; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function clone(o) { var c = {}; for (var k in o) c[k] = o[k]; return c; }
  function line(x1, y1, x2, y2, w, extra) {
    return '<line x1="' + f(x1) + '" y1="' + f(y1) + '" x2="' + f(x2) + '" y2="' + f(y2) + '" stroke="currentColor" stroke-width="' + (w || 1) + '"' + (extra || '') + '/>';
  }
  function rect(x, y, w, h) { return '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" fill="currentColor"/>'; }
  function circle(x, y, r) { return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + r + '" fill="currentColor"/>'; }
  function path(d, fill, sw) {
    return fill === false
      ? '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.2) + '" stroke-linecap="round" stroke-linejoin="round"/>'
      : '<path d="' + d + '" fill="currentColor"/>';
  }
  function text(x, y, s, cls, anchor, extra) {
    return '<text x="' + f(x) + '" y="' + f(y) + '" class="' + cls + '" text-anchor="' + (anchor || 'middle') + '" fill="currentColor"' + (extra || '') + '>' + esc(s) + '</text>';
  }

  /** Catmull-Rom 样条 → 三次贝塞尔路径（用于画谱号） */
  function smooth(pts) {
    var d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += 'C' + f(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        f(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + p2[0] + ' ' + p2[1];
    }
    return d;
  }

  var TREBLE_PATH = smooth([
    [13.4, 31.2], [10.4, 28.6], [11.4, 24], [16.2, 22.3], [20.9, 26.2], [21.3, 33.2], [16.6, 39.2], [9.6, 40.3],
    [3.9, 35.8], [2.7, 28], [6.1, 19.6], [12.1, 12.2], [16, 4.2], [17.1, -4.4], [15.1, -10.8], [12.1, -12.6],
    [10, -8.2], [10.3, 0], [11.5, 12], [12.5, 28], [13, 42], [12.4, 49.4], [9.7, 53.2], [6.4, 51.9]
  ]);
  var BASS_PATH = smooth([[4.3, 10.2], [5.4, 4.2], [10.6, 0.7], [16.9, 2.4], [20.1, 9.2], [18.7, 18.2], [12.6, 26.2], [3.4, 33.2]]);

  function trebleClef(x) {
    return '<g transform="translate(' + f(x) + ',0)">' + path(TREBLE_PATH, false, 2.3) + circle(7.1, 49.4, 3.1) + '</g>';
  }
  function bassClef(x) {
    return '<g transform="translate(' + f(x) + ',0)">' + path(BASS_PATH, false, 2.7) + circle(4.6, 10, 3.5) + circle(25, 5, 1.9) + circle(25, 15, 1.9) + '</g>';
  }
  function altoClef(x) {
    var s = rect(x + 1, 0, 3.6, 40) + rect(x + 7, 0, 1.4, 40);
    s += path('M' + f(x + 8.5) + ' 20 C' + f(x + 12) + ' 17 ' + f(x + 13) + ' 14 ' + f(x + 13) + ' 11 M' + f(x + 8.5) + ' 20 C' + f(x + 12) + ' 23 ' + f(x + 13) + ' 26 ' + f(x + 13) + ' 29', false, 1.6);
    s += path('M' + f(x + 10) + ' 4 C' + f(x + 22) + ' -2 ' + f(x + 24) + ' 16 ' + f(x + 13) + ' 12 M' + f(x + 10) + ' 36 C' + f(x + 22) + ' 42 ' + f(x + 24) + ' 24 ' + f(x + 13) + ' 28', false, 2.2);
    return s;
  }
  function rhythmClef(x) { return rect(x + 3, 12, 3.4, 16) + rect(x + 9.5, 12, 3.4, 16); }

  /* ---------- 符头、变音记号、休止符、符尾 ---------- */
  function ell(cx, cy, rx, ry, rot) {
    var r = rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    var x1 = cx + rx * c, y1 = cy + rx * s, x2 = cx - rx * c, y2 = cy - rx * s;
    return 'M' + f(x1) + ' ' + f(y1) + 'A' + rx + ' ' + ry + ' ' + rot + ' 1 0 ' + f(x2) + ' ' + f(y2) +
      'A' + rx + ' ' + ry + ' ' + rot + ' 1 0 ' + f(x1) + ' ' + f(y1) + 'Z';
  }
  function notehead(x, y, base) {
    if (base === 'w') return '<path d="' + ell(x, y, 7.3, 4.8, 0) + ell(x, y, 4.1, 2.6, -55) + '" fill="currentColor" fill-rule="evenodd"/>';
    if (base === 'h') return '<path d="' + ell(x, y, 6.1, 4.4, -22) + ell(x, y, 4.7, 2.0, -30) + '" fill="currentColor" fill-rule="evenodd"/>';
    return '<path d="' + ell(x, y, 6.0, 4.3, -22) + '" fill="currentColor"/>';
  }

  var ACC_W = { '1': 9, '-1': 8, '0': 7, '2': 9, '-2': 14 };
  function accidental(acc, x, y) {
    // x 为记号中心
    switch (acc) {
      case 1:
        return line(x - 2.2, y - 9.5, x - 2.2, y + 11.5, 1.25) + line(x + 2.2, y - 11.5, x + 2.2, y + 9.5, 1.25) +
          path('M' + f(x - 4.8) + ' ' + f(y - 1.5) + 'L' + f(x + 4.8) + ' ' + f(y - 4.9) + 'L' + f(x + 4.8) + ' ' + f(y - 2.3) + 'L' + f(x - 4.8) + ' ' + f(y + 1.1) + 'Z') +
          path('M' + f(x - 4.8) + ' ' + f(y + 4.7) + 'L' + f(x + 4.8) + ' ' + f(y + 1.3) + 'L' + f(x + 4.8) + ' ' + f(y + 3.9) + 'L' + f(x - 4.8) + ' ' + f(y + 7.3) + 'Z');
      case -1:
        return line(x - 3, y - 13, x - 3, y + 4.8, 1.25) +
          path('M' + f(x - 3) + ' ' + f(y - 0.8) + 'C' + f(x - 0.4) + ' ' + f(y - 5.4) + ' ' + f(x + 5) + ' ' + f(y - 4.6) + ' ' + f(x + 4.2) + ' ' + f(y - 1.6) +
            'C' + f(x + 3.6) + ' ' + f(y + 1) + ' ' + f(x - 0.8) + ' ' + f(y + 3.4) + ' ' + f(x - 3) + ' ' + f(y + 4.8), false, 1.7);
      case 0:
        return line(x - 2.4, y - 11.5, x - 2.4, y + 5.2, 1.25) + line(x + 2.4, y - 5.2, x + 2.4, y + 11.5, 1.25) +
          path('M' + f(x - 2.4) + ' ' + f(y - 1.6) + 'L' + f(x + 2.4) + ' ' + f(y - 3.8) + 'L' + f(x + 2.4) + ' ' + f(y - 1.2) + 'L' + f(x - 2.4) + ' ' + f(y + 1) + 'Z') +
          path('M' + f(x - 2.4) + ' ' + f(y + 3.6) + 'L' + f(x + 2.4) + ' ' + f(y + 1.4) + 'L' + f(x + 2.4) + ' ' + f(y + 4) + 'L' + f(x - 2.4) + ' ' + f(y + 6.2) + 'Z');
      case 2:
        return path('M' + f(x - 3.6) + ' ' + f(y - 3.6) + 'L' + f(x + 3.6) + ' ' + f(y + 3.6) + 'M' + f(x + 3.6) + ' ' + f(y - 3.6) + 'L' + f(x - 3.6) + ' ' + f(y + 3.6), false, 1.6) +
          rect(x - 4.4, y - 4.4, 2.6, 2.6) + rect(x + 1.8, y - 4.4, 2.6, 2.6) + rect(x - 4.4, y + 1.8, 2.6, 2.6) + rect(x + 1.8, y + 1.8, 2.6, 2.6);
      case -2:
        return accidental(-1, x - 3.6, y) + accidental(-1, x + 3.6, y);
    }
    return '';
  }

  function rest(base, x, single) {
    var c = 20; // 中线
    switch (base) {
      case 'w': return single ? rect(x - 6, 20, 12, 5) : rect(x - 6, 10, 12, 5);
      case 'h': return rect(x - 6, 15, 12, 5);
      case 'q':
        return path('M' + f(x - 2) + ' 7.5 L' + f(x + 3.6) + ' 14.2 C' + f(x + 0.4) + ' 16.8 ' + f(x - 0.6) + ' 19.4 ' + f(x + 3.4) + ' 24.2 C' + f(x + 0.6) + ' 22.8 ' + f(x - 3.2) + ' 23.8 ' + f(x - 2.2) + ' 27.2 C' + f(x - 1.6) + ' 29.4 ' + f(x + 0.2) + ' 31 ' + f(x + 1.4) + ' 32', false, 2.5) +
          path('M' + f(x - 1.4) + ' 9 L' + f(x + 2.8) + ' 14 L' + f(x - 0.6) + ' 18.8', false, 3.6);
      case '8':
        return circle(x - 2.2, 16.2, 2.3) + path('M' + f(x - 2.4) + ' 17.6 Q' + f(x + 1) + ' 19.2 ' + f(x + 4) + ' 14.6 L' + f(x - 0.6) + ' 30', false, 1.4);
      case '16':
        return circle(x - 1.2, 16.2, 2.2) + circle(x - 3.6, 23.2, 2.2) +
          path('M' + f(x - 1.4) + ' 17.6 Q' + f(x + 2) + ' 19 ' + f(x + 5) + ' 14.6 L' + f(x - 1.6) + ' 36 M' + f(x - 3.8) + ' 24.6 Q' + f(x - 0.4) + ' 26 ' + f(x + 2.6) + ' 21.6', false, 1.4);
      case '32':
        return circle(x, 9.2, 2.1) + circle(x - 2.2, 16.2, 2.1) + circle(x - 4.4, 23.2, 2.1) +
          path('M' + f(x) + ' 10.6 Q' + f(x + 3) + ' 12 ' + f(x + 6) + ' 7.6 L' + f(x - 2.4) + ' 36 M' + f(x - 2.4) + ' 17.6 Q' + f(x + 0.8) + ' 19 ' + f(x + 4.2) + ' 14.6 M' + f(x - 4.6) + ' 24.6 Q' + f(x - 1.4) + ' 26 ' + f(x + 2.4) + ' 21.6', false, 1.3);
    }
    return '';
  }

  function flag(sx, sy, up, count) {
    var s = '';
    for (var i = 0; i < count; i++) {
      var o = i * 7.5;
      if (up) {
        var y0 = sy + o;
        s += path('M' + f(sx) + ' ' + f(y0) + 'C' + f(sx + 0.6) + ' ' + f(y0 + 7) + ' ' + f(sx + 6.5) + ' ' + f(y0 + 9) + ' ' + f(sx + 8.6) + ' ' + f(y0 + 15) +
          'C' + f(sx + 10.4) + ' ' + f(y0 + 19.6) + ' ' + f(sx + 9.6) + ' ' + f(y0 + 23.6) + ' ' + f(sx + 7.4) + ' ' + f(y0 + 27.6) +
          'C' + f(sx + 8.8) + ' ' + f(y0 + 22.6) + ' ' + f(sx + 8.2) + ' ' + f(y0 + 18.4) + ' ' + f(sx + 5) + ' ' + f(y0 + 15.4) +
          'C' + f(sx + 3.2) + ' ' + f(y0 + 13.6) + ' ' + f(sx + 0.6) + ' ' + f(y0 + 12.4) + ' ' + f(sx) + ' ' + f(y0 + 11.4) + 'Z');
      } else {
        var y1 = sy - o;
        s += path('M' + f(sx) + ' ' + f(y1) + 'C' + f(sx + 0.6) + ' ' + f(y1 - 7) + ' ' + f(sx + 6.5) + ' ' + f(y1 - 9) + ' ' + f(sx + 8.6) + ' ' + f(y1 - 15) +
          'C' + f(sx + 10.4) + ' ' + f(y1 - 19.6) + ' ' + f(sx + 9.6) + ' ' + f(y1 - 23.6) + ' ' + f(sx + 7.4) + ' ' + f(y1 - 27.6) +
          'C' + f(sx + 8.8) + ' ' + f(y1 - 22.6) + ' ' + f(sx + 8.2) + ' ' + f(y1 - 18.4) + ' ' + f(sx + 5) + ' ' + f(y1 - 15.4) +
          'C' + f(sx + 3.2) + ' ' + f(y1 - 13.6) + ' ' + f(sx + 0.6) + ' ' + f(y1 - 12.4) + ' ' + f(sx) + ' ' + f(y1 - 11.4) + 'Z');
      }
    }
    return s;
  }

  function arc(x1, y1, x2, y2, h, dir) {
    // dir: -1 向上弯，1 向下弯；填充的"月牙"形
    var dx = x2 - x1;
    var c1x = x1 + dx * 0.22, c2x = x2 - dx * 0.22;
    var hy = dir * h, th = dir * Math.min(1.8, 0.9 + dx / 120);
    return path('M' + f(x1) + ' ' + f(y1) + 'C' + f(c1x) + ' ' + f(y1 + hy) + ' ' + f(c2x) + ' ' + f(y2 + hy) + ' ' + f(x2) + ' ' + f(y2) +
      'C' + f(c2x) + ' ' + f(y2 + hy + th) + ' ' + f(c1x) + ' ' + f(y1 + hy + th) + ' ' + f(x1) + ' ' + f(y1) + 'Z');
  }

  /* ---------- 解析 ---------- */
  function tokenize(str) { return String(str || '').match(/_?"[^"]*"|\[[^\]]*\][^\s]*|\S+/g) || []; }
  var EV_RE = /^(\[[^\]]*\]|[A-Ga-g](?:##|#|x|bb|b|n)?-?\d|[RrXx])(?::(16|32|w|h|q|1|2|4|8)(\.{0,2})(t?))?(.*)$/;
  var BAR_RE = /^(\|\||\|\]|\|:|:\|:|:\||\|)(.*)$/;

  function parseMods(s, o) {
    var i = 0;
    o.artic = o.artic || '';
    while (i < s.length) {
      var c = s[i];
      if (c === '~') { o.tie = true; i++; }
      else if (c === '*') { var d = s[i + 1]; if (d >= '1' && d <= '3') { o.hl = +d; i += 2; } else { o.hl = 1; i++; } }
      else if (c === '(') { o.slurStart = true; i++; }
      else if (c === ')') { o.slurEnd = true; i++; }
      else if (c === '@') { var j = i + 1; while (j < s.length && /[satfm]/.test(s[j])) j++; o.artic += s.slice(i + 1, j); i = j; }
      else if (c === '!') {
        var k = i + 1;
        while (k < s.length && '~*()@!^_'.indexOf(s[k]) < 0) k++;
        var dyn = s.slice(i + 1, k);
        if (dyn === '<' || dyn === '>') o.hairpin = dyn; else if (dyn === '.') o.dynEnd = true; else if (dyn) o.dyn = dyn;
        i = k;
      }
      else if (c === '^') { var e = s.indexOf('_', i + 1); if (e < 0) e = s.length; (o.above = o.above || []).push(s.slice(i + 1, e)); i = e; }
      else if (c === '_') { var e2 = s.indexOf('^', i + 1); if (e2 < 0) e2 = s.length; (o.below = o.below || []).push(s.slice(i + 1, e2)); i = e2; }
      else i++;
    }
  }

  function parseVoice(str) {
    var MT = global.MT;
    var items = [], time = 0, measure = 0, mStart = 0;
    var last = { base: 'q', dots: 0, triplet: false };
    var pending = [];
    tokenize(str).forEach(function (tok) {
      var m;
      if (tok[0] === '"' || tok.slice(0, 2) === '_"') {
        pending.push({ pos: tok[0] === '_' ? 'below' : 'above', text: tok.replace(/^_?"|"$/g, '') });
        return;
      }
      if ((m = BAR_RE.exec(tok))) {
        var b = { t: 'bar', type: m[1], time: time, measure: measure };
        parseMods(m[2], b);
        items.push(b); measure++; mStart = time;
        return;
      }
      if ((m = /^\{(\d)\}$/.exec(tok))) { items.push({ t: 'volta', n: +m[1], time: time }); return; }
      if (tok === '$segno' || tok === '$coda') { items.push({ t: 'sign', sign: tok.slice(1), time: time }); return; }
      if ((m = EV_RE.exec(tok))) {
        var ev = { t: 'ev', time: time, measure: measure, mStart: mStart, notes: [], rest: false, artic: '', above: [], below: [] };
        var head = m[1];
        if (head[0] === '[') {
          head.slice(1, -1).split(/[\s,]+/).filter(Boolean).forEach(function (s) {
            var mm = /^(.*?)(\*[123]?)?$/.exec(s);
            var n = MT.parseNote(mm[1]);
            if (!n) { console.warn('[Staff] 无法识别的音：' + s); return; }
            n = clone(n);
            if (mm[2]) n.hl = mm[2].length > 1 ? +mm[2][1] : 1;
            ev.notes.push(n);
          });
        } else if (/^[Rr]$/.test(head)) {
          ev.rest = true;
        } else if (/^[Xx]$/.test(head)) {
          ev.notes.push({ letter: 'B', acc: 0, octave: 4, midi: 72, unpitched: true });
        } else {
          var n1 = MT.parseNote(head);
          if (!n1) { console.warn('[Staff] 无法识别的音：' + head); return; }
          ev.notes.push(clone(n1));
        }
        if (m[2]) last = { base: BASE[m[2]], dots: m[3].length, triplet: m[4] === 't' };
        ev.dur = { base: last.base, dots: last.dots, triplet: last.triplet };
        ev.dur.value = DUR[ev.dur.base] * (ev.dur.dots === 1 ? 1.5 : ev.dur.dots === 2 ? 1.75 : 1) * (ev.dur.triplet ? 2 / 3 : 1);
        parseMods(m[5] || '', ev);
        pending.forEach(function (p) { ev[p.pos].push(p.text); });
        pending = [];
        ev.notes.sort(function (a, b) { return (MT.diatonicIndex(a) - MT.diatonicIndex(b)) || (a.midi - b.midi); });
        items.push(ev);
        time = Math.round((time + ev.dur.value) * 1e6) / 1e6;
        return;
      }
      console.warn('[Staff] 无法识别的记号：' + tok);
    });
    // 末尾没有音符可依附的独立文字：挂到最后一个音符或小节线上
    if (pending.length) {
      for (var li = items.length - 1; li >= 0; li--) {
        var it = items[li];
        if (it.t !== 'ev' && it.t !== 'bar') continue;
        pending.forEach(function (p) {
          var pos = it.t === 'bar' ? 'above' : p.pos;
          (it[pos] = it[pos] || []).push(p.text);
        });
        break;
      }
    }
    var counts = {};
    items.forEach(function (it) { if (it.t === 'ev') counts[it.measure] = (counts[it.measure] || 0) + 1; });
    return { items: items, duration: time, measureCounts: counts };
  }

  function computeAccidentals(items, keyMap) {
    var measureAcc = {};
    var prev = null;
    items.forEach(function (it) {
      if (it.t === 'bar') { measureAcc = {}; return; }
      if (it.t !== 'ev') return;
      it.notes.forEach(function (n) {
        if (n.unpitched) return;
        var k = n.letter + n.octave;
        var expected = k in measureAcc ? measureAcc[k] : (keyMap[n.letter] || 0);
        var tiedFrom = prev && prev.tie && prev.notes.some(function (p) { return p.midi === n.midi; });
        if (!tiedFrom && (n.acc !== expected || n.natural)) n.showAcc = n.acc;
        measureAcc[k] = n.acc;
      });
      prev = it;
    });
  }

  function parseTime(t) {
    if (!t) return null;
    if (t === 'C') return { num: 4, den: 4, symbol: 'C' };
    if (t === 'C|') return { num: 2, den: 2, symbol: 'C|' };
    var m = /^(\d+)\/(\d+)$/.exec(t);
    return m ? { num: +m[1], den: +m[2] } : null;
  }
  function beatInfo(ts) {
    if (!ts) return { beamLen: 1, beatLen: 1, perBar: 4, compound: false };
    var unit = 4 / ts.den;
    var compound = ts.den === 8 && ts.num % 3 === 0 && ts.num > 3;
    return {
      beamLen: compound ? 1.5 : (ts.den === 8 ? ts.num * 0.5 : 1),
      beatLen: unit, perBar: ts.num, compound: compound,
      groupLen: compound ? 1.5 : unit
    };
  }

  function beamGroups(items, beamLen) {
    var groups = [], cur = null;
    function close() { if (cur && cur.evs.length > 1) groups.push(cur.evs); cur = null; }
    items.forEach(function (it) {
      if (it.t === 'bar') { close(); return; }
      if (it.t !== 'ev') return;
      var beamable = !it.rest && FLAGS[it.dur.base] > 0;
      if (!beamable) { close(); return; }
      var beat = Math.floor((it.time - it.mStart) / beamLen + 1e-6);
      if (cur && cur.measure === it.measure && cur.beat === beat) cur.evs.push(it);
      else { close(); cur = { measure: it.measure, beat: beat, evs: [it] }; }
    });
    close();
    return groups;
  }

  /* ---------- 单个事件的竖向布局 ---------- */
  function layoutEvent(ev, clef, single, forceUp) {
    if (ev.rest) return;
    var MT = global.MT;
    ev.notes.forEach(function (n) {
      n.step = (single || n.unpitched) ? 4 : MT.diatonicIndex(n) - clef.bottom;
      n.y = 40 - n.step * 5;
    });
    var minS = ev.notes[0].step, maxS = ev.notes[ev.notes.length - 1].step;
    var up;
    if (forceUp != null) up = forceUp;
    else if (single) up = true;
    else up = (maxS - 4) < (4 - minS);
    ev.up = up;
    var notes = ev.notes;
    notes.forEach(function (n) { n.dx = 0; });
    if (up) {
      for (var i = 1; i < notes.length; i++) if (notes[i].step - notes[i - 1].step === 1 && notes[i - 1].dx === 0) notes[i].dx = HEAD_DX;
    } else {
      for (var j = notes.length - 2; j >= 0; j--) if (notes[j + 1].step - notes[j].step === 1 && notes[j + 1].dx === 0) notes[j].dx = -HEAD_DX;
    }
    ev.leftDisp = notes.some(function (n) { return n.dx < 0; });
    ev.rightDisp = notes.some(function (n) { return n.dx > 0; });
    // 变音记号分列，避免重叠
    var accNotes = notes.filter(function (n) { return n.showAcc != null; }).sort(function (a, b) { return b.step - a.step; });
    var cols = [];
    accNotes.forEach(function (n) {
      var c = 0;
      while (cols[c] && cols[c].some(function (o) { return Math.abs(o.step - n.step) < 6; })) c++;
      (cols[c] = cols[c] || []).push(n);
      n.accCol = c;
    });
    ev.accW = 0;
    cols.forEach(function (col) {
      var w = 0; col.forEach(function (n) { w = Math.max(w, ACC_W[n.showAcc] || 9); });
      ev.accW += w + 2.5;
      col.w = w;
    });
    ev.accCols = cols;
  }

  /* ---------- 渲染器 ---------- */
  function StaffView(el, spec) {
    this.el = el;
    this.spec = spec || {};
    this.player = null;
    this.render();
  }

  StaffView.prototype.render = function () {
    var self = this, spec = this.spec, MT = global.MT;
    var scale = spec.scale || 1.15;
    var grand = spec.treble != null || spec.bass != null || spec.clef === 'grand';
    var staves = grand
      ? [{ clef: 'treble', voice: parseVoice(spec.treble || '') }, { clef: 'bass', voice: parseVoice(spec.bass || '') }]
      : [{ clef: spec.clef || 'treble', voice: parseVoice(spec.notes || '') }];
    var ks = spec.key ? MT.keySignature(spec.key) : { count: 0, map: {} };
    var ts = parseTime(spec.time);
    var bi = beatInfo(ts);
    this.ts = ts; this.bi = bi; this.staves = staves; this.grand = grand;

    staves.forEach(function (st) {
      st.def = CLEF[st.clef] || CLEF.treble;
      st.single = !!st.def.single;
      computeAccidentals(st.voice.items, st.clef === 'rhythm' ? {} : ks.map);
      st.voice.items.forEach(function (it) { if (it.t === 'ev') layoutEvent(it, st.def, st.single); });
      st.beams = beamGroups(st.voice.items, bi.beamLen);
      st.beams.forEach(function (g) {
        var minS = Infinity, maxS = -Infinity;
        g.forEach(function (ev) { ev.notes.forEach(function (n) { minS = Math.min(minS, n.step); maxS = Math.max(maxS, n.step); }); });
        var up = st.single ? true : (maxS - 4) < (4 - minS);
        g.forEach(function (ev) { layoutEvent(ev, st.def, st.single, up); ev.beam = g; });
      });
    });

    /* --- 时间槽 --- */
    var slotMap = {}, slots = [], extras = [];
    function getSlot(time, kind) {
      var key = kind + '@' + time.toFixed(5);
      if (!slotMap[key]) { slotMap[key] = { time: time, kind: kind, evs: [], bars: [] }; slots.push(slotMap[key]); }
      return slotMap[key];
    }
    staves.forEach(function (st, si) {
      st.voice.items.forEach(function (it) {
        if (it.t === 'ev') { var s = getSlot(it.time, 'ev'); s.evs[si] = it; it.slot = s; }
        else if (it.t === 'bar') { var b = getSlot(it.time, 'bar'); b.bars[si] = it; b.barType = it.type; it.slot = b; }
        else extras.push(it);
      });
    });
    slots.sort(function (a, b) { return (a.time - b.time) || (a.kind === 'bar' ? -1 : 1); });
    slots.forEach(function (s, i) { s.index = i; });
    extras.forEach(function (it) {
      var kb = 'bar@' + it.time.toFixed(5), ke = 'ev@' + it.time.toFixed(5);
      // 房子挂在它所属小节的第一个音符上（换行时括号会出现在新一行的开头）；其他记号优先挂在小节线上
      var target = it.t === 'volta' ? (slotMap[ke] || slotMap[kb]) : (slotMap[kb] || slotMap[ke]);
      if (!target) target = slots[slots.length - 1];
      if (!target) return;
      (target.extras = target.extras || []).push(it);
    });
    var endTime = 0;
    staves.forEach(function (st) { endTime = Math.max(endTime, st.voice.duration); });
    this.slots = slots; this.endTime = endTime;

    /* --- 横向宽度 --- */
    var evSlots = slots.filter(function (s) { return s.kind === 'ev'; });
    evSlots.forEach(function (s, i) {
      var next = evSlots[i + 1] ? evSlots[i + 1].time : endTime;
      var d = Math.max(0.125, next - s.time);
      var accW = 0, leftD = 0, rightD = 0, dots = 0, flagW = 0;
      s.evs.forEach(function (ev) {
        if (!ev) return;
        accW = Math.max(accW, ev.accW || 0);
        if (ev.leftDisp) leftD = HEAD_DX;
        if (ev.rightDisp) rightD = HEAD_DX;
        dots = Math.max(dots, ev.dur.dots);
        if (!ev.rest && !ev.beam && ev.up && FLAGS[ev.dur.base] > 0) flagW = 8;
        if (ev.above.some(function (t) { return t.length > 3; })) d = Math.max(d, 0.5);
      });
      var hasWhole = s.evs.some(function (ev) { return ev && ev.dur.base === 'w' && !ev.rest; });
      s.left = 7.5 + (hasWhole ? 1.5 : 0) + accW + leftD;
      var space = spec.spacing === 'even' ? (spec.noteSpace || 38) : (spec.noteSpace ? spec.noteSpace * Math.pow(d, 0.6) : 12 + 23 * Math.pow(d, 0.62));
      var minRight = 9 + rightD + dots * 5 + flagW + 4;
      if (spec.names || s.evs.some(function (ev) { return ev && ev.below.length; })) minRight = Math.max(minRight, 17);
      s.right = Math.max(space - 7.5, minRight);
      s.stretch = s.right;
      s.w = s.left + s.right;
    });
    slots.forEach(function (s) { if (s.kind === 'bar') { s.w = BAR_W[s.barType] || 10; s.stretch = 0; } });

    /* --- 表头宽度 --- */
    var clefW = 0;
    staves.forEach(function (st) { clefW = Math.max(clefW, st.def.width); });
    var keyW = ks.count ? Math.abs(ks.count) * 8.6 + 5 : 0;
    var timeW = ts ? 22 : 0;
    var leftPad = grand ? 16 : 2;
    function headerW(first) { return leftPad + clefW + keyW + (first ? timeW : 0) + 10; }

    /* --- 分行 --- */
    var containerW = this.el.clientWidth || (this.el.parentElement && this.el.parentElement.clientWidth) || 720;
    var avail = Math.max(240, containerW / scale - 6);
    if (spec.maxWidth) avail = Math.min(avail, spec.maxWidth);
    var groups = [], cur = [];
    var hasBars = slots.some(function (s) { return s.kind === 'bar'; });
    slots.forEach(function (s) {
      cur.push(s);
      if (!hasBars || s.kind === 'bar') { groups.push(cur); cur = []; }
    });
    if (cur.length) groups.push(cur);
    // 没有小节线的短谱例（音阶、音程等示意图）优先整体缩小，实在太长才折行
    var naturalTotal = headerW(true) + 4;
    slots.forEach(function (s) { naturalTotal += s.w; });
    var allowWrap = spec.wrap === true || (spec.wrap !== false && (hasBars || naturalTotal > avail * 1.45));
    var lines = [], ln = { slots: [], w: 0 };
    groups.forEach(function (g) {
      var gw = 0; g.forEach(function (s) { gw += s.w; });
      if (ln.slots.length && headerW(lines.length === 0) + ln.w + gw > avail && allowWrap) { lines.push(ln); ln = { slots: [], w: 0 }; }
      ln.slots = ln.slots.concat(g); ln.w += gw;
    });
    if (ln.slots.length || !lines.length) lines.push(ln);

    // 两端对齐（最后一行除外）
    var maxLineW = 0;
    lines.forEach(function (L, li) {
      var hw = headerW(li === 0);
      L.header = hw;
      var natural = hw + L.w + 4;
      var target = natural;
      if (lines.length > 1 && (li < lines.length - 1 || natural > avail * 0.82)) target = avail;
      var extra = target - natural, totalStretch = 0;
      L.slots.forEach(function (s) { totalStretch += s.stretch; });
      var x = hw;
      L.slots.forEach(function (s) {
        var add = extra > 0 && totalStretch > 0 ? extra * s.stretch / totalStretch : 0;
        s.x0 = x;
        if (s.kind === 'ev') s.x = x + s.left;
        s.wFinal = s.w + add;
        x += s.wFinal;
      });
      L.end = Math.max(x, spec.minWidth || 0, L.slots.length ? 0 : 140);
      if (!L.slots.length) L.end = Math.max(L.end, hw + 120);
      L.width = L.end + 4;
      maxLineW = Math.max(maxLineW, L.width);
      L.slots.forEach(function (s) { s.line = li; });
    });
    if (spec.staffLabels) maxLineW += 74;
    this.lines = lines;

    /* --- 绘制 --- */
    var out = '', y = 0;
    var lineGap = 22;
    lines.forEach(function (L, li) {
      var res = staves.map(function (st, si) { return self._drawStaff(st, si, L, li, ks, ts); });
      var offs = [];
      offs[0] = y + Math.max(spec.top || 14, -res[0].min + 8);
      for (var si = 1; si < res.length; si++) {
        offs[si] = offs[si - 1] + Math.max(96, res[si - 1].max + 14 - res[si].min);
      }
      res.forEach(function (r, si) { out += '<g transform="translate(0,' + f(offs[si]) + ')">' + r.svg + '</g>'; });
      // 小节线（跨谱表）
      var spans = staves.map(function (st, si) { return st.single ? [offs[si] + 10, offs[si] + 30] : [offs[si], offs[si] + 40]; });
      var dotYs = staves.map(function (st, si) { return [offs[si] + 15, offs[si] + 25]; });
      L.slots.forEach(function (s) { if (s.kind === 'bar') out += drawBar(s.barType, s.x0, spans, dotYs); });
      if (grand) {
        out += line(leftPad, spans[0][0], leftPad, spans[spans.length - 1][1], 1.3);
        out += brace(leftPad - 3.5, spans[0][0], spans[spans.length - 1][1]);
      }
      L.top = offs[0]; L.offs = offs;
      y = offs[offs.length - 1] + res[res.length - 1].max + lineGap;
    });
    var H = y - lineGap + 8;
    var W = maxLineW;
    var svg = '<svg class="staff-svg" xmlns="http://www.w3.org/2000/svg" viewBox="' + (grand ? 0 : -2) + ' 0 ' + f(W + 2) + ' ' + f(H) + '" width="' + f((W + 2) * scale) + '" height="' + f(H * scale) + '" role="img" aria-label="五线谱">' + out + '</svg>';
    this.svgHTML = svg;
    this.W = W; this.H = H;
    this._mount();
  };

  function brace(x, top, bot) {
    var H = bot - top, m = top + H / 2;
    return path('M' + f(x) + ' ' + f(top) +
      'C' + f(x - 9) + ' ' + f(top + H * 0.08) + ' ' + f(x - 1) + ' ' + f(top + H * 0.42) + ' ' + f(x - 9.5) + ' ' + f(m) +
      'C' + f(x - 1) + ' ' + f(bot - H * 0.42) + ' ' + f(x - 9) + ' ' + f(bot - H * 0.08) + ' ' + f(x) + ' ' + f(bot) +
      'C' + f(x - 6.2) + ' ' + f(bot - H * 0.1) + ' ' + f(x + 1.4) + ' ' + f(bot - H * 0.4) + ' ' + f(x - 7.6) + ' ' + f(m) +
      'C' + f(x + 1.4) + ' ' + f(top + H * 0.4) + ' ' + f(x - 6.2) + ' ' + f(top + H * 0.1) + ' ' + f(x) + ' ' + f(top) + 'Z');
  }

  function drawBar(type, x0, spans, dotYs) {
    var out = '', yT = spans[0][0], yB = spans[spans.length - 1][1];
    function thin(x) { out += line(x, yT, x, yB, 1.2); }
    function thick(x) { out += rect(x, yT, 4, yB - yT); }
    function dots(x) { dotYs.forEach(function (d) { out += circle(x, d[0], 1.9) + circle(x, d[1], 1.9); }); }
    switch (type) {
      case '||': thin(x0 + 3); thin(x0 + 7); break;
      case '|]': thin(x0 + 3); thick(x0 + 6.5); break;
      case '|:': thick(x0 + 2); thin(x0 + 9); dots(x0 + 13.5); break;
      case ':|': dots(x0 + 4); thin(x0 + 8.5); thick(x0 + 12); break;
      case ':|:': dots(x0 + 4); thin(x0 + 8.5); thick(x0 + 11.5); thin(x0 + 18); dots(x0 + 22.5); break;
      default: thin(x0 + 4);
    }
    return out;
  }
  function barRight(type, x0) { return x0 + ({ '||': 7.6, '|]': 10.5, '|:': 6, ':|': 16, ':|:': 24 }[type] || 4.6); }

  StaffView.prototype._drawStaff = function (st, si, L, li, ks, ts) {
    var spec = this.spec, MT = global.MT;
    var def = st.def, single = st.single;
    var out = '', ext = { min: 0, max: 40 };
    function track(a, b) { ext.min = Math.min(ext.min, a); ext.max = Math.max(ext.max, b == null ? a : b); }
    var leftPad = this.grand ? 16 : 2;
    // 五线
    var lastSlot = L.slots[L.slots.length - 1];
    var endX = lastSlot && lastSlot.kind === 'bar' ? barRight(lastSlot.barType, lastSlot.x0) : L.end;
    if (single) out += line(leftPad, 20, endX, 20, 1);
    else for (var i = 0; i < 5; i++) out += line(leftPad, i * 10, endX, i * 10, 1);
    if (spec.staffLabels && !single) {
      var lx = endX + 10;
      ['第五线', '第四线', '第三线', '第二线', '第一线'].forEach(function (t, k) { out += text(lx, k * 10 + 2.7, t, 't-clabel', 'start'); });
      ['第四间', '第三间', '第二间', '第一间'].forEach(function (t, k) { out += text(lx + 33, k * 10 + 7.7, t, 't-clabel', 'start', ' opacity=".8"'); });
    }
    // 谱号
    var x = leftPad + 2;
    if (st.clef === 'treble') out += trebleClef(x + 1);
    else if (st.clef === 'bass') out += bassClef(x + 1);
    else if (st.clef === 'alto') out += altoClef(x + 1);
    else if (st.clef === 'rhythm') out += rhythmClef(x + 1);
    var clefW = 0;
    this.staves.forEach(function (s) { clefW = Math.max(clefW, s.def.width); });
    x = leftPad + clefW;
    // 调号
    if (ks.count && st.clef !== 'rhythm') {
      var steps = ks.count > 0 ? SHARP_STEPS : FLAT_STEPS;
      for (var k = 0; k < Math.abs(ks.count); k++) {
        var stp = steps[k] + def.keyShift;
        out += accidental(ks.count > 0 ? 1 : -1, x + 4.5 + k * 8.6, 40 - stp * 5);
      }
    }
    if (ks.count) x += Math.abs(ks.count) * 8.6 + 5;
    // 拍号
    if (ts && li === 0) {
      if (ts.symbol) {
        out += text(x + 10, 20, 'C', 't-time', 'middle', ' font-size="30" dominant-baseline="central"');
        if (ts.symbol === 'C|') out += line(x + 10, -4, x + 10, 44, 1.6);
      } else {
        out += text(x + 10, 10, ts.num, 't-time', 'middle', ' font-size="27" dominant-baseline="central"');
        out += text(x + 10, 30, ts.den, 't-time', 'middle', ' font-size="27" dominant-baseline="central"');
      }
    }

    var lineSlots = L.slots;
    var evs = [];
    lineSlots.forEach(function (s) { if (s.kind === 'ev' && s.evs[si]) evs.push(s.evs[si]); });

    // 预先计算符杠
    var beamOut = '';
    var done = {};
    evs.forEach(function (ev) {
      if (!ev.beam || done[ev.beam[0].time]) return;
      var g = ev.beam.filter(function (e) { return e.slot.line === li; });
      done[ev.beam[0].time] = true;
      if (g.length < 2) { g.forEach(function (e) { e.beamBroken = true; }); return; }
      beamOut += drawBeam(g);
    });
    function stemX(ev, n) { return ev.slot.x + (ev.up ? 5.5 : -5.5); }
    function drawBeam(g) {
      var up = g[0].up;
      var xs = g.map(function (e) { return stemX(e); });
      var ends = g.map(function (e) {
        var levels = FLAGS[e.dur.base];
        var len = 33 + Math.max(0, levels - 2) * 7.5;
        return up ? e.notes[e.notes.length - 1].y - len : e.notes[0].y + len;
      });
      var x1 = xs[0], x2 = xs[xs.length - 1];
      var dy = ends[ends.length - 1] - ends[0];
      dy = Math.max(-9, Math.min(9, dy));
      if (g.length > 2) {
        var inner = ends.slice(1, -1);
        var ext2 = up ? Math.min.apply(null, inner) : Math.max.apply(null, inner);
        if ((up && ext2 < Math.min(ends[0], ends[ends.length - 1])) || (!up && ext2 > Math.max(ends[0], ends[ends.length - 1]))) dy = 0;
      }
      var slope = x2 > x1 ? dy / (x2 - x1) : 0;
      var base = ends[0];
      function by(xx) { return base + slope * (xx - x1); }
      var maxLevel = 1;
      g.forEach(function (e) { maxLevel = Math.max(maxLevel, FLAGS[e.dur.base]); });
      var minStem = 26 + (maxLevel - 1) * 7.5;
      var shift = 0;
      g.forEach(function (e, i) {
        var yb = by(xs[i]);
        if (up) { var lim = e.notes[e.notes.length - 1].y - minStem; if (yb > lim) shift = Math.min(shift, lim - yb); }
        else { var lim2 = e.notes[0].y + minStem; if (yb < lim2) shift = Math.max(shift, lim2 - yb); }
      });
      base += shift;
      if (up && Math.max(by(x1), by(x2)) > 20) base -= Math.max(by(x1), by(x2)) - 20;
      if (!up && Math.min(by(x1), by(x2)) < 20) base += 20 - Math.min(by(x1), by(x2));
      g.forEach(function (e, i) { e.stemEnd = by(xs[i]); });
      var s = '';
      var dir = up ? 1 : -1;
      for (var lv = 1; lv <= maxLevel; lv++) {
        var off = (lv - 1) * 7.5 * dir;
        var i = 0;
        while (i < g.length) {
          if (FLAGS[g[i].dur.base] < lv) { i++; continue; }
          var j = i;
          while (j + 1 < g.length && FLAGS[g[j + 1].dur.base] >= lv) j++;
          var xa, xb;
          if (j > i) { xa = xs[i]; xb = xs[j]; }
          else if (lv > 1) {
            if (i === 0) { xa = xs[i]; xb = xs[i] + 9; } else { xa = xs[i] - 9; xb = xs[i]; }
          } else { i = j + 1; continue; }
          var ya = by(xa) + off, yb2 = by(xb) + off;
          var t = 4.8 * dir;
          s += path('M' + f(xa - (up ? 0 : 0.6)) + ' ' + f(ya) + 'L' + f(xb + (up ? 0.6 : 0)) + ' ' + f(yb2) + 'L' + f(xb + (up ? 0.6 : 0)) + ' ' + f(yb2 + t) + 'L' + f(xa - (up ? 0 : 0.6)) + ' ' + f(ya + t) + 'Z');
          track(Math.min(ya, ya + t), Math.max(ya, ya + t));
          track(Math.min(yb2, yb2 + t), Math.max(yb2, yb2 + t));
          i = j + 1;
        }
      }
      // 三连音标记
      if (g.every(function (e) { return e.dur.triplet; })) {
        var cx = (x1 + x2) / 2 + (up ? 0 : 0);
        var ty = up ? by(cx) - 6 : by(cx) + 13;
        s += text(cx, ty, '3', 't-tuplet');
        track(ty - 10, ty + 2);
      }
      return s;
    }

    // 事件
    evs.forEach(function (ev) {
      var s = ev.slot, x0 = s.x;
      var cls = 'ev' + (ev.hl ? ' hl' + (ev.hl > 1 ? ev.hl : '') : '');
      var g = '<g class="' + cls + '" data-s="' + s.index + '" data-st="' + si + '">';
      g += '<rect x="' + f(x0 - 9) + '" y="-6" width="18" height="52" fill="transparent"/>';
      if (ev.rest) {
        var rx = x0;
        // 整小节休止（该小节只有一个全休止符）画在小节正中
        if (ev.dur.base === 'w' && !ev.dur.dots && st.voice.measureCounts && st.voice.measureCounts[ev.measure] === 1) {
          var prevBar = null, nextBar = null;
          L.slots.forEach(function (sl) {
            if (sl.kind !== 'bar') return;
            if (sl.index < s.index) prevBar = sl;
            else if (sl.index > s.index && !nextBar) nextBar = sl;
          });
          var ra = prevBar ? barRight(prevBar.barType, prevBar.x0) : L.header - 4;
          var rb = nextBar ? nextBar.x0 + 3 : endX;
          rx = (ra + rb) / 2;
        }
        g += rest(ev.dur.base, rx, single);
        for (var d = 0; d < ev.dur.dots; d++) g += circle(x0 + 9 + d * 4.5, 15, 1.7);
      } else {
        var notes = ev.notes;
        var stx = x0 + (ev.up ? 5.5 : -5.5);
        // 加线
        if (!single) {
          var lo = notes[0].step, hi = notes[notes.length - 1].step;
          var hasL = notes.some(function (n) { return n.dx < 0; }), hasR = notes.some(function (n) { return n.dx > 0; });
          var lx1 = x0 - 9.5 - (hasL ? HEAD_DX : 0), lx2 = x0 + 9.5 + (hasR ? HEAD_DX : 0);
          for (var ls = -2; ls >= lo; ls -= 2) g += line(lx1, 40 - ls * 5, lx2, 40 - ls * 5, 1.2);
          for (var hs = 10; hs <= hi; hs += 2) g += line(lx1, 40 - hs * 5, lx2, 40 - hs * 5, 1.2);
        }
        // 符头 + 变音记号
        var headLeft = x0 - 7 - (ev.leftDisp ? HEAD_DX : 0);
        notes.forEach(function (n) {
          var nh = notehead(x0 + n.dx, n.y, ev.dur.base);
          if (n.hl) nh = '<g class="c-hl' + (n.hl > 1 ? n.hl : '') + '">' + nh + '</g>';
          g += nh;
          track(n.y - 6, n.y + 6);
          if (n.showAcc != null) {
            var off = 0;
            for (var c = 0; c < n.accCol; c++) off += ev.accCols[c].w + 2.5;
            var w = ACC_W[n.showAcc] || 9;
            g += accidental(n.showAcc, headLeft - 2 - off - w / 2, n.y);
            track(n.y - 13, n.y + 12);
          }
        });
        // 符干与符尾
        if (ev.dur.base !== 'w') {
          var top = notes[notes.length - 1].y, bot = notes[0].y;
          var y1, y2;
          var levels = FLAGS[ev.dur.base];
          if (ev.beam && !ev.beamBroken && ev.stemEnd != null) {
            y1 = ev.up ? bot - 1 : top + 1; y2 = ev.stemEnd;
          } else if (ev.up) {
            y1 = bot - 1; y2 = top - 34 - Math.max(0, levels - 1) * 6;
            if (!single && y2 > 20) y2 = 20;
          } else {
            y1 = top + 1; y2 = bot + 34 + Math.max(0, levels - 1) * 6;
            if (!single && y2 < 20) y2 = 20;
          }
          g += line(stx, y1, stx, y2, 1.3);
          track(Math.min(y1, y2), Math.max(y1, y2));
          if (levels && (!ev.beam || ev.beamBroken)) {
            g += flag(stx - 0.5, y2, ev.up, levels);
            track(ev.up ? y2 : y2 - 30, ev.up ? y2 + 30 : y2);
          }
          ev.stemX = stx; ev.stemTip = y2;
        }
        // 附点
        for (var dd = 0; dd < ev.dur.dots; dd++) {
          notes.forEach(function (n) {
            var dy = n.step % 2 === 0 && !single ? -5 : 0;
            if (single) dy = -5;
            g += circle(x0 + 9.5 + (ev.rightDisp ? HEAD_DX : 0) + dd * 4.5, n.y + dy, 1.7);
          });
        }
        // 演奏法记号
        if (ev.artic) {
          var below = ev.up;
          var refN = below ? notes[0] : notes[notes.length - 1];
          var ay = refN.y + (below ? 10 : -10);
          var step = 1;
          ev.artic.split('').forEach(function (a) {
            if (a === 'f') return;
            var yy = ay;
            if (!single && yy > -1 && yy < 41) {
              // 不压在线上
              var rel = yy / 10;
              if (Math.abs(rel - Math.round(rel)) < 0.25) yy += below ? 4 : -4;
            }
            if (a === 's') g += circle(x0, yy, 1.8);
            else if (a === 't') g += line(x0 - 5.5, yy, x0 + 5.5, yy, 1.6);
            else if (a === 'a') g += path('M' + f(x0 - 5.5) + ' ' + f(yy - 3.2) + 'L' + f(x0 + 5.5) + ' ' + f(yy) + 'L' + f(x0 - 5.5) + ' ' + f(yy + 3.2), false, 1.3);
            else if (a === 'm') g += path('M' + f(x0 - 4.5) + ' ' + f(yy + (below ? -3 : 3)) + 'L' + f(x0) + ' ' + f(yy + (below ? 4 : -4)) + 'L' + f(x0 + 4.5) + ' ' + f(yy + (below ? -3 : 3)), false, 1.8);
            track(yy - 4, yy + 4);
            ay += (below ? 8 : -8) * step;
          });
        }
      }
      // 延长记号
      if (ev.artic && ev.artic.indexOf('f') >= 0) {
        var fy = Math.min(-8, ext.min - 6);
        if (!ev.rest) fy = Math.min(fy, ev.notes[ev.notes.length - 1].y - 14, (ev.stemTip != null && ev.up ? ev.stemTip - 6 : 99));
        g += path('M' + f(x0 - 8.5) + ' ' + f(fy) + 'C' + f(x0 - 8.5) + ' ' + f(fy - 11) + ' ' + f(x0 + 8.5) + ' ' + f(fy - 11) + ' ' + f(x0 + 8.5) + ' ' + f(fy), false, 1.6) + circle(x0, fy - 1.5, 1.8);
        ev.fermataY = fy - 10;
        track(fy - 10, fy);
      }
      g += '</g>';
      out += g;
    });
    out += beamOut;

    // 延音线 & 圆滑线
    var items = st.voice.items.filter(function (it) { return it.t === 'ev'; });
    var contentStart = L.header - 6;
    items.forEach(function (ev, idx) {
      if (!ev.tie || ev.rest) return;
      var nx = items[idx + 1];
      if (!nx) return;
      var onThis = ev.slot.line === li, nextOn = nx.slot.line === li;
      if (!onThis && !nextOn) return;
      ev.notes.forEach(function (n, k) {
        var m = nx.notes.filter(function (o) { return o.midi === n.midi; })[0];
        if (!m) return;
        var dir = ev.notes.length > 1 ? (k >= ev.notes.length / 2 ? -1 : 1) : (ev.up ? 1 : -1);
        var yy = n.y + dir * 5.5;
        var xa = onThis ? ev.slot.x + 7 + (n.dx > 0 ? HEAD_DX : 0) : contentStart;
        var xb = nextOn ? nx.slot.x - 7 : endX - 2;
        if (xb - xa < 6) return;
        out += arc(xa, yy, xb, yy, Math.min(7, 3 + (xb - xa) / 14), dir);
        track(yy + dir * 9);
      });
    });
    // 圆滑线
    var openSlur = null;
    items.forEach(function (ev) {
      if (ev.slurStart) openSlur = ev;
      if (ev.slurEnd && openSlur) {
        var a = openSlur, b = ev;
        openSlur = null;
        if (a.slot.line !== li && b.slot.line !== li) return;
        var span = items.slice(items.indexOf(a), items.indexOf(b) + 1);
        var allUp = span.every(function (e) { return e.rest || e.up; });
        var dir = allUp ? 1 : -1;
        function endY(e) {
          if (e.rest) return dir > 0 ? 44 : -4;
          return dir > 0 ? e.notes[0].y + 7 : (e.up ? Math.min(e.notes[e.notes.length - 1].y - 7, (e.stemTip || 0) - 4) : e.notes[e.notes.length - 1].y - 7);
        }
        var xa = a.slot.line === li ? a.slot.x + (dir < 0 && a.up ? 5 : 0) : contentStart;
        var xb = b.slot.line === li ? b.slot.x + (dir < 0 && b.up ? 5 : 0) : endX - 2;
        var ya = a.slot.line === li ? endY(a) : endY(b), yb = b.slot.line === li ? endY(b) : endY(a);
        var extreme = dir > 0 ? Math.max(ya, yb) : Math.min(ya, yb);
        span.forEach(function (e) {
          if (e === a || e === b || e.slot.line !== li) return;
          var v = endY(e);
          extreme = dir > 0 ? Math.max(extreme, v + 3) : Math.min(extreme, v - 3);
        });
        var base = dir > 0 ? Math.max(ya, yb) : Math.min(ya, yb);
        var h = Math.max(Math.min(16, 5 + (xb - xa) / 18), Math.abs(extreme - base) / 0.75 + 2);
        out += arc(xa, ya, xb, yb, h, dir);
        track(base + dir * (h * 0.78 + 2));
      }
    });

    // 文字行：上方
    var aboveY = Math.min(-12, ext.min - 8);
    var hasAbove = false;
    evs.forEach(function (ev) {
      if (!ev.above.length) return;
      hasAbove = true;
      ev.above.forEach(function (t, k) { out += text(ev.slot.x - 5, aboveY - k * 16, t, 't-above', 'start'); });
    });
    L.slots.forEach(function (s) {
      if (s.kind !== 'bar' || si !== 0) return;
      var b = s.bars[0] || s.bars[1];
      if (b && b.above && b.above.length) { hasAbove = true; b.above.forEach(function (t) { out += text(barRight(s.barType, s.x0), aboveY, t, 't-above', 'end'); }); }
    });
    if (hasAbove) track(aboveY - 12);
    // 反复房子、记号（只画在最上面的谱表）
    if (si === 0) {
      var voltaY = Math.min(ext.min - 10, -24);
      var voltaDrawn = false;
      L.slots.forEach(function (s) {
        (s.extras || []).forEach(function (it) {
          if (it.t === 'volta') {
            var startX = s.kind === 'bar' ? barRight(s.barType, s.x0) + 1 : s.x0 - 3;
            var endSlot = null;
            for (var q = s.index + 1; q < this.slots.length; q++) {
              var sl = this.slots[q];
              if (sl.kind === 'bar' && sl.barType !== '|' && sl.time > it.time) { endSlot = sl; break; }
              if (sl.extras && sl.extras.some(function (e) { return e.t === 'volta'; }) && sl.time > it.time) { endSlot = sl; break; }
            }
            var xEnd, closed = false;
            if (endSlot && endSlot.line === li) { xEnd = endSlot.x0 + (endSlot.kind === 'bar' ? 3 : -12); closed = it.n === 1; }
            else xEnd = endX - 2;
            if (it.n !== 1 && endSlot && endSlot.line === li) xEnd = endSlot.x0 + 3;
            out += line(startX, voltaY, xEnd, voltaY, 1.2) + line(startX, voltaY, startX, voltaY + 10, 1.2);
            if (closed) out += line(xEnd, voltaY, xEnd, voltaY + 10, 1.2);
            out += text(startX + 4, voltaY + 11, it.n + '.', 't-volta', 'start');
            voltaDrawn = true;
          } else if (it.t === 'sign') {
            var sx = s.kind === 'bar' ? barRight(s.barType, s.x0) - 2 : s.x;
            var sy = Math.min(ext.min - 14, -18);
            if (it.sign === 'coda') {
              out += '<circle cx="' + f(sx) + '" cy="' + f(sy) + '" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/>' + line(sx - 9, sy, sx + 9, sy, 1.3) + line(sx, sy - 9, sx, sy + 9, 1.3);
            } else {
              out += path('M' + f(sx + 3.5) + ' ' + f(sy - 5.5) + 'C' + f(sx + 1) + ' ' + f(sy - 9) + ' ' + f(sx - 5) + ' ' + f(sy - 6) + ' ' + f(sx - 2.6) + ' ' + f(sy - 1.6) +
                'C' + f(sx) + ' ' + f(sy + 2) + ' ' + f(sx + 5.5) + ' ' + f(sy + 1.6) + ' ' + f(sx + 2.8) + ' ' + f(sy + 6) +
                'C' + f(sx + 0.6) + ' ' + f(sy + 9) + ' ' + f(sx - 4.4) + ' ' + f(sy + 7.4) + ' ' + f(sx - 3.6) + ' ' + f(sy + 4.6), false, 2) +
                line(sx - 5.5, sy + 7.5, sx + 5.5, sy - 7.5, 1.2) + circle(sx - 5.2, sy - 2.5, 1.4) + circle(sx + 5.2, sy + 2.5, 1.4);
            }
            track(sy - 10);
          }
        }, this);
      }, this);
      if (voltaDrawn) track(voltaY - 4);
    }

    // 下方：力度、渐强渐弱
    var dynY = Math.max(56, ext.max + 15);
    var hasDyn = false, hairStart = null;
    evs.forEach(function (ev) {
      if (ev.dyn) { hasDyn = true; out += text(ev.slot.x - 4, dynY, ev.dyn, 't-dyn', 'middle'); }
      if (hairStart && (ev.dyn || ev.dynEnd || ev.hairpin) && ev !== hairStart.ev) {
        var xa = hairStart.ev.slot.x + (hairStart.ev.dyn ? 12 : -4), xb = ev.slot.x - (ev.dyn ? 14 : 2);
        if (xb > xa + 6) {
          hasDyn = true;
          var cy = dynY - 5;
          out += hairStart.type === '<'
            ? path('M' + f(xb) + ' ' + f(cy - 5) + 'L' + f(xa) + ' ' + f(cy) + 'L' + f(xb) + ' ' + f(cy + 5), false, 1.2)
            : path('M' + f(xa) + ' ' + f(cy - 5) + 'L' + f(xb) + ' ' + f(cy) + 'L' + f(xa) + ' ' + f(cy + 5), false, 1.2);
        }
        hairStart = null;
      }
      if (ev.hairpin) hairStart = { ev: ev, type: ev.hairpin };
    });
    if (hairStart) {
      var hx = hairStart.ev.slot.x + (hairStart.ev.dyn ? 12 : -4), hx2 = endX - 6, hcy = dynY - 5;
      hasDyn = true;
      out += hairStart.type === '<'
        ? path('M' + f(hx2) + ' ' + f(hcy - 5) + 'L' + f(hx) + ' ' + f(hcy) + 'L' + f(hx2) + ' ' + f(hcy + 5), false, 1.2)
        : path('M' + f(hx) + ' ' + f(hcy - 5) + 'L' + f(hx2) + ' ' + f(hcy) + 'L' + f(hx) + ' ' + f(hcy + 5), false, 1.2);
    }
    if (hasDyn) track(dynY + 5);

    // 下方文字 / 自动音名
    var belowY = Math.max(hasDyn ? dynY + 20 : 58, ext.max + 16);
    var maxLines = 0;
    evs.forEach(function (ev) {
      var labels = ev.below.slice();
      if (!labels.length && spec.names && !ev.rest && !ev.notes[0].unpitched) {
        var ns = ev.notes.slice().reverse();
        labels = ns.map(function (n) {
          if (spec.names === 'solfege') return MT.solfege(n);
          if (spec.names === 'number') return MT.jianpuNumber(n);
          if (spec.names === 'octave') return MT.noteName(n);
          return MT.pcName(n);
        });
      }
      labels.forEach(function (t, k) {
        out += text(ev.slot.x, belowY + k * 15, t, spec.names && !ev.below.length ? 't-name' : 't-below', 'middle');
      });
      maxLines = Math.max(maxLines, labels.length);
    });
    if (maxLines) track(belowY + (maxLines - 1) * 15 + 5);
    if (st.clef === 'treble') track(-14, 55);

    return { svg: out, min: ext.min, max: ext.max };
  };

  StaffView.prototype._mount = function () {
    var self = this, el = this.el, spec = this.spec;
    el.classList.add('staff-box');
    var holder = el.querySelector('.staff-holder');
    if (!holder) {
      el.innerHTML = '';
      holder = document.createElement('div');
      holder.className = 'staff-holder';
      el.appendChild(holder);
    }
    holder.innerHTML = this.svgHTML;
    this.svg = holder.querySelector('svg');
    this._lastW = el.clientWidth;
    if (this._hlState) {
      var hs = this._hlState, me = this;
      Object.keys(hs).forEach(function (cls) { if (hs[cls].length) me.highlightEvents(hs[cls], cls); });
    }
    var hasNotes = this.slots.some(function (s) { return s.kind === 'ev' && s.evs.some(function (e) { return e && !e.rest; }); });
    if (spec.playable !== false && hasNotes) {
      var tools = el.querySelector('.staff-tools');
      if (!tools) {
        tools = document.createElement('div');
        tools.className = 'staff-tools';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'play-btn sm';
        btn.innerHTML = '<span class="pi"></span><span class="lbl">' + (spec.playLabel || '播放') + '</span>';
        btn.addEventListener('click', function () { self.toggle(); });
        tools.appendChild(btn);
        if (spec.showTempo !== false && (this.ts || spec.bpm)) {
          var tl = document.createElement('span');
          tl.className = 'tempo-label';
          tl.textContent = '♩ = ' + (spec.bpm || 90) + (spec.click ? ' · 带节拍器' : '');
          tools.appendChild(tl);
        }
        el.appendChild(tools);
        this.btn = btn;
      }
      this.svg.addEventListener('click', function (e) {
        var g = e.target.closest('.ev');
        if (!g || self.player) return;
        self.playSlot(+g.dataset.s);
      });
    } else if (this.svg) {
      this.svg.querySelectorAll('.ev').forEach(function (g) { g.style.cursor = 'default'; });
    }
  };

  StaffView.prototype.slotEls = function (idx) { return this.svg ? this.svg.querySelectorAll('.ev[data-s="' + idx + '"]') : []; };

  StaffView.prototype.playSlot = function (idx) {
    var s = this.slots[idx];
    if (!s) return;
    var notes = [];
    s.evs.forEach(function (ev) { if (ev && !ev.rest) ev.notes.forEach(function (n) { if (!n.unpitched) notes.push(n.midi); else notes.push(72); }); });
    if (!notes.length) return;
    var dur = 0.9;
    if (PERC[this.spec.instrument]) percHit(this.spec.instrument, null, 0.85);
    else global.Sound.playChord(notes, { duration: dur + 0.4, velocity: 0.75, instrument: this.spec.instrument });
    var els = this.slotEls(idx);
    els.forEach(function (g) { g.classList.add('playing'); });
    setTimeout(function () { els.forEach(function (g) { g.classList.remove('playing'); }); }, dur * 1000);
  };

  /** 根据反复记号展开小节顺序 */
  StaffView.prototype._timeline = function () {
    var slots = this.slots;
    var measures = [{ slots: [], start: 0 }];
    slots.forEach(function (s) {
      var m = measures[measures.length - 1];
      if (s.kind === 'bar') {
        m.endBar = s.barType; m.end = s.time; m.barSlot = s;
        measures.push({ slots: [], start: s.time, startBar: s.barType });
        (s.extras || []).forEach(function (it) { if (it.t === 'volta') measures[measures.length - 1].voltaStart = it.n; });
      } else {
        if (!m.slots.length) m.start = s.time;
        m.slots.push(s);
        (s.extras || []).forEach(function (it) { if (it.t === 'volta' && !m.voltaStart) m.voltaStart = it.n; });
      }
    });
    var lastM = measures[measures.length - 1];
    if (!lastM.slots.length && measures.length > 1) measures.pop();
    else lastM.end = this.endTime;
    // 房子范围
    var curVolta = 0;
    measures.forEach(function (m) {
      if (m.voltaStart) curVolta = m.voltaStart;
      m.volta = curVolta;
      if (m.endBar && m.endBar !== '|') curVolta = 0;
    });
    var order = [], i = 0, rep = 0, pass = 1, jumped = {}, guard = 0, lastJump = -1;
    while (i < measures.length && guard++ < 2000) {
      var m = measures[i];
      if ((m.startBar === '|:' || m.startBar === ':|:') && i > lastJump) { rep = i; pass = 1; }
      else if (m.startBar === '|:' || m.startBar === ':|:') rep = i;
      if (m.volta && m.volta !== pass) { i++; continue; }
      order.push(m);
      if ((m.endBar === ':|' || m.endBar === ':|:') && !jumped[i]) { jumped[i] = true; lastJump = i; pass = 2; i = rep; continue; }
      i++;
    }
    var tl = [], acc = 0;
    order.forEach(function (m) {
      var len = Math.max(0, (m.end == null ? m.start : m.end) - m.start);
      m.slots.forEach(function (s) { tl.push({ slot: s, t: acc + (s.time - m.start) }); });
      acc += len;
    });
    return { events: tl, total: acc };
  };

  StaffView.prototype.toggle = function () { if (this.player) this.stop(); else this.play(); };

  StaffView.prototype.play = function (opts) {
    opts = opts || {};
    var self = this, spec = this.spec, Sound = global.Sound;
    if (this.player) this.stop();
    Sound.ensure();
    var bpm = opts.bpm || spec.bpm || 90, spb = 60 / bpm;
    var tl = this._timeline();
    var bi = this.bi || { beatLen: 1, perBar: 4, groupLen: 1 };
    var barLen = this.ts ? this.ts.num * (4 / this.ts.den) : 4;
    var countIn = (spec.countIn || 0) * barLen;
    var t0 = Sound.now() + 0.12;
    var start = t0 + countIn * spb;
    var cancels = [], voices = [];
    // 延长记号：额外时间
    var fermatas = [];
    tl.events.forEach(function (e) {
      e.slot.evs.forEach(function (ev) { if (ev && ev.artic && ev.artic.indexOf('f') >= 0) fermatas.push({ at: e.t + ev.dur.value, extra: ev.dur.value * 0.9 }); });
    });
    function realT(t) { var x = t; fermatas.forEach(function (fm) { if (fm.at <= t + 1e-6) x += fm.extra; }); return start + x * spb; }
    // 预备拍 + 节拍器
    var unit = bi.compound ? 0.5 : bi.beatLen;
    var perBar = Math.round(barLen / unit);
    function clickAt(time, idx) {
      var inBar = idx % perBar;
      var accent = inBar === 0 ? 2 : (bi.compound && inBar % 3 === 0 ? 1 : 0);
      Sound.click(time, { accent: accent, level: 0.85 });
    }
    for (var c = 0; c * unit < countIn - 1e-6; c++) clickAt(t0 + c * unit * spb, c);
    if (spec.click) for (var b = 0; b * unit < tl.total - 1e-6; b++) clickAt(realT(b * unit), b);
    // 音符（处理延音线、力度）
    var vel = 0.72;
    var pendingTie = {};
    var hair = null;
    var recs = [];
    var perStaffVel = this.staves.map(function () { return 0.72; });
    tl.events.forEach(function (e) {
      e.slot.evs.forEach(function (ev, si) {
        if (!ev) return;
        if (ev.dyn && DYN_VEL[ev.dyn] != null) perStaffVel[si] = DYN_VEL[ev.dyn];
        vel = perStaffVel[si];
        if (ev.rest) return;
        var newTie = {};
        ev.notes.forEach(function (n) {
          var midi = n.unpitched ? 72 : n.midi;
          var key = si + ':' + midi;
          var fermata = ev.artic && ev.artic.indexOf('f') >= 0 ? ev.dur.value * 0.9 : 0;
          if (pendingTie[key]) { pendingTie[key].dur += ev.dur.value + fermata; if (ev.tie) newTie[key] = pendingTie[key]; return; }
          var v = vel;
          if (ev.artic && ev.artic.indexOf('a') >= 0) v = Math.min(1, v + 0.2);
          if (ev.artic && ev.artic.indexOf('m') >= 0) v = Math.min(1, v + 0.25);
          var r = { midi: midi, t: e.t, dur: ev.dur.value + fermata, vel: v, stacc: ev.artic && ev.artic.indexOf('s') >= 0, ten: ev.artic && ev.artic.indexOf('t') >= 0 };
          recs.push(r);
          if (ev.tie) newTie[key] = r;
        });
        Object.keys(pendingTie).forEach(function (k) { if (+k.split(':')[0] === si) delete pendingTie[k]; });
        Object.keys(newTie).forEach(function (k) { pendingTie[k] = newTie[k]; });
      });
    });
    // 渐强/渐弱：对处于发夹记号范围内的音进行线性插值
    this.staves.forEach(function (st, si) {
      var evsInOrder = tl.events.map(function (e) { return { ev: e.slot.evs[si], t: e.t }; }).filter(function (x) { return x.ev; });
      for (var i = 0; i < evsInOrder.length; i++) {
        var ev = evsInOrder[i].ev;
        if (!ev.hairpin) continue;
        var j = i + 1;
        while (j < evsInOrder.length && !(evsInOrder[j].ev.dyn || evsInOrder[j].ev.dynEnd || evsInOrder[j].ev.hairpin)) j++;
        var t1 = evsInOrder[i].t, t2 = j < evsInOrder.length ? evsInOrder[j].t : tl.total;
        var startVel = null;
        recs.forEach(function (r) { if (Math.abs(r.t - t1) < 1e-6 && startVel == null) startVel = r.vel; });
        if (startVel == null) startVel = 0.6;
        var endVel = j < evsInOrder.length && DYN_VEL[evsInOrder[j].ev.dyn] != null ? DYN_VEL[evsInOrder[j].ev.dyn] : Math.max(0.2, Math.min(1, startVel + (ev.hairpin === '<' ? 0.35 : -0.35)));
        recs.forEach(function (r) { if (r.t >= t1 - 1e-6 && r.t < t2 - 1e-6) r.vel = startVel + (endVel - startVel) * ((r.t - t1) / Math.max(0.001, t2 - t1)); });
      }
    });
    recs.forEach(function (r) {
      var ts = realT(r.t), te = realT(r.t + r.dur);
      if (PERC[spec.instrument]) { percHit(spec.instrument, ts, r.vel); return; }
      var len = (te - ts) * (r.stacc ? 0.3 : r.ten ? 1 : 0.94);
      voices.push(Sound.playNote(r.midi, { at: ts, duration: Math.max(0.06, len), velocity: r.vel, instrument: spec.instrument }));
    });
    // 高亮：每个声部按自己的时值点亮/熄灭
    tl.events.forEach(function (e) {
      e.slot.evs.forEach(function (ev, si) {
        if (!ev) return;
        var sel = '.ev[data-s="' + e.slot.index + '"][data-st="' + si + '"]';
        var on = realT(e.t), off = realT(e.t + ev.dur.value) - 0.03;
        cancels.push(Sound.at(on, function () { var g = self.svg && self.svg.querySelector(sel); if (g) g.classList.add('playing'); }));
        cancels.push(Sound.at(off, function () { var g = self.svg && self.svg.querySelector(sel); if (g) g.classList.remove('playing'); }));
      });
      if (spec.onSlot) cancels.push(Sound.at(realT(e.t), function () { spec.onSlot(e.slot, e); }));
    });
    var endAt = realT(tl.total) + 0.1;
    var handle = {
      stop: function () {
        if (self.player !== handle) return;
        self.player = null;
        cancels.forEach(function (fn) { fn(); });
        voices.forEach(function (v) { if (v) v.release(); });
        if (self.svg) self.svg.querySelectorAll('.ev.playing').forEach(function (g) { g.classList.remove('playing'); });
        if (self.btn) { self.btn.classList.remove('playing'); self.btn.querySelector('.lbl').textContent = spec.playLabel || '播放'; }
        Sound.unclaim(handle);
        if (spec.onEnd) spec.onEnd();
      }
    };
    cancels.push(Sound.at(endAt, function () { handle.stop(); }));
    Sound.claim(handle, '五线谱播放');
    this.player = handle;
    if (this.btn) { this.btn.classList.add('playing'); this.btn.querySelector('.lbl').textContent = '停止'; }
    return handle;
  };

  StaffView.prototype.stop = function () { if (this.player) this.player.stop(); };

  /**
   * 更新谱例。新配置与旧配置合并；但单行谱（notes）与大谱表（treble/bass）互斥：
   * 传入 notes 而不传 treble/bass 时会清除旧的大谱表声部，反之亦然。
   */
  StaffView.prototype.update = function (newSpec) {
    this.stop();
    newSpec = newSpec || {};
    var sp = this.spec;
    if ('notes' in newSpec && !('treble' in newSpec) && !('bass' in newSpec)) { delete sp.treble; delete sp.bass; if (sp.clef === 'grand' && !('clef' in newSpec)) delete sp.clef; }
    if (('treble' in newSpec || 'bass' in newSpec) && !('notes' in newSpec)) delete sp.notes;
    Object.assign(sp, newSpec);
    this._hlState = {};
    var tools = this.el.querySelector('.staff-tools');
    if (tools) tools.remove();
    this.btn = null;
    this.render();
  };

  /** 高亮某些时间槽（按事件序号，从 0 开始，仅计音符/休止，不计小节线）；窗口缩放重绘后会自动恢复 */
  StaffView.prototype.highlightEvents = function (indexes, cls) {
    cls = cls || 'hl';
    this._hlState = this._hlState || {};
    this._hlState[cls] = (indexes || []).slice();
    if (!this.svg) return;
    var evSlots = this.slots.filter(function (s) { return s.kind === 'ev'; });
    var self = this;
    this.svg.querySelectorAll('.ev.' + cls).forEach(function (g) { g.classList.remove(cls); });
    (indexes || []).forEach(function (i) { var s = evSlots[i]; if (s) self.slotEls(s.index).forEach(function (g) { g.classList.add(cls); }); });
  };

  /* ---------- 公共 API ---------- */
  var instances = [];
  // 容器宽度变化（窗口缩放、侧栏开合、折叠块展开等）时自动重排
  var roTimer = null, roPending = [];
  var ro = global.ResizeObserver ? new global.ResizeObserver(function (entries) {
    entries.forEach(function (en) { if (en.target._staff && roPending.indexOf(en.target._staff) < 0) roPending.push(en.target._staff); });
    clearTimeout(roTimer);
    roTimer = setTimeout(function () {
      var list = roPending; roPending = [];
      list.forEach(function (v) {
        if (v.player || !document.body.contains(v.el)) return;
        var w = v.el.clientWidth;
        if (!w || w === v._lastW) return;
        v.render();
      });
    }, 120);
  }) : null;

  function render(el, spec) {
    if (typeof el === 'string') el = document.querySelector(el);
    if (el._staff) { el._staff.update(spec); return el._staff; }
    var v = new StaffView(el, spec);
    el._staff = v;
    instances.push(v);
    if (ro) ro.observe(el);
    return v;
  }
  function refreshAll() {
    instances.forEach(function (v) {
      if (!document.body.contains(v.el)) return;
      if (v.player) return;
      var w = v.el.clientWidth;
      if (w && w === v._lastW) return;
      v.render();
    });
  }
  /** 把记谱字符串转换为 Sound.playSequence 可用的事件（忽略小节线与修饰） */
  function toSequence(str) {
    var v = parseVoice(str);
    var out = [];
    var items = v.items.filter(function (it) { return it.t === 'ev'; });
    items.forEach(function (ev, i) {
      var prev = items[i - 1];
      if (prev && prev.tie && out.length && !ev.rest && prev.notes.length === ev.notes.length) { out[out.length - 1].beats += ev.dur.value; return; }
      out.push({
        notes: ev.rest ? [] : ev.notes.map(function (n) { return n.unpitched ? 72 : n.midi; }),
        beats: ev.dur.value, staccato: ev.artic.indexOf('s') >= 0,
        velocity: ev.dyn && DYN_VEL[ev.dyn] != null ? DYN_VEL[ev.dyn] : undefined
      });
    });
    return out;
  }

  var resizeTimer = null;
  global.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refreshAll, 150);
  });

  global.Staff = {
    render: render, refreshAll: refreshAll, parseVoice: parseVoice, toSequence: toSequence, tokenize: tokenize,
    instances: instances, StaffView: StaffView
  };
})(window);
