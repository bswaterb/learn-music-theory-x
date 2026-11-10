/*!
 * audio.js — 基于 Web Audio API 的合成器（无需任何音频文件）
 * 全局对象：window.Sound
 *
 * 常用 API：
 *   Sound.playNote('C4', { duration: 1, velocity: 0.8, delay: 0, at: <绝对时间>, instrument })
 *   Sound.playChord(['C4','E4','G4'], { duration: 1.5, strum: 0.02 })
 *   Sound.playArpeggio(['C4','E4','G4'], { gap: 0.25, duration: 1, hold: true })
 *   Sound.playSequence(events, { bpm, onEvent, onEnd, countIn, click }) → { stop() }
 *       events: [{ notes: ['C4'] | [] (休止), beats: 1, velocity?, staccato? }]
 *   Sound.playFrequency(440, { duration, type: 'sine' })
 *   Sound.startTone(440) → { setFrequency(hz), setVolume(v), stop() }    持续音（滑块演示用）
 *   Sound.noteOn(midi, velocity) / Sound.noteOff(midi) / Sound.setSustain(bool)   实时演奏
 *   Sound.click(time, { accent, level, sound: 'wood'|'beep'|'tick' })     节拍器滴答声
 *   Sound.drum('kick'|'snare'|'hat'|'clap', time, velocity)
 *   Sound.createClock({ bpm, ticksPerBeat, onTick(tick, time) }) → { start(), stop(), setBpm() }  精确调度器
 *   Sound.at(time, fn)  在音频时钟的某个时间点执行界面更新
 *   Sound.stopAll()
 *
 * 省资源（音频引擎自动休眠）：
 *   没有任何声音、时钟、实时按键、hold 时，静默 settings.sleepAfter 秒（默认 30）后自动 suspend，
 *   下次播放时自动唤醒。Sound.state → 'off' | 'running' | 'sleeping' | 'suspended' | 'closed'
 *   Sound.hold('麦克风') → release()   需要引擎一直运行时（如麦克风分析）调用，用完调用 release
 *   Sound.claim(handle, '节拍器')       独占播放，第二个参数是显示在「服务管理」里的名称
 *   Sound.sleep()                       停止所有声音并立即休眠
 *   Sound.on(fn) 事件：'engine'（引擎状态变化）'player'（当前播放器变化）'settings' 'stopall' 'noteon' 'noteoff'
 */
