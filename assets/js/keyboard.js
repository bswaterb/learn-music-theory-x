/*!
 * keyboard.js — 可交互的钢琴键盘组件
 * 全局类：window.PianoKeyboard
 *
 *   var kb = new PianoKeyboard(el, {
 *     start: 'C4', end: 'B5',          // 音域（会自动扩展到白键）
 *     labels: 'c',                     // 'name' 全部白键音名 | 'solfege' 唱名 | 'number' 简谱数字 | 'c' 只标 C | 'none'
 *     blackLabels: false,              // 黑键是否显示音名
 *     interactive: true, sound: true,  // 可点击 / 点击发声
 *     highlight: ['C4','E4','G4'],     // 初始高亮
 *     size: 'normal' | 'compact' | 'tall',
 *     onNoteOn(midi), onNoteOff(midi)
 *   });
 *   kb.setHighlight(['C4','E4','G4'], { cls: 'hl', badges: ['1','3','5'] | 'name' | 'degree' })
 *   kb.clearHighlight(cls?)  kb.press(midi)  kb.release(midi)  kb.flash(midi, ms)  kb.releaseAll()
 *   kb.setLabels('name')  kb.setRange('C3','C6')  kb.setKeyHints({ 60: 'A', 62: 'S' })
 */
(function (global) {
  'use strict';

  var BLACK = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };
  // 黑键相对于两白键分界线的偏移（以白键宽度为单位），模仿真实钢琴
  var BLACK_SHIFT = { 1: -0.1, 3: 0.1, 6: -0.12, 8: 0, 10: 0.12 };
  var LETTERS_BY_PC = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };
  var SOLFEGE_BY_PC = { 0: 'do', 2: 're', 4: 'mi', 5: 'fa', 7: 'sol', 9: 'la', 11: 'si' };
  var NUMBER_BY_PC = { 0: '1', 2: '2', 4: '3', 5: '4', 7: '5', 9: '6', 11: '7' };
  var BLACK_NAMES = { 1: 'C♯<br>D♭', 3: 'D♯<br>E♭', 6: 'F♯<br>G♭', 8: 'G♯<br>A♭', 10: 'A♯<br>B♭' };

  function mod(n, m) { return ((n % m) + m) % m; }
  function isBlack(m) { return !!BLACK[mod(m, 12)]; }
  function toMidi(x) { return typeof x === 'number' ? x : global.MT.toMidi(x); }

  function PianoKeyboard(el, opts) {
    if (typeof el === 'string') el = document.querySelector(el);
    this.el = el;
    this.opts = Object.assign({
      start: 'C4', end: 'B5', labels: 'c', blackLabels: false, interactive: true, sound: true,
      velocity: 0.8, instrument: null, highlight: null, size: 'normal', onNoteOn: null, onNoteOff: null,
      minWhiteWidth: 22
    }, opts || {});
    this.keys = {};
    this.pointers = new Map();
    this.down = {};   // 视觉按下计数
    this.held = {};   // 真实按住计数
    this.hints = {};
    this._build();
    if (this.opts.highlight) this.setHighlight(this.opts.highlight, this.opts.highlightOptions || {});
  }

  PianoKeyboard.prototype._build = function () {
    var o = this.opts;
    var s = toMidi(o.start), e = toMidi(o.end);
    if (isBlack(s)) s -= 1;
    if (isBlack(e)) e += 1;
    this.start = s; this.end = e;
    var whites = [];
    for (var m = s; m <= e; m++) if (!isBlack(m)) whites.push(m);
    this.whiteCount = whites.length;

    var el = this.el;
    el.innerHTML = '';
    el.classList.add('kb-wrap');
    var pk = document.createElement('div');
    pk.className = 'pk' + (o.size === 'compact' ? ' compact' : o.size === 'tall' ? ' tall' : '');
    pk.style.minWidth = (whites.length * o.minWhiteWidth + 6) + 'px';
    var inner = document.createElement('div');
    inner.className = 'pk-inner';
    pk.appendChild(inner);
    el.appendChild(pk);
    this.pk = pk; this.inner = inner;

    var W = 100 / whites.length;
    var self = this;
    whites.forEach(function (m, i) {
      var k = document.createElement('div');
      k.className = 'pk-key pk-white';
      k.style.left = (i * W) + '%';
      k.style.width = W + '%';
      k.dataset.midi = m;
      inner.appendChild(k);
      self.keys[m] = k;
    });
    for (var mb = s; mb <= e; mb++) {
      if (!isBlack(mb)) continue;
      var nextWhiteIdx = whites.indexOf(mb + 1);
      if (nextWhiteIdx < 0) continue;
      var bw = W * 0.62;
      var center = nextWhiteIdx * W + BLACK_SHIFT[mod(mb, 12)] * W;
      var kb = document.createElement('div');
      kb.className = 'pk-key pk-black';
      kb.style.left = (center - bw / 2) + '%';
      kb.style.width = bw + '%';
      kb.dataset.midi = mb;
      inner.appendChild(kb);
      this.keys[mb] = kb;
    }
    this._renderLabels();
    if (o.interactive) this._bind();
  };

  PianoKeyboard.prototype._labelFor = function (m) {
    var mode = this.opts.labels, pc = mod(m, 12), oct = Math.floor(m / 12) - 1;
    if (isBlack(m)) return this.opts.blackLabels ? BLACK_NAMES[pc] : '';
    switch (mode) {
      case 'name': return LETTERS_BY_PC[pc] + (pc === 0 ? '<sub style="font-size:.75em">' + oct + '</sub>' : '');
      case 'name-plain': return LETTERS_BY_PC[pc];
      case 'solfege': return SOLFEGE_BY_PC[pc];
      case 'number': return NUMBER_BY_PC[pc];
      case 'c': return pc === 0 ? 'C' + oct : '';
      default: return '';
    }
  };

  PianoKeyboard.prototype._renderLabels = function () {
    var self = this;
    Object.keys(this.keys).forEach(function (m) {
      m = +m;
      var k = self.keys[m];
      var lab = k.querySelector('.pk-label');
      var html = self._labelFor(m);
      if (!html) { if (lab) lab.remove(); return; }
      if (!lab) { lab = document.createElement('span'); lab.className = 'pk-label'; k.appendChild(lab); }
      lab.innerHTML = html;
    });
  };

  PianoKeyboard.prototype.setLabels = function (mode, blackLabels) {
    this.opts.labels = mode;
    if (blackLabels != null) this.opts.blackLabels = blackLabels;
    this._renderLabels();
  };

  PianoKeyboard.prototype.setKeyHints = function (map) {
    var self = this;
    this.hints = map || {};
    Object.keys(this.keys).forEach(function (m) {
      var k = self.keys[m];
      var h = k.querySelector('.pk-hint');
      var txt = self.hints[m];
      if (!txt) { if (h) h.remove(); return; }
      if (!h) { h = document.createElement('span'); h.className = 'pk-hint'; k.appendChild(h); }
      h.textContent = txt;
    });
  };

  PianoKeyboard.prototype.setRange = function (start, end) {
    var hl = this._hlState;
    this.opts.start = start; this.opts.end = end;
    this._unbind();
    this.keys = {};
    this._build();
    if (this.hints) this.setKeyHints(this.hints);
    if (hl) { var self = this; hl.forEach(function (h) { self.setHighlight(h.notes, h.opts, true); }); }
  };

  PianoKeyboard.prototype._keyAt = function (x, y) {
    var t = document.elementFromPoint(x, y);
    if (!t) return null;
    var k = t.closest('.pk-key');
    if (!k || !this.inner.contains(k)) return null;
    return +k.dataset.midi;
  };

  PianoKeyboard.prototype._bind = function () {
    var self = this, pk = this.pk;
    this._h = {
      down: function (e) {
        if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
        var m = self._keyAt(e.clientX, e.clientY);
        if (m == null) return;
        e.preventDefault();
        try { pk.setPointerCapture(e.pointerId); } catch (err) { /* */ }
        self.pointers.set(e.pointerId, m);
        // 按键位置越靠下，力度越大
        var rect = self.keys[m].getBoundingClientRect();
        var vel = Math.max(0.35, Math.min(1, 0.45 + 0.6 * (e.clientY - rect.top) / rect.height));
        self._on(m, vel);
      },
      move: function (e) {
        if (!self.pointers.has(e.pointerId)) return;
        var m = self._keyAt(e.clientX, e.clientY);
        var prev = self.pointers.get(e.pointerId);
        if (m === prev) return;
        if (prev != null) self._off(prev);
        self.pointers.set(e.pointerId, m);
        if (m != null) self._on(m, 0.7);
      },
      up: function (e) {
        if (!self.pointers.has(e.pointerId)) return;
        var prev = self.pointers.get(e.pointerId);
        self.pointers.delete(e.pointerId);
        if (prev != null) self._off(prev);
      },
      ctx: function (e) { e.preventDefault(); }
    };
    pk.addEventListener('pointerdown', this._h.down);
    pk.addEventListener('pointermove', this._h.move);
    pk.addEventListener('pointerup', this._h.up);
    pk.addEventListener('pointercancel', this._h.up);
    pk.addEventListener('lostpointercapture', this._h.up);
    pk.addEventListener('contextmenu', this._h.ctx);
  };

  PianoKeyboard.prototype._unbind = function () {
    if (!this._h || !this.pk) return;
    var pk = this.pk, h = this._h;
    pk.removeEventListener('pointerdown', h.down);
    pk.removeEventListener('pointermove', h.move);
    pk.removeEventListener('pointerup', h.up);
    pk.removeEventListener('pointercancel', h.up);
    pk.removeEventListener('lostpointercapture', h.up);
    pk.removeEventListener('contextmenu', h.ctx);
  };

  PianoKeyboard.prototype._on = function (m, vel) {
    this.held[m] = (this.held[m] || 0) + 1;
    this.press(m);
    if (this.opts.sound) global.Sound.noteOn(m, vel == null ? this.opts.velocity : vel, { instrument: this.opts.instrument, key: 'kb:' + m });
    if (this.opts.onNoteOn) this.opts.onNoteOn(m, vel);
  };
  PianoKeyboard.prototype._off = function (m) {
    if (this.held[m]) this.held[m]--;
    this.release(m);
    if (this.opts.sound) global.Sound.noteOff(m, { key: 'kb:' + m });
    if (this.opts.onNoteOff) this.opts.onNoteOff(m);
  };

  /** 外部触发（如电脑键盘、MIDI）：发声 + 按下效果 + 回调 */
  PianoKeyboard.prototype.noteOn = function (m, vel) { this._on(toMidi(m), vel); };
  PianoKeyboard.prototype.noteOff = function (m) { this._off(toMidi(m)); };

  /** 仅视觉效果 */
  PianoKeyboard.prototype.press = function (m) {
    m = toMidi(m);
    this.down[m] = (this.down[m] || 0) + 1;
    var k = this.keys[m]; if (k) k.classList.add('down');
  };
  PianoKeyboard.prototype.release = function (m) {
    m = toMidi(m);
    this.down[m] = Math.max(0, (this.down[m] || 0) - 1);
    if (!this.down[m]) { var k = this.keys[m]; if (k) k.classList.remove('down'); }
  };
  PianoKeyboard.prototype.releaseAll = function () {
    var self = this;
    this.down = {};
    Object.keys(this.keys).forEach(function (m) { self.keys[m].classList.remove('down'); });
  };
  PianoKeyboard.prototype.flash = function (m, ms) {
    var self = this;
    m = toMidi(m);
    this.press(m);
    setTimeout(function () { self.release(m); }, ms || 350);
  };
  /** 当前被"真正按住"的音（鼠标/触屏/电脑键盘/MIDI），不包含示范播放时的视觉点亮 */
  PianoKeyboard.prototype.pressedNotes = function () {
    var self = this;
    return Object.keys(this.held).filter(function (m) { return self.held[m] > 0; }).map(Number).sort(function (a, b) { return a - b; });
  };

  /**
   * 高亮一组音
   * opts.cls: 'hl'（紫）| 'hl2'（橙）| 'hl3'（绿）
   * opts.badges: 数组（与 notes 一一对应的小标签）| 'name'（按传入拼写显示音名）| 'degree'（1,2,3…）| null
   */
  PianoKeyboard.prototype.setHighlight = function (notes, opts, keepOthers) {
    opts = opts || {};
    var cls = opts.cls || 'hl';
    if (!keepOthers) this.clearHighlight(cls);
    var list = typeof notes === 'string' ? notes.split(/[\s,]+/).filter(Boolean) : (notes || []);
    var self = this;
    this._hlState = (this._hlState || []).filter(function (h) { return (h.opts.cls || 'hl') !== cls; });
    this._hlState.push({ notes: list, opts: opts });
    list.forEach(function (n, i) {
      var m = toMidi(n);
      var k = self.keys[m];
      if (!k) return;
      k.classList.add(cls);
      var badge = null;
      if (Array.isArray(opts.badges)) badge = opts.badges[i];
      else if (opts.badges === 'name') badge = typeof n === 'number' ? global.MT.pcName(global.MT.fromMidi(n)) : global.MT.pcName(n);
      else if (opts.badges === 'degree') badge = String(i + 1);
      if (badge != null && badge !== '') {
        var b = document.createElement('span');
        b.className = 'pk-badge';
        b.dataset.cls = cls;
        b.textContent = badge;
        k.appendChild(b);
      }
    });
  };

  PianoKeyboard.prototype.clearHighlight = function (cls) {
    var self = this;
    var classes = cls ? [cls] : ['hl', 'hl2', 'hl3'];
    Object.keys(this.keys).forEach(function (m) {
      var k = self.keys[m];
      classes.forEach(function (c) { k.classList.remove(c); });
      k.querySelectorAll('.pk-badge').forEach(function (b) { if (!cls || b.dataset.cls === cls) b.remove(); });
    });
    if (!cls) this._hlState = [];
    else this._hlState = (this._hlState || []).filter(function (h) { return (h.opts.cls || 'hl') !== cls; });
  };

  /** 把某个键滚动到可见区域（键盘较宽、横向滚动时） */
  PianoKeyboard.prototype.scrollTo = function (m) {
    var k = this.keys[toMidi(m)];
    if (!k) return;
    var wrap = this.el;
    var kr = k.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    wrap.scrollLeft += (kr.left + kr.width / 2) - (wr.left + wr.width / 2);
  };

  PianoKeyboard.prototype.destroy = function () { this._unbind(); this.el.innerHTML = ''; };

  global.PianoKeyboard = PianoKeyboard;
})(window);
