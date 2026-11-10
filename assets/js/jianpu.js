/*!
 * jianpu.js — 简谱（数字谱）渲染器 + 播放
 * 全局对象：window.Jianpu
 *
 * Jianpu.render(el, { notes: '1 1 5 5 | 6 6 5 - |', key: 'C', time: '4/4', lyrics: '一 闪 一 闪 亮 晶 晶', bpm: 90, octave: 4 })
 *
 * 语法（空格分隔）：
 *   1~7 音符，0 休止；前缀 # 或 b 表示升降（#4、b7）
 *   ' 高八度（可叠加 1''），, 低八度（5, 6,,）
 *   _ 八分音符（一条减时线），__ 十六分音符（两条）
 *   . 附点（5.  或 5_.）
 *   -  独立的增时线：延长前一个音一拍（5 - 表示二分音符）
 *   ~ 延音线连到下一个音   ( ) 圆滑线   * 高亮   ^文字 上方文字（如和弦名）
 *   小节线 |  ||  |]  |:  :|
 */
(function (global) {
  'use strict';

  var MAJOR = [0, 2, 4, 5, 7, 9, 11];
  function f(n) { return Math.round(n * 100) / 100; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function line(x1, y1, x2, y2, w) { return '<line x1="' + f(x1) + '" y1="' + f(y1) + '" x2="' + f(x2) + '" y2="' + f(y2) + '" stroke="currentColor" stroke-width="' + (w || 1.3) + '"/>'; }
  function circle(x, y, r) { return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + r + '" fill="currentColor"/>'; }
  function text(x, y, s, cls, anchor, extra) { return '<text x="' + f(x) + '" y="' + f(y) + '" class="' + cls + '" text-anchor="' + (anchor || 'middle') + '" fill="currentColor"' + (extra || '') + '>' + esc(s) + '</text>'; }

  var NOTE_RE = /^([#b♯♭]?)([0-7])([',]*)(__|_|=)?(\.{0,2})(.*)$/;
  var BAR_RE = /^(\|\||\|\]|\|:|:\|:|:\||\|)$/;

  function parse(str) {
    var tokens = String(str || '').match(/\S+/g) || [];
    var items = [], time = 0, last = null;
    tokens.forEach(function (tok) {
      if (BAR_RE.test(tok)) { items.push({ t: 'bar', type: tok, time: time }); return; }
      if (tok === '-') { items.push({ t: 'dash', time: time, of: last }); if (last) last.extra = (last.extra || 0) + 1; time += 1; return; }
      var m = NOTE_RE.exec(tok);
      if (!m) { console.warn('[Jianpu] 无法识别：' + tok); return; }
      var under = m[4] === '__' || m[4] === '=' ? 2 : m[4] === '_' ? 1 : 0;
      var dots = m[5].length;
      var dur = Math.pow(0.5, under) * (dots === 1 ? 1.5 : dots === 2 ? 1.75 : 1);
      var oct = 0;
      m[3].split('').forEach(function (c) { oct += c === "'" ? 1 : -1; });
      var ev = { t: 'note', acc: m[1] === '#' || m[1] === '♯' ? 1 : m[1] ? -1 : 0, deg: +m[2], oct: oct, under: under, dots: dots, dur: dur, time: time, above: [] };
      var mods = m[6] || '', i = 0;
      while (i < mods.length) {
        var c = mods[i];
        if (c === '~') { ev.tie = true; i++; }
        else if (c === '(') { ev.slurStart = true; i++; }
        else if (c === ')') { ev.slurEnd = true; i++; }
        else if (c === '*') { ev.hl = true; i++; }
        else if (c === '^') { ev.above.push(mods.slice(i + 1)); break; }
        else i++;
      }
      items.push(ev); last = ev; time += dur;
    });
    return { items: items, total: time };
  }

  function JianpuView(el, spec) { this.el = el; this.spec = spec || {}; this.player = null; this.render(); }

  JianpuView.prototype.render = function () {
    var spec = this.spec;
    var p = parse(spec.notes || '');
    this.parsed = p;
    var items = p.items;
    var scale = spec.scale || 1;
    var lyrics = spec.lyrics ? String(spec.lyrics).split(/\s+/).filter(Boolean) : [];
    // 宽度
    items.forEach(function (it) {
      if (it.t === 'bar') it.w = it.type === '|' ? 20 : 26;
      else if (it.t === 'dash') it.w = 30;
      else it.w = (it.under === 0 ? 30 : it.under === 1 ? 23 : 19) + it.dots * 7 + (it.acc ? 6 : 0);
    });
    // 分行
    var containerW = this.el.clientWidth || 700;
    var avail = Math.max(260, containerW / scale - 10);
    var groups = [], cur = [];
    items.forEach(function (it) { cur.push(it); if (it.t === 'bar') { groups.push(cur); cur = []; } });
    if (cur.length) groups.push(cur);
    var lines = [], ln = [], lw = 0;
    groups.forEach(function (g) {
      var gw = 0; g.forEach(function (it) { gw += it.w; });
      if (ln.length && lw + gw > avail) { lines.push(ln); ln = []; lw = 0; }
      ln = ln.concat(g); lw += gw;
    });
    if (ln.length || !lines.length) lines.push(ln);
    var hasLyrics = lyrics.length > 0;
    var hasAbove = items.some(function (it) { return it.above && it.above.length; });
    var rowH = 62 + (hasLyrics ? 22 : 0) + (hasAbove ? 18 : 0);
    var headH = spec.key || spec.time ? 26 : 4;
    var out = '';
    if (headH > 4) {
      var head = (spec.key ? '1=' + global.MT.pretty(spec.key) : '') + (spec.time ? '   ' + spec.time : '');
      out += text(2, 16, head, 'jp-head', 'start');
    }
    var lyricIdx = 0, evIdx = 0, maxW = 0;
    var self = this;
    var notes = items.filter(function (it) { return it.t === 'note'; });
    notes.forEach(function (n, i) { if (n.tie && notes[i + 1] && notes[i + 1].deg === n.deg) notes[i + 1].tiedFrom = true; });
    lines.forEach(function (L, li) {
      var cy = headH + li * rowH + (hasAbove ? 40 : 24);
      var x = 8;
      // 宽度两端对齐（多行时）
      var natural = 0; L.forEach(function (it) { natural += it.w; });
      var extra = lines.length > 1 && li < lines.length - 1 ? Math.max(0, (avail - natural) / Math.max(1, L.length)) : 0;
      L.forEach(function (it) { it.x = x + (it.w + extra) / 2; it.cy = cy; it.line = li; x += it.w + extra; });
      maxW = Math.max(maxW, x + 6);
      // 减时线分组（同一拍内连在一起）
      var runs = [];
      var run = null;
      L.forEach(function (it) {
        if (it.t !== 'note' || !it.under) { run = null; return; }
        var beat = Math.floor(it.time + 1e-6);
        if (run && run.beat === beat) run.items.push(it); else { run = { beat: beat, items: [it] }; runs.push(run); }
      });
      runs.forEach(function (r) {
        for (var lv = 1; lv <= 2; lv++) {
          var i = 0;
          while (i < r.items.length) {
            if (r.items[i].under < lv) { i++; continue; }
            var j = i;
            while (j + 1 < r.items.length && r.items[j + 1].under >= lv) j++;
            var a = r.items[i], b = r.items[j];
            var yy = cy + 12 + (lv - 1) * 4.5;
            out += line(a.x - 8, yy, b.x + 8 + (b.dots ? 6 : 0), yy, 1.4);
            i = j + 1;
          }
        }
      });
      L.forEach(function (it) {
        if (it.t === 'bar') {
          var bx = it.x;
          if (it.type === '|') out += line(bx, cy - 15, bx, cy + 15, 1.3);
          else if (it.type === '||') out += line(bx - 2, cy - 15, bx - 2, cy + 15, 1.2) + line(bx + 2, cy - 15, bx + 2, cy + 15, 1.2);
          else if (it.type === '|]') out += line(bx - 3, cy - 15, bx - 3, cy + 15, 1.2) + '<rect x="' + f(bx) + '" y="' + f(cy - 15) + '" width="3.6" height="30" fill="currentColor"/>';
          else if (it.type === '|:') out += '<rect x="' + f(bx - 4) + '" y="' + f(cy - 15) + '" width="3.6" height="30" fill="currentColor"/>' + line(bx + 2, cy - 15, bx + 2, cy + 15, 1.2) + circle(bx + 7, cy - 5, 1.8) + circle(bx + 7, cy + 5, 1.8);
          else if (it.type === ':|') out += circle(bx - 7, cy - 5, 1.8) + circle(bx - 7, cy + 5, 1.8) + line(bx - 2, cy - 15, bx - 2, cy + 15, 1.2) + '<rect x="' + f(bx + 1) + '" y="' + f(cy - 15) + '" width="3.6" height="30" fill="currentColor"/>';
          else out += line(bx, cy - 15, bx, cy + 15, 1.3);
          return;
        }
        if (it.t === 'dash') { out += line(it.x - 7, cy, it.x + 7, cy, 2); return; }
        var g = '<g class="ev' + (it.hl ? ' hl' : '') + '" data-i="' + evIdx + '">';
        it.index = evIdx++;
        g += '<rect x="' + f(it.x - 11) + '" y="' + f(cy - 22) + '" width="22" height="44" fill="transparent"/>';
        g += text(it.x, cy, it.deg, 'jp-num', 'middle', ' dominant-baseline="central"');
        if (it.acc) g += text(it.x - 9.5, cy - 7, it.acc > 0 ? '♯' : '♭', 'jp-acc', 'middle', ' font-size="13"');
        for (var d = 0; d < it.dots; d++) g += circle(it.x + 10 + d * 5, cy + 1, 2);
        for (var o = 0; o < it.oct; o++) g += circle(it.x, cy - 14 - o * 5.5, 2);
        for (var o2 = 0; o2 < -it.oct; o2++) g += circle(it.x, cy + 13 + it.under * 4.5 + 2 + o2 * 5.5, 2);
        g += '</g>';
        out += g;
        if (it.above.length) out += text(it.x - 6, cy - 30, it.above[0], 'jp-above', 'start');
        if (hasLyrics && it.deg !== 0 && !it.tiedFrom) {
          var lyr = lyrics[lyricIdx++];
          if (lyr && lyr !== '_') out += text(it.x, cy + 38, lyr, 'jp-lyric');
        }
      });
    });
    // 延音线、圆滑线
    var arcs = '';
    function arcBetween(a, b) {
      if (a.line !== b.line) return;
      var y = a.cy - 15 - Math.max(a.oct > 0 ? a.oct : 0, b.oct > 0 ? b.oct : 0) * 5.5 - 3;
      var x1 = a.x + 2, x2 = b.x - 2, h = Math.min(9, 4 + (x2 - x1) / 12);
      arcs += '<path d="M' + f(x1) + ' ' + f(y) + 'C' + f(x1 + (x2 - x1) * 0.25) + ' ' + f(y - h) + ' ' + f(x2 - (x2 - x1) * 0.25) + ' ' + f(y - h) + ' ' + f(x2) + ' ' + f(y) +
        'C' + f(x2 - (x2 - x1) * 0.25) + ' ' + f(y - h + 1.6) + ' ' + f(x1 + (x2 - x1) * 0.25) + ' ' + f(y - h + 1.6) + ' ' + f(x1) + ' ' + f(y) + 'Z" fill="currentColor"/>';
    }
    notes.forEach(function (n, i) { if (n.tie && notes[i + 1]) arcBetween(n, notes[i + 1]); });
    var open = null;
    notes.forEach(function (n) { if (n.slurStart) open = n; if (n.slurEnd && open) { arcBetween(open, n); open = null; } });
    out += arcs;
    var H = headH + lines.length * rowH - (hasLyrics ? 0 : 6);
    var W = Math.max(maxW, 120);
    this.el.classList.add('jianpu-box');
    var holder = this.el.querySelector('.jp-holder');
    if (!holder) { this.el.innerHTML = ''; holder = document.createElement('div'); holder.className = 'jp-holder'; this.el.appendChild(holder); }
    holder.innerHTML = '<svg class="jianpu-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f(W) + ' ' + f(H) + '" width="' + f(W * scale) + '" height="' + f(H * scale) + '" role="img" aria-label="简谱">' + out + '</svg>';
    this.svg = holder.querySelector('svg');
    if (spec.playable !== false && notes.some(function (n) { return n.deg > 0; })) {
      if (!this.el.querySelector('.staff-tools')) {
        var tools = document.createElement('div');
        tools.className = 'staff-tools';
        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'play-btn sm';
        btn.innerHTML = '<span class="pi"></span><span class="lbl">' + (spec.playLabel || '播放') + '</span>';
        btn.addEventListener('click', function () { self.toggle(); });
        tools.appendChild(btn);
        var tl = document.createElement('span'); tl.className = 'tempo-label'; tl.textContent = '♩ = ' + (spec.bpm || 90);
        tools.appendChild(tl);
        this.el.appendChild(tools);
        this.btn = btn;
      }
      this.svg.addEventListener('click', function (e) {
        var g = e.target.closest('.ev');
        if (!g || self.player) return;
        var n = notes[+g.dataset.i];
        if (!n || n.deg === 0) return;
        global.Sound.playNote(self.midiOf(n), { duration: 0.9 });
        g.classList.add('playing'); setTimeout(function () { g.classList.remove('playing'); }, 600);
      });
    }
  };

  JianpuView.prototype.midiOf = function (n) {
    var MT = global.MT;
    var tonic = MT.parseNote((this.spec.key || 'C').replace(/m$/, '') + (this.spec.octave || 4));
    return tonic.midi + MAJOR[n.deg - 1] + n.acc + n.oct * 12;
  };

  JianpuView.prototype.toggle = function () { if (this.player) this.stop(); else this.play(); };
  JianpuView.prototype.play = function () {
    var self = this, Sound = global.Sound;
    if (this.player) this.stop();
    var notes = this.parsed.items.filter(function (it) { return it.t === 'note'; });
    var events = [];
    notes.forEach(function (n, i) {
      var beats = n.dur + (n.extra || 0);
      var prev = notes[i - 1];
      if (prev && prev.tie && n.deg === prev.deg && n.oct === prev.oct && events.length) { events[events.length - 1].beats += beats; events[events.length - 1].holdBeats = events[events.length - 1].beats; return; }
      events.push({ notes: n.deg === 0 ? [] : [self.midiOf(n)], beats: beats, idx: n.index });
    });
    var seq = Sound.playSequence(events, {
      label: '简谱播放',
      bpm: this.spec.bpm || 90,
      instrument: this.spec.instrument,
      onEvent: function (ev) {
        self.svg.querySelectorAll('.ev.playing').forEach(function (g) { g.classList.remove('playing'); });
        var g = self.svg.querySelector('.ev[data-i="' + ev.idx + '"]');
        if (g) g.classList.add('playing');
      },
      onEnd: function () {
        self.player = null;
        if (self.svg) self.svg.querySelectorAll('.ev.playing').forEach(function (g) { g.classList.remove('playing'); });
        if (self.btn) { self.btn.classList.remove('playing'); self.btn.querySelector('.lbl').textContent = self.spec.playLabel || '播放'; }
      }
    });
    this.player = seq;
    if (this.btn) { this.btn.classList.add('playing'); this.btn.querySelector('.lbl').textContent = '停止'; }
  };
  JianpuView.prototype.stop = function () { if (this.player) this.player.stop(); };

  var instances = [];
  var roTimer = null, roPending = [];
  var ro = global.ResizeObserver ? new global.ResizeObserver(function (entries) {
    entries.forEach(function (en) { if (en.target._jianpu && roPending.indexOf(en.target._jianpu) < 0) roPending.push(en.target._jianpu); });
    clearTimeout(roTimer);
    roTimer = setTimeout(function () {
      var list = roPending; roPending = [];
      list.forEach(function (v) {
        if (v.player || !document.body.contains(v.el)) return;
        var w = v.el.clientWidth;
        if (!w || w === v._lastW) return;
        v._lastW = w; v.render();
      });
    }, 120);
  }) : null;
  function render(el, spec) {
    if (typeof el === 'string') el = document.querySelector(el);
    if (el._jianpu) { el._jianpu.stop(); Object.assign(el._jianpu.spec, spec || {}); el._jianpu.render(); return el._jianpu; }
    var v = new JianpuView(el, spec);
    el._jianpu = v; instances.push(v);
    v._lastW = el.clientWidth;
    if (ro) ro.observe(el);
    return v;
  }
  var timer = null;
  global.addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      instances.forEach(function (v) {
        if (v.player || !document.body.contains(v.el)) return;
        var w = v.el.clientWidth; if (w && w === v._lastW) return; v._lastW = w; v.render();
      });
    }, 150);
  });

  global.Jianpu = { render: render, parse: parse, instances: instances };
})(window);