(function (global) {
  'use strict';

  var STORE_KEY = 'mt-audio';
  var settings = { volume: 0.8, instrument: 'piano', reverb: 0.18, sleepAfter: 30 };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (e) { /* ignore */ }

  var INSTRUMENTS = [
    { id: 'piano', zh: '钢琴' },
    { id: 'epiano', zh: '电钢琴' },
    { id: 'organ', zh: '风琴' },
    { id: 'guitar', zh: '吉他（拨弦）' },
    { id: 'sine', zh: '纯音（正弦波）' }
  ];

  var ctx = null, master, limiter, bus, convolver, reverbGain, clickBus;
  var waves = {}, noiseBuf = null, ksCache = {};
  var tracked = new Set();      // 所有正在发声/已调度的声部
  var live = new Map();         // 实时演奏：midi → voice
  var sustained = new Set();
  var sustainOn = false;
  var listeners = [];
  var sleptByUs = false;        // 是我们为了省资源主动休眠的（区别于浏览器自动播放策略导致的 suspended）
  var holds = new Map(), holdSeq = 0;
  var clocks = new Set();
  var lastActive = Date.now();
  var idleTimer = null;

  function saveSettings() { try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } }

  function ensure() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { alert('你的浏览器不支持 Web Audio，无法播放声音。请使用最新版 Chrome / Edge / Safari / Firefox。'); throw new Error('No WebAudio'); }
      ctx = new AC({ latencyHint: 'interactive' });
      ctx.onstatechange = function () { if (ctx.state === 'running') sleptByUs = false; emit('engine', engineState()); };
      idleTimer = setInterval(checkIdle, 2000);
      limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10; limiter.knee.value = 10; limiter.ratio.value = 8;
      limiter.attack.value = 0.003; limiter.release.value = 0.2;
      master = ctx.createGain(); master.gain.value = settings.volume;
      bus = ctx.createGain(); bus.gain.value = 1;
      convolver = ctx.createConvolver(); convolver.buffer = makeImpulse(2.6, 3.2);
      reverbGain = ctx.createGain(); reverbGain.gain.value = settings.reverb;
      clickBus = ctx.createGain(); clickBus.gain.value = 1;
      bus.connect(master);
      bus.connect(convolver); convolver.connect(reverbGain); reverbGain.connect(master);
      clickBus.connect(master);
      master.connect(limiter); limiter.connect(ctx.destination);
      emit('engine', engineState());
    }
    if (ctx.state === 'suspended') ctx.resume();
    lastActive = Date.now();
    return ctx;
  }

  // 浏览器自动播放策略：首次用户交互时解锁音频（我们主动休眠的引擎不在这里唤醒，等真正播放时再唤醒）
  function unlockOnce() { try { ensure(); } catch (e) { /* ignore */ } }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    global.addEventListener(ev, function h() { if (ctx && ctx.state === 'suspended' && !sleptByUs) ctx.resume(); }, { passive: true });
  });

  /* ---- 省资源：静默一段时间后自动休眠 ---- */
  function busy() { return clocks.size > 0 || holds.size > 0 || live.size > 0 || sustained.size > 0 || tracked.size > 0; }
  function engineState() {
    if (!ctx) return 'off';
    if (ctx.state === 'suspended') return sleptByUs ? 'sleeping' : 'suspended';
    return ctx.state; // running | closed | interrupted
  }
  function suspendNow() {
    if (!ctx || ctx.state !== 'running') return false;
    sleptByUs = true;
    ctx.suspend().then(function () { emit('engine', engineState()); }, function () { /* */ });
    return true;
  }
  function checkIdle() {
    if (!ctx || ctx.state !== 'running') return;
    if (busy()) { lastActive = Date.now(); return; }
    var limit = +settings.sleepAfter;
    if (limit > 0 && Date.now() - lastActive >= limit * 1000) suspendNow();
  }
  /** 申请"保持引擎运行"（例如麦克风分析需要音频时钟一直走），返回释放函数 */
  function hold(label) {
    var id = ++holdSeq;
    holds.set(id, label || '占用中');
    ensure();
    emit('engine', engineState());
    var released = false;
    return function release() {
      if (released) return; released = true;
      holds.delete(id); lastActive = Date.now();
      emit('engine', engineState());
    };
  }
  /** 停止所有声音并立即休眠；有 hold（如麦克风）时只停止声音，返回是否已休眠 */
  function sleep() {
    stopAll();
    if (!ctx || holds.size || clocks.size) return false;
    setTimeout(function () { if (!holds.size && !clocks.size && !live.size) suspendNow(); }, 350); // 等释放的余音淡出，避免爆音
    return true;
  }
  function engineInfo() {
    var labels = []; holds.forEach(function (l) { labels.push(l); });
    return {
      state: engineState(), busy: !!ctx && busy(), holds: labels, clocks: clocks.size, voices: tracked.size + live.size,
      player: currentPlayer ? playerLabel() : null, sleepAfter: +settings.sleepAfter,
      idleFor: ctx && ctx.state === 'running' && !busy() ? Math.round((Date.now() - lastActive) / 1000) : 0
    };
  }

  function makeImpulse(seconds, decay) {
    var rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    var buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        var t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < rate * 0.004 ? i / (rate * 0.004) : 1);
      }
    }
    return buf;
  }

  function noise() {
    if (noiseBuf) return noiseBuf;
    var len = Math.floor(ctx.sampleRate * 1);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function wave(name) {
    if (waves[name]) return waves[name];
    var h;
    switch (name) {
      case 'piano': h = [0, 1, 0.55, 0.32, 0.22, 0.12, 0.09, 0.06, 0.04, 0.03, 0.02, 0.012, 0.008]; break;
      case 'organ': h = [0, 1, 0.75, 0.5, 0.0, 0.32, 0, 0, 0.22, 0, 0, 0, 0.1, 0, 0, 0, 0.06]; break;
      default: h = [0, 1];
    }
    var real = new Float32Array(h.length), imag = new Float32Array(h);
    waves[name] = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    return waves[name];
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function toMidi(x) {
    if (typeof x === 'number') return x;
    if (global.MT) return global.MT.toMidi(x);
    return NaN;
  }

  /* ---------------- 声部（Voice） ---------------- */
  function Voice(gainNode, sources, releaseTau, extraStop) {
    this.gain = gainNode; this.sources = sources; this.tau = releaseTau || 0.08; this.ended = false; this.extraStop = extraStop;
    this.releaseAt = Infinity;
    tracked.add(this);
    var self = this;
    if (sources[0]) sources[0].onended = function () { self.ended = true; tracked.delete(self); try { self.gain.disconnect(); } catch (e) { /* */ } };
  }
  Voice.prototype.release = function (at) {
    if (this.ended) return;
    var t = Math.max(at == null ? ctx.currentTime : at, ctx.currentTime);
    if (t >= this.releaseAt) return;
    this.releaseAt = t;
    var g = this.gain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0, t, this.tau);
    var stopAt = t + this.tau * 7;
    this.sources.forEach(function (s) { try { s.stop(stopAt); } catch (e) { /* */ } });
  };
  Voice.prototype.stopNow = function () {
    if (this.ended) return;
    this.releaseAt = -1;
    var t = ctx.currentTime;
    var g = this.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.03);
    this.sources.forEach(function (s) { try { s.stop(t + 0.05); } catch (e) { /* */ } });
  };

  // 不同音高的响度补偿（高音听起来更刺，低音略弱）
  function keyScale(midi) { return clamp(1.15 - (midi - 60) * 0.008, 0.6, 1.35); }

  function pianoVoice(freq, midi, t, vel, out) {
    var g = ctx.createGain();
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
    var bright = clamp(freq * (3 + 9 * vel) + 600, 900, 14000);
    var dark = clamp(freq * 2.2 + 400, 500, 6000);
    lp.frequency.setValueAtTime(bright, t);
    lp.frequency.setTargetAtTime(dark, t + 0.01, 0.45);
    var o1 = ctx.createOscillator(); o1.setPeriodicWave(wave('piano')); o1.frequency.value = freq;
    var o2 = ctx.createOscillator(); o2.setPeriodicWave(wave('piano')); o2.frequency.value = freq; o2.detune.value = 5;
    var o3 = ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = freq;
    var g2 = ctx.createGain(); g2.gain.value = 0.55;
    var g3 = ctx.createGain(); g3.gain.value = 0.45;
    o1.connect(lp); o2.connect(g2); g2.connect(lp); o3.connect(g3); g3.connect(g);
    lp.connect(g); g.connect(out);
    var peak = 0.26 * vel * keyScale(midi);
    var decay = clamp(3.6 - (midi - 40) * 0.05, 0.7, 5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    g.gain.setTargetAtTime(peak * 0.42, t + 0.006, 0.09);
    g.gain.setTargetAtTime(0.00001, t + 0.25, decay / 3.2);
    // 琴槌敲击声
    var nz = ctx.createBufferSource(); nz.buffer = noise();
    var nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = clamp(freq * 4, 800, 6000); nf.Q.value = 0.9;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.045 * vel, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    nz.connect(nf); nf.connect(ng); ng.connect(g);
    var srcs = [o1, o2, o3];
    srcs.forEach(function (s) { s.start(t); s.stop(t + decay * 2.6 + 0.3); });
    nz.start(t); nz.stop(t + 0.05);
    return new Voice(g, srcs.concat([nz]), 0.12);
  }

  function epianoVoice(freq, midi, t, vel, out) {
    var g = ctx.createGain();
    var car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = freq;
    var mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = freq;
    var mg = ctx.createGain();
    mg.gain.setValueAtTime(freq * (1.2 + 2.2 * vel), t);
    mg.gain.setTargetAtTime(freq * 0.25, t, 0.35);
    mod.connect(mg); mg.connect(car.frequency);
    // 铃声泛音
    var bell = ctx.createOscillator(); bell.type = 'sine'; bell.frequency.value = freq * 7.02;
    var bg = ctx.createGain(); bg.gain.setValueAtTime(0.05 * vel, t); bg.gain.setTargetAtTime(0, t, 0.06);
    bell.connect(bg); bg.connect(g);
    car.connect(g); g.connect(out);
    var peak = 0.3 * vel * keyScale(midi);
    var decay = clamp(3.2 - (midi - 48) * 0.04, 0.8, 4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.setTargetAtTime(peak * 0.5, t + 0.004, 0.25);
    g.gain.setTargetAtTime(0.00001, t + 0.4, decay / 3);
    var srcs = [car, mod, bell];
    srcs.forEach(function (s) { s.start(t); s.stop(t + decay * 2.8 + 0.5); });
    return new Voice(g, srcs, 0.1);
  }

  function organVoice(freq, midi, t, vel, out) {
    var g = ctx.createGain();
    var o = ctx.createOscillator(); o.setPeriodicWave(wave('organ')); o.frequency.value = freq;
    var vib = ctx.createOscillator(); vib.frequency.value = 5.6;
    var vg = ctx.createGain(); vg.gain.value = 3.5;
    vib.connect(vg); vg.connect(o.detune);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = clamp(freq * 10, 2000, 9000);
    o.connect(lp); lp.connect(g); g.connect(out);
    var peak = 0.16 * vel * keyScale(midi);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    o.start(t); vib.start(t);
    return new Voice(g, [o, vib], 0.05);
  }

  function sineVoice(freq, midi, t, vel, out, type) {
    var g = ctx.createGain();
    var o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
    o.connect(g); g.connect(out);
    var peak = 0.3 * vel * (midi ? keyScale(midi) : 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
    o.start(t);
    return new Voice(g, [o], 0.05);
  }

  function ksBuffer(midi) {
    if (ksCache[midi]) return ksCache[midi];
    var sr = ctx.sampleRate, freq = mtof(midi);
    var N = Math.max(2, Math.round(sr / freq));
    var T = clamp(4.5 - (midi - 40) * 0.06, 1.2, 5);
    var len = Math.floor(sr * T);
    var buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    var ring = new Float32Array(N), prev = 0;
    for (var i = 0; i < N; i++) { var r = Math.random() * 2 - 1; prev = prev * 0.45 + r * 0.55; ring[i] = prev; }
    var decay = Math.pow(0.001, 1 / (freq * T)) * 1.0;
    var idx = 0;
    for (var j = 0; j < len; j++) {
      var a = ring[idx], b = ring[(idx + 1) % N];
      d[j] = a;
      ring[idx] = (a + b) * 0.5 * decay;
      idx = (idx + 1) % N;
    }
    var buffer = { buf: buf, rate: (freq * N) / sr, len: T };
    ksCache[midi] = buffer;
    return buffer;
  }

  function guitarVoice(freq, midi, t, vel, out) {
    var k = ksBuffer(Math.round(midi));
    var src = ctx.createBufferSource(); src.buffer = k.buf; src.playbackRate.value = k.rate * (freq / mtof(Math.round(midi)));
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = clamp(freq * 6 + 1500 * vel, 1500, 9000);
    var g = ctx.createGain(); g.gain.value = 0.55 * vel * keyScale(midi);
    src.connect(lp); lp.connect(g); g.connect(out);
    src.start(t); src.stop(t + k.len);
    return new Voice(g, [src], 0.09);
  }

  function makeVoice(midi, t, vel, instrument, freqOverride) {
    ensure();
    var freq = freqOverride || mtof(midi);
    if (!midi && freqOverride) midi = 69 + 12 * Math.log2(freqOverride / 440);
    vel = vel == null ? 0.8 : clamp(vel, 0.05, 1);
    switch (instrument || settings.instrument) {
      case 'epiano': return epianoVoice(freq, midi, t, vel, bus);
      case 'organ': return organVoice(freq, midi, t, vel, bus);
      case 'guitar': return guitarVoice(freq, midi, t, vel, bus);
      case 'sine': return sineVoice(freq, midi, t, vel, bus);
      case 'triangle': return sineVoice(freq, midi, t, vel, bus, 'triangle');
      case 'square': return sineVoice(freq, midi, t, vel * 0.4, bus, 'square');
      case 'sawtooth': return sineVoice(freq, midi, t, vel * 0.4, bus, 'sawtooth');
      default: return pianoVoice(freq, midi, t, vel, bus);
    }
  }

  /* ---------------- 播放 API ---------------- */
  function startTime(opts) {
    ensure();
    if (opts && opts.at != null) return opts.at;
    return ctx.currentTime + 0.01 + ((opts && opts.delay) || 0);
  }

  function playNote(note, opts) {
    opts = opts || {};
    var midi = toMidi(note);
    if (!isFinite(midi)) return null;
    var t = startTime(opts);
    var v = makeVoice(midi, t, opts.velocity, opts.instrument);
    v.midi = midi;
    v.release(t + (opts.duration == null ? 1.2 : opts.duration));
    return v;
  }

  function playChord(notes, opts) {
    opts = opts || {};
    var t = startTime(opts);
    var strum = opts.strum || 0;
    var list = (typeof notes === 'string' ? notes.split(/[\s,]+/) : notes).filter(function (x) { return x !== '' && x != null; });
    var vel = opts.velocity == null ? 0.75 : opts.velocity;
    var scaleVel = list.length > 3 ? vel * Math.sqrt(3 / list.length) : vel;
    return list.map(function (n, i) {
      return playNote(n, { at: t + i * strum, duration: (opts.duration == null ? 1.6 : opts.duration) - i * strum, velocity: scaleVel, instrument: opts.instrument });
    });
  }

  function playArpeggio(notes, opts) {
    opts = opts || {};
    var t = startTime(opts);
    var gap = opts.gap == null ? 0.28 : opts.gap;
    var list = (typeof notes === 'string' ? notes.split(/[\s,]+/) : notes).filter(Boolean);
    var total = gap * (list.length - 1) + (opts.duration == null ? 1.2 : opts.duration);
    return list.map(function (n, i) {
      return playNote(n, { at: t + i * gap, duration: opts.hold === false ? (opts.duration || gap * 0.95) : total - i * gap, velocity: opts.velocity, instrument: opts.instrument });
    });
  }

  function playFrequency(hz, opts) {
    opts = opts || {};
    var t = startTime(opts);
    var inst = opts.type || opts.instrument || 'sine';
    var v = makeVoice(null, t, opts.velocity == null ? 0.7 : opts.velocity, inst, hz);
    v.release(t + (opts.duration == null ? 1.2 : opts.duration));
    return v;
  }

  /** 持续音：用于频率滑块等演示 */
  function startTone(hz, opts) {
    opts = opts || {};
    ensure();
    var t = ctx.currentTime;
    var g = ctx.createGain();
    var o = ctx.createOscillator(); o.type = opts.type || 'sine'; o.frequency.setValueAtTime(hz, t);
    o.connect(g); g.connect(opts.dry ? master : bus);
    var vol = opts.volume == null ? 0.28 : opts.volume;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.04);
    o.start(t);
    var stopped = false;
    var handle = {
      osc: o, gain: g,
      setFrequency: function (f, glide) { if (!stopped) o.frequency.setTargetAtTime(f, ctx.currentTime, glide == null ? 0.02 : glide); },
      setVolume: function (v) { if (!stopped) g.gain.setTargetAtTime(Math.max(0.0001, v), ctx.currentTime, 0.03); },
      stop: function () {
        if (stopped) return; stopped = true;
        var now = ctx.currentTime;
        g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0, now, 0.04);
        o.stop(now + 0.3); tracked.delete(handle);
      },
      release: function () { handle.stop(); },
      stopNow: function () { handle.stop(); }
    };
    tracked.add(handle);
    return handle;
  }

  /* ---- 实时演奏（键盘按下/抬起） ---- */
  function noteOn(midi, velocity, opts) {
    opts = opts || {};
    ensure();
    var key = opts.key != null ? opts.key : midi;
    if (live.has(key)) live.get(key).release(ctx.currentTime);
    var v = makeVoice(midi, ctx.currentTime + 0.002, velocity == null ? 0.8 : velocity, opts.instrument);
    v.midi = midi;
    live.set(key, v);
    emit('noteon', midi);
    return v;
  }
  function noteOff(midi, opts) {
    opts = opts || {};
    var key = opts.key != null ? opts.key : midi;
    var v = live.get(key);
    if (!v) return;
    live.delete(key);
    if (sustainOn) sustained.add(v); else v.release(ctx.currentTime);
    emit('noteoff', midi);
  }
  function setSustain(on) {
    sustainOn = !!on;
    if (!sustainOn) { sustained.forEach(function (v) { v.release(); }); sustained.clear(); }
  }
  function allNotesOff() {
    live.forEach(function (v) { v.release(); }); live.clear();
    sustained.forEach(function (v) { v.release(); }); sustained.clear();
  }

  /* ---- 节拍器声音 ---- */
  function click(time, opts) {
    opts = opts || {};
    ensure();
    var t = time == null ? ctx.currentTime + 0.01 : time;
    var level = (opts.level == null ? 1 : opts.level) * (opts.volume == null ? 1 : opts.volume);
    var accent = opts.accent === true ? 2 : (opts.accent || 0); // 0 弱拍 1 次强 2 强拍
    var sound = opts.sound || 'wood';
    var g = ctx.createGain(); g.connect(clickBus);
    if (sound === 'beep') {
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = accent === 2 ? 1760 : accent === 1 ? 1320 : 880;
      o.connect(g);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * level, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.start(t); o.stop(t + 0.08);
    } else if (sound === 'tick') {
      var n = ctx.createBufferSource(); n.buffer = noise();
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = accent === 2 ? 2500 : 5000;
      n.connect(hp); hp.connect(g);
      g.gain.setValueAtTime((accent === 2 ? 0.9 : 0.55) * level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
      n.start(t); n.stop(t + 0.04);
    } else {
      // 木鱼
      var f = accent === 2 ? 1250 : accent === 1 ? 1000 : 820;
      var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(f * 1.6, t); o2.frequency.exponentialRampToValueAtTime(f, t + 0.012);
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 3;
      var nn = ctx.createBufferSource(); nn.buffer = noise();
      var ng = ctx.createGain(); ng.gain.setValueAtTime(0.35 * level, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
      nn.connect(bp); bp.connect(ng); ng.connect(g);
      o2.connect(g);
      var peak = (accent === 2 ? 0.75 : accent === 1 ? 0.55 : 0.42) * level;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o2.start(t); o2.stop(t + 0.09); nn.start(t); nn.stop(t + 0.04);
    }
  }

  /* ---- 鼓 ---- */
  function drum(type, time, velocity) {
    ensure();
    var t = time == null ? ctx.currentTime + 0.01 : time;
    var v = velocity == null ? 0.8 : velocity;
    var g = ctx.createGain(); g.connect(clickBus);
    if (type === 'kick') {
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      o.connect(g);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9 * v, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      o.start(t); o.stop(t + 0.45);
    } else if (type === 'snare' || type === 'clap') {
      var n = ctx.createBufferSource(); n.buffer = noise();
      var hp = ctx.createBiquadFilter(); hp.type = type === 'clap' ? 'bandpass' : 'highpass';
      hp.frequency.value = type === 'clap' ? 1400 : 1200; if (type === 'clap') hp.Q.value = 0.8;
      n.connect(hp); hp.connect(g);
      if (type === 'snare') {
        var tri = ctx.createOscillator(); tri.type = 'triangle'; tri.frequency.setValueAtTime(220, t); tri.frequency.exponentialRampToValueAtTime(160, t + 0.08);
        var tg = ctx.createGain(); tg.gain.setValueAtTime(0.35 * v, t); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        tri.connect(tg); tg.connect(clickBus); tri.start(t); tri.stop(t + 0.12);
        g.gain.setValueAtTime(0.5 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      } else {
        g.gain.setValueAtTime(0.0001, t);
        [0, 0.012, 0.024].forEach(function (d) { g.gain.setValueAtTime(0.7 * v, t + d); g.gain.exponentialRampToValueAtTime(0.08 * v, t + d + 0.01); });
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      }
      n.start(t); n.stop(t + 0.25);
    } else {
      // hat
      var nh = ctx.createBufferSource(); nh.buffer = noise();
      var hh = ctx.createBiquadFilter(); hh.type = 'highpass'; hh.frequency.value = 7000;
      nh.connect(hh); hh.connect(g);
      var len = type === 'openhat' ? 0.3 : 0.05;
      g.gain.setValueAtTime(0.32 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      nh.start(t); nh.stop(t + len + 0.02);
    }
  }

  /* ---- 精确时钟（前瞻调度） ---- */
  function makeTimer(fn, interval) {
    var stopFn;
    try {
      var src = 'var id=null;onmessage=function(e){if(e.data==="start"){clearInterval(id);id=setInterval(function(){postMessage(0)},' + interval + ');}else{clearInterval(id);id=null;}};';
      var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      var w = new Worker(url);
      var fallback = null;
      w.onmessage = fn;
      w.onerror = function () { if (!fallback) fallback = setInterval(fn, interval); };
      w.postMessage('start');
      stopFn = function () { try { w.postMessage('stop'); w.terminate(); } catch (e) { /* */ } if (fallback) clearInterval(fallback); URL.revokeObjectURL(url); };
    } catch (e) {
      var id = setInterval(fn, interval);
      stopFn = function () { clearInterval(id); };
    }
    return stopFn;
  }

  /**
   * createClock({ bpm: 100, ticksPerBeat: 1, onTick: function (tick, time) {}, lookahead: 0.12 })
   * onTick 在"将要发声"之前被调用，time 是该拍在音频时钟上的精确时间
   */
  function createClock(opts) {
    opts = opts || {};
    var bpm = opts.bpm || 100;
    var tpb = opts.ticksPerBeat || 1;
    var lookahead = opts.lookahead || 0.12;
    var running = false, next = 0, tick = 0, stopTimer = null;
    function schedule() {
      if (!running) return;
      while (next < ctx.currentTime + lookahead) {
        try { opts.onTick(tick, next); } catch (e) { console.error(e); }
        next += 60 / bpm / tpb;
        tick++;
      }
    }
    var clock = {
      start: function (delay) {
        ensure();
        if (running) clock.stop();
        running = true; tick = 0; next = ctx.currentTime + (delay == null ? 0.06 : delay);
        clocks.add(clock);
        schedule();
        stopTimer = makeTimer(schedule, 25);
        emit('engine', engineState());
        return clock;
      },
      stop: function () {
        running = false; if (stopTimer) stopTimer(); stopTimer = null;
        if (clocks.delete(clock)) { lastActive = Date.now(); emit('engine', engineState()); }
      },
      setBpm: function (b) { bpm = clamp(b, 10, 600); },
      setTicksPerBeat: function (n) { tpb = Math.max(1, n); },
      get running() { return running; },
      get bpm() { return bpm; },
      get tick() { return tick; },
      get nextTime() { return next; }
    };
    return clock;
  }

  /** 在音频时钟的时间点执行回调（用于让界面高亮与声音同步），返回取消函数 */
  function at(time, fn) {
    ensure();
    var id = setTimeout(fn, Math.max(0, (time - ctx.currentTime) * 1000));
    return function () { clearTimeout(id); };
  }

  /* ---- 独占播放：同一时间只让一个"播放器"（序列/五线谱/和弦进行…）发声 ---- */
  var currentPlayer = null, currentLabel = '';
  /** 当前播放器的名称（label 可以是字符串，也可以是返回字符串的函数，用于显示实时信息如"节拍器 100 BPM"） */
  function playerLabel() {
    var l = currentLabel;
    if (typeof l === 'function') { try { l = l(); } catch (e) { l = ''; } }
    return l || '播放中';
  }
  /** 声明一个新的播放句柄（需带 stop 方法），会先停止之前的播放器；label 用于在「服务管理」里显示 */
  function claim(handle, label) {
    if (currentPlayer && currentPlayer !== handle) { var p = currentPlayer; currentPlayer = null; currentLabel = ''; try { p.stop(); } catch (e) { /* */ } }
    currentPlayer = handle;
    currentLabel = label || (handle && handle.label) || '';
    emit('player', playerLabel());
  }
  function unclaim(handle) {
    if (currentPlayer !== handle) return;
    currentPlayer = null; currentLabel = '';
    emit('player', null);
  }
  /** 停止当前的独占播放器（节拍器、五线谱播放等），不影响其他声音 */
  function stopPlayer() { if (currentPlayer) { var p = currentPlayer; try { p.stop(); } catch (e) { /* */ } if (currentPlayer === p) unclaim(p); } }

  /* ---- 序列播放 ---- */
  var currentSeq = null;
  /**
   * events: [{ notes: ['C4','E4'] 或 [] 表示休止, beats: 1, velocity?, staccato?, data? }]
   * opts: { bpm: 90, instrument, onEvent(ev, i, time), onEnd(), countIn: 拍数, click: 是否同时播放节拍器,
   *         beatsPerBar: 4, legato: 0.92, exclusive: true(停止其他序列) }
   */
  function playSequence(events, opts) {
    opts = opts || {};
    ensure();
    var bpm = opts.bpm || 90, spb = 60 / bpm;
    var t0 = ctx.currentTime + 0.08;
    var cancels = [], voices = [], stopped = false;
    var bpb = opts.beatsPerBar || 4;
    var countIn = opts.countIn || 0;
    for (var c = 0; c < countIn; c++) click(t0 + c * spb, { accent: c % bpb === 0 ? 2 : 0, sound: opts.clickSound });
    var t = t0 + countIn * spb;
    var total = 0;
    events.forEach(function (ev) { total += ev.beats == null ? 1 : ev.beats; });
    if (opts.click) {
      for (var b = 0; b < Math.ceil(total - 1e-6); b++) click(t + b * spb, { accent: b % bpb === 0 ? 2 : 0, level: 0.8, sound: opts.clickSound });
    }
    var legato = opts.legato == null ? 0.92 : opts.legato;
    events.forEach(function (ev, i) {
      var beats = ev.beats == null ? 1 : ev.beats;
      var dur = beats * spb;
      var notes = ev.notes || [];
      var holdBeats = ev.holdBeats != null ? ev.holdBeats : beats;
      notes.forEach(function (n) {
        var m = toMidi(n);
        if (!isFinite(m)) return;
        var v = makeVoice(m, t, ev.velocity == null ? (opts.velocity || 0.78) : ev.velocity, ev.instrument || opts.instrument);
        v.release(t + holdBeats * spb * (ev.staccato ? 0.32 : legato));
        voices.push(v);
      });
      (function (ev, i, tt) {
        if (opts.onEvent) cancels.push(at(tt, function () { if (!stopped) opts.onEvent(ev, i, tt); }));
      })(ev, i, t);
      t += dur;
    });
    var endTime = t;
    var handle = {
      startTime: t0 + countIn * spb, endTime: endTime, spb: spb,
      get playing() { return !stopped; },
      stop: function () {
        if (stopped) return; stopped = true;
        cancels.forEach(function (f) { f(); });
        voices.forEach(function (v) { v.release(); });
        if (currentSeq === handle) currentSeq = null;
        unclaim(handle);
        if (opts.onEnd) opts.onEnd(true);
      }
    };
    cancels.push(at(endTime + 0.05, function () {
      if (stopped) return; stopped = true;
      if (currentSeq === handle) currentSeq = null;
      unclaim(handle);
      if (opts.onEnd) opts.onEnd(false);
    }));
    if (opts.exclusive !== false) claim(handle, opts.label || '乐谱播放');
    currentSeq = handle;
    return handle;
  }

  function stopAll() {
    if (currentPlayer) { var p = currentPlayer; currentPlayer = null; currentLabel = ''; try { p.stop(); } catch (e) { /* */ } emit('player', null); }
    if (currentSeq) currentSeq.stop();
    allNotesOff();
    tracked.forEach(function (v) { try { v.release(); } catch (e) { /* */ } });
    emit('stopall');
  }

  /* ---- 事件 ---- */
  function on(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }
  function emit(type, data) { listeners.forEach(function (f) { try { f(type, data); } catch (e) { /* */ } }); }

  /* ---- 设置 ---- */
  function setVolume(v) { settings.volume = clamp(v, 0, 1); if (master) master.gain.setTargetAtTime(settings.volume, ctx.currentTime, 0.02); saveSettings(); emit('settings', settings); }
  function setInstrument(id) { settings.instrument = id; saveSettings(); emit('settings', settings); }
  function setReverb(v) { settings.reverb = clamp(v, 0, 1); if (reverbGain) reverbGain.gain.setTargetAtTime(settings.reverb, ctx.currentTime, 0.02); saveSettings(); emit('settings', settings); }
  /** 静默多少秒后自动休眠（0 = 从不） */
  function setSleepAfter(sec) { settings.sleepAfter = Math.max(0, Math.round(+sec || 0)); lastActive = Date.now(); saveSettings(); emit('settings', settings); }

  // 其他标签页（或服务面板里的工具）改了声音设置时同步过来
  global.addEventListener('storage', function (e) {
    if (e.key !== STORE_KEY || !e.newValue) return;
    try { Object.assign(settings, JSON.parse(e.newValue)); } catch (err) { return; }
    if (master) master.gain.setTargetAtTime(settings.volume, ctx.currentTime, 0.02);
    if (reverbGain) reverbGain.gain.setTargetAtTime(settings.reverb, ctx.currentTime, 0.02);
    emit('settings', settings);
  });

  global.Sound = {
    INSTRUMENTS: INSTRUMENTS,
    settings: settings,
    get ctx() { return ensure(); },
    get context() { return ctx; },
    get master() { ensure(); return master; },
    get output() { ensure(); return bus; },
    get state() { return engineState(); },
    get player() { return currentPlayer ? playerLabel() : null; },
    now: function () { return ensure().currentTime; },
    unlock: unlockOnce, ensure: ensure,
    playNote: playNote, playChord: playChord, playArpeggio: playArpeggio, playFrequency: playFrequency, startTone: startTone,
    noteOn: noteOn, noteOff: noteOff, setSustain: setSustain, allNotesOff: allNotesOff,
    get sustain() { return sustainOn; },
    click: click, drum: drum, createClock: createClock, at: at,
    playSequence: playSequence, stopAll: stopAll, stopPlayer: stopPlayer, claim: claim, unclaim: unclaim,
    hold: hold, sleep: sleep, engineInfo: engineInfo,
    setVolume: setVolume, setInstrument: setInstrument, setReverb: setReverb, setSleepAfter: setSleepAfter,
    on: on, mtof: mtof
  };
})(window);
