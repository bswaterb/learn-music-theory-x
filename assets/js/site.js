/*!
 * site.js — 站点框架：顶栏、侧栏导航、本页目录、进度、主题、声音设置、搜索，
 *           以及页面内各种"声明式"小组件的自动初始化。
 * 全局对象：window.MTSite
 *
 * 页面约定：<body data-page="ch01" data-root="..">  （根目录的 index.html 用 data-root="."）
 *
 * 声明式组件（写 HTML 即可，无需 JS）：
 *   播放按钮  <button data-play="C4 E4 G4" data-mode="chord">C 大三和弦</button>
 *             data-mode: seq(默认，逐个播放) | chord(同时) | arp(琶音) | arp-chord(先琶音再柱式) | melody(带时值记谱语法)
 *                        | freq(频率 Hz，空格分隔) | progression(和弦用 | 分隔，如 "C4 E4 G4 | F4 A4 C5")
 *             可选：data-bpm data-beats="1 1 2" data-dur data-gap data-instrument data-velocity data-click data-count-in
 *                   data-click-sound="wood|beep|tick"（节拍器音色）；只听节拍器：data-play="R R R R" data-click
 *                   data-kb="#某个键盘的id"（播放时在该键盘上点亮按键）data-together(freq 模式同时发声) data-wave
 *   钢琴键盘  <div data-keyboard="C4-B5" data-labels="name" data-highlight="C4 E4 G4" data-badges="name"></div>
 *   五线谱    <div data-staff="C4:q D4 E4 F4 | G4:w |]" data-clef="treble" data-time="4/4" data-names="name"></div>
 *             大谱表：<div data-staff="grand" data-treble="…" data-bass="…"></div>
 *   简谱      <div data-jianpu="1 1 5 5 | 6 6 5 - |" data-key="C" data-time="4/4" data-lyrics="一 闪 一 闪 亮 晶 晶"></div>
 *   节拍器    <div data-metronome data-bpm="80" data-beats="4"></div>
 *   测验      <div class="quiz" data-answer="2"><p class="quiz-q">…</p><ol class="quiz-opts"><li>…</li></ol><div class="quiz-explain">…</div></div>
 */
(function (global) {
  'use strict';

  var NAV = {
    chapters: [
      { id: 'ch01', num: 1, title: '声音与音高', desc: '声音从哪里来？什么是频率、八度和半音？从"听"开始认识音乐的原材料。', href: 'chapters/01-sound.html', time: 15 },
      { id: 'ch02', num: 2, title: '音名、唱名与键盘', desc: 'CDEFGAB、do re mi 和 1234567 的关系，在钢琴上找到每一个音。', href: 'chapters/02-keyboard.html', time: 20 },
      { id: 'ch03', num: 3, title: '看懂乐谱：五线谱与简谱', desc: '谱号、线与间、加线，配合口诀快速认出谱上的每个音。', href: 'chapters/03-notation.html', time: 30 },
      { id: 'ch04', num: 4, title: '节奏与节拍', desc: '拍子、音符时值、休止符、拍号、附点与切分，跟着节拍器打节奏。', href: 'chapters/04-rhythm.html', time: 30 },
      { id: 'ch05', num: 5, title: '音程：音与音的距离', desc: '度数与性质、协和与不协和、转位，用耳朵记住每一种音程。', href: 'chapters/05-intervals.html', time: 30 },
      { id: 'ch06', num: 6, title: '音阶与调', desc: '大调与小调、调号、五度圈、五声音阶，理解音乐的"家"。', href: 'chapters/06-scales-keys.html', time: 35 },
      { id: 'ch07', num: 7, title: '和弦', desc: '三和弦、七和弦、转位与调内和弦，弹出第一个好听的和弦。', href: 'chapters/07-chords.html', time: 30 },
      { id: 'ch08', num: 8, title: '和弦进行与和声入门', desc: '主、属、下属功能，终止式与流行歌曲里的"万能和弦进行"。', href: 'chapters/08-progressions.html', time: 30 },
      { id: 'ch09', num: 9, title: '表情记号与曲式', desc: '力度、速度变化、演奏法、反复记号，以及歌曲的结构。', href: 'chapters/09-expression-form.html', time: 25 },
      { id: 'appendix', num: 0, title: '附录：速查手册', desc: '音程、和弦、音阶、调号、术语中英对照，一页全查。', href: 'chapters/appendix.html', time: 0 }
    ],
    tools: [
      { id: 'piano', icon: '🎹', title: '在线钢琴', desc: '电脑键盘也能弹，支持和弦识别、音阶高亮、跟弹儿歌与录音回放。', href: 'tools/piano.html' },
      { id: 'metronome', icon: '⏱️', title: '节拍器', desc: '精确节拍、重音设置、细分节奏、敲击测速与速度训练。', href: 'tools/metronome.html' },
      { id: 'ear', icon: '👂', title: '练耳训练', desc: '音程、和弦性质、音高比较……用耳朵做题，记录正确率。', href: 'tools/ear-training.html' },
      { id: 'reading', icon: '🎼', title: '识谱练习', desc: '高音谱表、低音谱表随机出题，限时挑战快速认音。', href: 'tools/note-reading.html' },
      { id: 'rhythm', icon: '🥁', title: '节奏练习', desc: '随机生成节奏，先听示范，再跟着节拍敲击并打分。', href: 'tools/rhythm-trainer.html' },
      { id: 'dictionary', icon: '📖', title: '和弦与音阶词典', desc: '任选根音和类型，查看组成音、五线谱与键盘位置并试听。', href: 'tools/chord-scale.html' },
      { id: 'circle', icon: '⭕', title: '五度圈', desc: '可点击的五度圈：调号、关系大小调、调内和弦一目了然。', href: 'tools/circle-of-fifths.html' },
      { id: 'progression', icon: '🎶', title: '和弦进行播放器', desc: '经典流行进行一键播放，任意转调、换伴奏型，自己编和弦。', href: 'tools/progression.html' },
      { id: 'tuner', icon: '🎙️', title: '调音器', desc: '用麦克风识别音高，给吉他、尤克里里、人声校音。', href: 'tools/tuner.html' }
    ],
    // 系统页面：不算练习工具，不出现在首页工具格子和服务面板的"＋"菜单里
    system: [
      { id: 'services', icon: '⚡', title: '服务管理', desc: '查看和停止正在运行的工具、麦克风、音频引擎与本地服务器，设置自动休眠，避免一直占用电脑资源。', href: 'tools/services.html' }
    ]
  };

  var body = document.body;
  var root = body.getAttribute('data-root') || '.';
  var pageId = body.getAttribute('data-page') || '';
  // 嵌入模式：工具页被放进「服务面板」（iframe）里时，只显示工具本身
  var embed = /[?&]embed=1(?:&|$)/.test(location.search) && global.parent !== global;
  if (embed) document.documentElement.classList.add('embed');
  function href(p) { return (root === '.' ? '' : root + '/') + p; }
  function qs(s, el) { return (el || document).querySelector(s); }
  function qsa(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } }
  };

  /* ---------------- 主题 ---------------- */
  function currentTheme() { return document.documentElement.getAttribute('data-theme') || 'light'; }
  (function initTheme() {
    var t = store.get('mt-theme', null);
    if (!t) t = global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  })();
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    var b = qs('.theme-btn'); if (b) b.textContent = t === 'dark' ? '☀️' : '🌙';
  }
  function toggleTheme() {
    var t = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(t);
    store.set('mt-theme', t);
  }
  // 其他标签页或服务面板外的页面切换了主题，这里跟着变
  global.addEventListener('storage', function (e) {
    if (e.key !== 'mt-theme' || !e.newValue) return;
    try { applyTheme(JSON.parse(e.newValue)); } catch (err) { /* */ }
  });

  /* ---------------- 进度 ---------------- */
  function progress() { return store.get('mt-progress', {}); }
  function setDone(id, done) { var p = progress(); if (done) p[id] = Date.now(); else delete p[id]; store.set('mt-progress', p); }

  /* ---------------- Toast ---------------- */
  var toastEl = null, toastTimer = null;
  function toast(msg, ms) {
    if (!toastEl) { toastEl = el('div', 'toast'); body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 1800);
  }

  /* ---------------- 布局 ---------------- */
  function buildTopbar() {
    var dark = currentTheme() === 'dark';
    var tb = el('header', 'topbar');
    tb.innerHTML =
      '<button class="icon-btn nav-toggle" aria-label="打开目录" title="目录">☰</button>' +
      '<a class="brand" href="' + href('index.html') + '"><span class="brand-logo">♪</span><span>乐理入门<small>· 从零开始</small></span></a>' +
      '<div class="topbar-spacer"></div>' +
      '<div class="search-box"><input type="search" placeholder="搜索知识点（按 / 键）" aria-label="搜索"><div class="search-results"></div></div>' +
      '<a class="top-link hide-md" href="' + href('tools/piano.html') + '">🎹 钢琴</a>' +
      '<a class="top-link hide-md" href="' + href('tools/metronome.html') + '">⏱️ 节拍器</a>' +
      '<div style="position:relative"><button class="icon-btn sound-btn" title="声音设置" aria-label="声音设置">🔊</button>' +
      '<div class="popover sound-pop"><h4>🔊 声音设置</h4>' +
      '<label>音量</label><input type="range" class="sp-vol" min="0" max="1" step="0.01">' +
      '<label>音色（全站播放使用）</label><select class="sp-inst"></select>' +
      '<label>混响（空间感）</label><input type="range" class="sp-rev" min="0" max="0.6" step="0.01">' +
      '<div class="btn-row" style="margin-bottom:0"><button class="btn btn-sm sp-test">▶ 试听</button><button class="btn btn-sm sp-stop">■ 停止所有声音</button></div>' +
      '</div></div>' +
      '<button class="icon-btn theme-btn" title="切换深色/浅色模式" aria-label="切换主题">' + (dark ? '☀️' : '🌙') + '</button>' +
      '<a class="gh-link" href="https://github.com/' + GITHUB_REPO + '" target="_blank" rel="noopener" title="在 GitHub 上查看源码" aria-label="GitHub 仓库">' +
      '<svg viewBox="0 0 16 16" width="19" height="19" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>' +
      '<span class="gh-stars" hidden><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/></svg><span class="gh-count"></span></span>' +
      '</a>';
    body.insertBefore(tb, body.firstChild);

    qs('.nav-toggle', tb).addEventListener('click', function () { toggleSidebar(); });
    qs('.theme-btn', tb).addEventListener('click', toggleTheme);
    // 声音设置
    var pop = qs('.sound-pop', tb);
    qs('.sound-btn', tb).addEventListener('click', function (e) { e.stopPropagation(); pop.classList.toggle('open'); });
    pop.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { pop.classList.remove('open'); });
    var S = global.Sound;
    if (S) {
      var vol = qs('.sp-vol', pop), inst = qs('.sp-inst', pop), rev = qs('.sp-rev', pop);
      vol.value = S.settings.volume; rev.value = S.settings.reverb;
      S.INSTRUMENTS.forEach(function (i) { var o = el('option'); o.value = i.id; o.textContent = i.zh; inst.appendChild(o); });
      inst.value = S.settings.instrument;
      vol.addEventListener('input', function () { S.setVolume(+vol.value); });
      rev.addEventListener('input', function () { S.setReverb(+rev.value); });
      inst.addEventListener('change', function () { S.setInstrument(inst.value); S.playChord(['C4', 'E4', 'G4'], { duration: 1.2 }); });
      qs('.sp-test', pop).addEventListener('click', function () { S.playArpeggio(['C4', 'E4', 'G4', 'C5'], { gap: 0.18, duration: 1.2 }); });
      qs('.sp-stop', pop).addEventListener('click', function () { S.stopAll(); });
      S.on(function (type) {
        if (type === 'settings') { vol.value = S.settings.volume; inst.value = S.settings.instrument; rev.value = S.settings.reverb; }
      });
    }
    initSearch(qs('.search-box', tb));
    initGithub(qs('.gh-link', tb));
  }

  /* ---------------- GitHub 仓库入口（顶栏右侧，带 star 数） ---------------- */
  // 换仓库只改这一行
  var GITHUB_REPO = 'bswaterb/learn-music-theory-x';
  // star 数缓存 5 分钟：没登录的 GitHub 接口每个 IP 每小时只能请求 60 次，每翻一页都请求很快就会被限流
  var STAR_TTL = 5 * 60 * 1000;
  function formatStars(n) {
    if (n >= 10000) return Math.round(n / 1000) + 'k';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }
  function initGithub(link) {
    var box = qs('.gh-stars', link), num = qs('.gh-count', link);
    function show(n) {
      num.textContent = formatStars(n);
      box.hidden = false;
      link.title = '在 GitHub 上查看源码 · ' + n + ' 个 star';
      link.setAttribute('aria-label', 'GitHub 仓库，' + n + ' 个 star');
    }
    var cached = store.get('mt-gh-stars', null);
    var mine = cached && cached.repo === GITHUB_REPO && typeof cached.n === 'number';
    if (mine) show(cached.n);                              // 先用上次的数字，页面不闪
    if (mine && Date.now() - cached.at < STAR_TTL) return; // 还新鲜，不用再问
    if (!global.fetch) return;
    fetch('https://api.github.com/repos/' + GITHUB_REPO, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        if (typeof d.stargazers_count !== 'number') return;
        store.set('mt-gh-stars', { repo: GITHUB_REPO, n: d.stargazers_count, at: Date.now() });
        show(d.stargazers_count);
      })
      .catch(function () { /* 断网、被限流、仓库不可见：保留上次的数字；从没拿到过就只显示图标 */ });
  }

  function toggleSidebar(force) {
    var sb = qs('.sidebar'), bd = qs('.sidebar-backdrop');
    if (!sb) return;
    var open = force != null ? force : !sb.classList.contains('open');
    sb.classList.toggle('open', open);
    if (bd) bd.classList.toggle('open', open);
  }

  function buildSidebar() {
    var sb = el('aside', 'sidebar');
    var p = progress();
    var doneCount = NAV.chapters.filter(function (c) { return c.num && p[c.id]; }).length;
    var total = NAV.chapters.filter(function (c) { return c.num; }).length;
    var h = '';
    h += '<div class="sidebar-group"><a class="nav-item' + (pageId === 'home' ? ' active' : '') + '" href="' + href('index.html') + '"><span class="nav-icon">🏠</span>首页 · 学习路线</a></div>';
    h += '<div class="sidebar-progress">学习进度：已完成 <b>' + doneCount + '</b> / ' + total + ' 章<div class="progress-bar"><i style="width:' + Math.round(doneCount / total * 100) + '%"></i></div></div>';
    h += '<div class="sidebar-group"><div class="sidebar-title">教程章节</div>';
    NAV.chapters.forEach(function (c) {
      var active = c.id === pageId;
      var num = c.num ? '<span class="nav-num"><span>' + c.num + '</span></span>' : '<span class="nav-num"><span>附</span></span>';
      h += '<a class="nav-item' + (active ? ' active' : '') + (p[c.id] ? ' done' : '') + '" href="' + href(c.href) + '">' + num + '<span>' + esc(c.title) + '</span></a>';
      if (active) h += '<nav class="toc" aria-label="本章目录"></nav>';
    });
    h += '</div><div class="sidebar-group"><div class="sidebar-title">配套工具箱</div>';
    NAV.tools.concat(NAV.system).forEach(function (t, i) {
      if (i === NAV.tools.length) h += '<div class="sidebar-sep"></div>';
      h += '<a class="nav-item' + (t.id === pageId ? ' active' : '') + '" href="' + href(t.href) + '"><span class="nav-icon">' + t.icon + '</span><span>' + esc(t.title) + '</span></a>';
      if (t.id === pageId) h += '<nav class="toc" aria-label="本页目录"></nav>';
    });
    h += '</div>';
    sb.innerHTML = h;
    var bd = el('div', 'sidebar-backdrop');
    bd.addEventListener('click', function () { toggleSidebar(false); });
    body.insertBefore(bd, body.firstChild);
    body.insertBefore(sb, body.firstChild);
    sb.addEventListener('click', function (e) { if (e.target.closest('a') && global.innerWidth <= 960) toggleSidebar(false); });
    body.classList.add('has-sidebar');
    buildToc(qs('.toc', sb));
    var act = qs('.nav-item.active', sb);
    if (act) setTimeout(function () { act.scrollIntoView({ block: 'center' }); }, 0);
  }

  function buildToc(toc) {
    if (!toc) return;
    var heads = qsa('.doc h2, .tool-page h2.toc-anchor');
    if (!heads.length) { toc.remove(); return; }
    heads.forEach(function (h2, i) {
      if (!h2.id) h2.id = 'sec-' + (i + 1);
      var a = el('a');
      a.href = '#' + h2.id;
      a.textContent = h2.getAttribute('data-toc') || h2.textContent.replace(/\s+/g, ' ').trim();
      toc.appendChild(a);
    });
    var links = qsa('a', toc);
    function onScroll() {
      var y = global.scrollY + 120, idx = 0;
      heads.forEach(function (h, i) { if (h.offsetTop <= y) idx = i; });
      links.forEach(function (a, i) { a.classList.toggle('active', i === idx); });
    }
    global.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function buildChapterFooter() {
    var idx = -1;
    NAV.chapters.forEach(function (c, i) { if (c.id === pageId) idx = i; });
    if (idx < 0) return;
    var doc = qs('.doc');
    if (!doc) return;
    var c = NAV.chapters[idx];
    store.set('mt-last', c.id);
    if (c.num) {
      var done = !!progress()[c.id];
      var box = el('div', 'complete-box');
      box.innerHTML = '<p>' + (done ? '🎉 你已经学完这一章了！可以继续下一章，或者去工具箱里练一练。' : '读完了吗？把小测验做一做，然后标记本章为"已学完"吧。') + '</p>' +
        '<button class="btn ' + (done ? '' : 'btn-primary') + ' mark-done">' + (done ? '↺ 取消"已学完"标记' : '✅ 我学完这一章了') + '</button>';
      doc.appendChild(box);
      qs('.mark-done', box).addEventListener('click', function () {
        var now = !progress()[c.id];
        setDone(c.id, now);
        toast(now ? '已标记为学完，继续加油！🎵' : '已取消标记');
        setTimeout(function () { location.reload(); }, 600);
      });
    }
    var nav = el('nav', 'chapter-nav');
    var prev = NAV.chapters[idx - 1], next = NAV.chapters[idx + 1];
    if (prev) nav.innerHTML += '<a class="prev" href="' + href(prev.href) + '"><div class="dir">← 上一章</div><div class="ttl">' + (prev.num ? '第 ' + prev.num + ' 章 ' : '') + esc(prev.title) + '</div></a>';
    if (next) nav.innerHTML += '<a class="next" href="' + href(next.href) + '"><div class="dir">下一章 →</div><div class="ttl">' + (next.num ? '第 ' + next.num + ' 章 ' : '') + esc(next.title) + '</div></a>';
    doc.appendChild(nav);
  }

  // ICP 备案号（页脚显示，链接到工信部备案系统）
  var ICP_NO = '浙ICP备2025220442号-1';
  function buildFooter() {
    var main = qs('.page');
    if (!main) return;
    var ft = el('footer', 'site-footer', '乐理入门 · 交互式学习手册 · 所有声音均由浏览器实时合成 · <a href="' + href('index.html') + '">返回首页</a>' +
      '<div class="icp"><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">' + ICP_NO + '</a></div>');
    main.appendChild(ft);
  }

  /* ---------------- 搜索 ---------------- */
  function initSearch(box) {
    var input = qs('input', box), res = qs('.search-results', box);
    var sel = 0, items = [];
    function index() {
      var idx = (global.MT_SEARCH_INDEX || []).slice();
      if (!idx.length) {
        NAV.chapters.forEach(function (c) { idx.push({ p: c.href, c: c.title, s: '', a: '', t: c.desc }); });
      }
      NAV.tools.concat(NAV.system).forEach(function (t) { idx.push({ p: t.href, c: '工具箱', s: t.icon + ' ' + t.title, a: '', t: t.desc }); });
      return idx;
    }
    function render(q) {
      q = q.trim().toLowerCase();
      if (!q) { res.classList.remove('open'); return; }
      var terms = q.split(/\s+/);
      var out = [];
      index().forEach(function (e) {
        var hay = (e.c + ' ' + e.s + ' ' + e.t).toLowerCase();
        if (!terms.every(function (t) { return hay.indexOf(t) >= 0; })) return;
        var score = 0;
        terms.forEach(function (t) { if ((e.s || '').toLowerCase().indexOf(t) >= 0) score += 10; if (e.c.toLowerCase().indexOf(t) >= 0) score += 4; score += 1; });
        out.push({ e: e, score: score });
      });
      out.sort(function (a, b) { return b.score - a.score; });
      items = out.slice(0, 12);
      sel = 0;
      if (!items.length) { res.innerHTML = '<div class="sr-empty">没有找到"' + esc(q) + '"相关内容</div>'; res.classList.add('open'); return; }
      res.innerHTML = items.map(function (it, i) {
        var e = it.e, t = e.t || '';
        var pos = t.toLowerCase().indexOf(terms[0]);
        var snip = pos >= 0 ? (pos > 30 ? '…' : '') + t.slice(Math.max(0, pos - 30), pos + 60) + '…' : t.slice(0, 80);
        snip = esc(snip);
        terms.forEach(function (term) { if (term) snip = snip.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), function (m) { return '<mark>' + m + '</mark>'; }); });
        return '<a href="' + href(e.p) + (e.a ? '#' + e.a : '') + '" class="' + (i === 0 ? 'active' : '') + '"><div class="sr-title">' + esc(e.s || e.c) + '</div><div class="sr-path">' + esc(e.s ? e.c : '') + '</div><div class="sr-snippet">' + snip + '</div></a>';
      }).join('');
      res.classList.add('open');
    }
    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('keydown', function (e) {
      var links = qsa('a', res);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!links.length) return;
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links.forEach(function (a, i) { a.classList.toggle('active', i === sel); });
      } else if (e.key === 'Enter') { if (links[sel]) location.href = links[sel].href; }
      else if (e.key === 'Escape') { res.classList.remove('open'); input.blur(); }
    });
    input.addEventListener('focus', function () { if (input.value) render(input.value); });
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) res.classList.remove('open'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName)) { e.preventDefault(); input.focus(); }
    });
  }

  /* ---------------- 组件：播放按钮 ---------------- */
  function list(str) { return String(str || '').split(/[\s,]+/).filter(Boolean); }
  function kbFor(btn) {
    var sel = btn.getAttribute('data-kb');
    if (!sel) return null;
    var k = qs(sel);
    return k && k._kb ? k._kb : null;
  }

  function playButton(btn) {
    var S = global.Sound;
    if (btn._handle) { btn._handle.stop(); return; }
    var d = btn.dataset;
    var mode = d.mode || 'seq';
    var bpm = +d.bpm || 100;
    var inst = d.instrument || undefined;
    var vel = d.velocity ? +d.velocity : undefined;
    var kb = kbFor(btn);
    var voices = [], timers = [];
    var handle = {
      stop: function () {
        if (btn._handle !== handle) return;
        btn._handle = null;
        btn.classList.remove('playing');
        if (seq) seq.stop();
        voices.forEach(function (v) { if (v && v.release) v.release(); });
        timers.forEach(function (t) { clearTimeout(t); });
        if (kb) kb.releaseAll();
        S.unclaim(handle);
      }
    };
    var seq = null;
    function finishAfter(sec) { timers.push(setTimeout(function () { handle.stop(); }, sec * 1000)); }
    function flashKb(midis, sec) {
      if (!kb) return;
      midis.forEach(function (m) { kb.press(m); });
      timers.push(setTimeout(function () { midis.forEach(function (m) { kb.release(m); }); }, Math.max(80, sec * 1000 - 40)));
    }
    S.claim(handle, '示例播放：' + (btn.textContent.replace(/\s+/g, ' ').trim().slice(0, 24) || d.play));
    btn._handle = handle;
    btn.classList.add('playing');
    var notes = list(d.play);
    var toM = function (n) { return global.MT.toMidi(n); };

    if (mode === 'chord') {
      var dur = d.dur ? +d.dur : 1.8;
      voices = S.playChord(notes, { duration: dur, instrument: inst, velocity: vel, strum: d.strum ? +d.strum : 0 });
      flashKb(notes.map(toM), dur);
      finishAfter(dur + 0.1);
    } else if (mode === 'arp' || mode === 'arp-chord') {
      var gap = d.gap ? +d.gap : 0.3;
      var hold = d.dur ? +d.dur : 1.4;
      voices = S.playArpeggio(notes, { gap: gap, duration: hold, instrument: inst, velocity: vel });
      notes.forEach(function (n, i) { timers.push(setTimeout(function () { flashKb([toM(n)], gap * (notes.length - i) + hold); }, i * gap * 1000)); });
      var total = gap * (notes.length - 1) + hold;
      if (mode === 'arp-chord') {
        var t2 = gap * notes.length + 0.35;
        voices = voices.concat(S.playChord(notes, { delay: t2, duration: 1.8, instrument: inst, velocity: vel }));
        timers.push(setTimeout(function () { flashKb(notes.map(toM), 1.8); }, t2 * 1000));
        total = t2 + 1.8;
      }
      finishAfter(total + 0.1);
    } else if (mode === 'freq') {
      var hz = notes.map(Number);
      var fd = d.dur ? +d.dur : 1.2;
      var wave = d.wave || 'sine';
      if (d.together != null) {
        hz.forEach(function (h) { voices.push(S.playFrequency(h, { duration: fd, type: wave, velocity: (vel || 0.6) / Math.sqrt(hz.length) })); });
        finishAfter(fd + 0.1);
      } else {
        var gapF = d.gap ? +d.gap : fd + 0.15;
        hz.forEach(function (h, i) { voices.push(S.playFrequency(h, { delay: i * gapF, duration: fd, type: wave, velocity: vel || 0.6 })); });
        finishAfter(gapF * (hz.length - 1) + fd + 0.1);
      }
    } else {
      var events;
      if (mode === 'melody') events = global.Staff.toSequence(d.play);
      else if (mode === 'progression') {
        var beatsP = d.beats ? +d.beats : 2;
        events = String(d.play).split('|').map(function (grp) { return { notes: list(grp), beats: beatsP }; }).filter(function (e) { return e.notes.length; });
      } else {
        var beats = list(d.beats).map(Number);
        events = notes.map(function (n, i) { return { notes: n === 'R' || n === 'r' ? [] : [n], beats: beats[i] || beats[beats.length - 1] || 1 }; });
      }
      seq = S.playSequence(events, {
        bpm: bpm, instrument: inst, velocity: vel, click: d.click != null, clickSound: d.clickSound, countIn: d.countIn ? +d.countIn : 0, exclusive: false,
        onEvent: function (ev) { flashKb((ev.notes || []).map(toM), ev.beats * 60 / bpm); },
        onEnd: function () { seq = null; handle.stop(); }
      });
    }
  }

  function initPlayButtons(scope) {
    qsa('[data-play]', scope).forEach(function (btn) {
      if (btn._mtInit) return;
      btn._mtInit = true;
      if (btn.tagName === 'BUTTON' && !btn.classList.contains('btn') && !btn.classList.contains('play-btn')) btn.classList.add('play-btn');
      if (btn.classList.contains('play-btn') && !qs('.pi', btn)) btn.insertAdjacentHTML('afterbegin', '<span class="pi"></span>');
      if (!btn.getAttribute('type') && btn.tagName === 'BUTTON') btn.setAttribute('type', 'button');
      btn.addEventListener('click', function (e) { e.preventDefault(); playButton(btn); });
    });
  }

  /* ---------------- 组件：键盘 ---------------- */
  function initKeyboards(scope) {
    qsa('[data-keyboard]', scope).forEach(function (box) {
      if (box._kb) return;
      var d = box.dataset;
      var range = (d.keyboard || 'C4-B5').split('-');
      var opts = {
        start: range[0] || 'C4', end: range[1] || 'B5',
        labels: d.labels || 'c', blackLabels: d.blackLabels != null,
        interactive: d.interactive !== 'false', sound: d.sound !== 'false',
        size: d.size || 'normal', instrument: d.instrument || null
      };
      var holder = el('div');
      box.appendChild(holder);
      var kb = new global.PianoKeyboard(holder, opts);
      box._kb = kb;
      ['highlight', 'hl2', 'hl3'].forEach(function (attr, i) {
        var v = d[attr];
        if (!v) return;
        var cls = ['hl', 'hl2', 'hl3'][i];
        var badgesAttr = d[i === 0 ? 'badges' : 'badges' + (i + 1)];
        var badges = null;
        if (badgesAttr === 'name' || badgesAttr === 'degree') badges = badgesAttr;
        else if (badgesAttr) badges = badgesAttr.split(/\s+/);
        kb.setHighlight(v, { cls: cls, badges: badges }, true);
      });
      if (d.caption) box.appendChild(el('div', 'kb-caption', d.caption));
    });
  }

  /* ---------------- 组件：五线谱 / 简谱 ---------------- */
  function bool(v) { return v != null && v !== 'false'; }
  function initStaffs(scope) {
    qsa('[data-staff]', scope).forEach(function (box) {
      if (box._staff) return;
      var d = box.dataset;
      var spec = {
        clef: d.clef || 'treble', key: d.key || null, time: d.time || null,
        names: d.names || false, spacing: d.spacing || 'proportional', bpm: d.bpm ? +d.bpm : undefined,
        playable: d.playable !== 'false', click: bool(d.click), countIn: d.countIn ? +d.countIn : 0,
        scale: d.scale ? +d.scale : undefined, instrument: d.instrument || null, staffLabels: bool(d.staffLabels),
        playLabel: d.playLabel, minWidth: d.minWidth ? +d.minWidth : 0, showTempo: d.showTempo !== 'false',
        noteSpace: d.noteSpace ? +d.noteSpace : undefined, wrap: d.wrap !== 'false'
      };
      if (d.staff === 'grand' || d.treble != null || d.bass != null) { spec.treble = d.treble || ''; spec.bass = d.bass || ''; }
      else spec.notes = d.staff;
      global.Staff.render(box, spec);
      if (d.caption) box.appendChild(el('div', 'caption', d.caption));
    });
    qsa('[data-jianpu]', scope).forEach(function (box) {
      if (box._jianpu) return;
      var d = box.dataset;
      global.Jianpu.render(box, {
        notes: d.jianpu, key: d.key || 'C', time: d.time || null, lyrics: d.lyrics || '', bpm: d.bpm ? +d.bpm : 90,
        octave: d.octave ? +d.octave : 4, playable: d.playable !== 'false', instrument: d.instrument || null, scale: d.scale ? +d.scale : 1
      });
      if (d.caption) box.appendChild(el('div', 'caption', d.caption));
    });
  }

  /* ---------------- 组件：小节拍器 ---------------- */
  function initMetronomes(scope) {
    qsa('[data-metronome]', scope).forEach(function (box) {
      if (box._metro) return;
      var d = box.dataset;
      var bpm = +d.bpm || 80, beats = +d.beats || 4;
      box.classList.add('mini-metro');
      box.innerHTML = '<button class="play-btn mm-toggle" type="button"><span class="pi"></span><span class="lbl">开始</span></button>' +
        '<span class="mm-bpm">' + bpm + '</span><span class="mm-unit">BPM</span>' +
        '<input type="range" min="30" max="220" value="' + bpm + '" aria-label="速度">' +
        '<span class="mm-term"></span><span class="mm-dots"></span>';
      var dots = qs('.mm-dots', box), range = qs('input', box), bpmEl = qs('.mm-bpm', box), term = qs('.mm-term', box), btn = qs('.mm-toggle', box);
      for (var i = 0; i < beats; i++) dots.appendChild(el('i', i === 0 ? 'accent' : ''));
      var dotEls = qsa('i', dots);
      function setTerm() { var t = global.MT.tempoTerm(bpm); term.textContent = t.it + ' · ' + t.zh; }
      setTerm();
      var clock = null, handle = null;
      function stop() {
        if (clock) clock.stop(); clock = null;
        btn.classList.remove('playing'); qs('.lbl', btn).textContent = '开始';
        dotEls.forEach(function (x) { x.classList.remove('on'); });
        if (handle) global.Sound.unclaim(handle); handle = null;
      }
      function start() {
        var S = global.Sound;
        handle = { stop: stop };
        S.claim(handle, function () { return '小节拍器 · ' + bpm + ' BPM · ' + beats + ' 拍'; });
        clock = S.createClock({
          bpm: bpm, onTick: function (tick, time) {
            var b = tick % beats;
            S.click(time, { accent: b === 0 ? 2 : 0 });
            S.at(time, function () { dotEls.forEach(function (x, k) { x.classList.toggle('on', k === b); }); });
          }
        });
        clock.start();
        btn.classList.add('playing'); qs('.lbl', btn).textContent = '停止';
      }
      btn.addEventListener('click', function () { if (clock) stop(); else start(); });
      range.addEventListener('input', function () { bpm = +range.value; bpmEl.textContent = bpm; setTerm(); if (clock) clock.setBpm(bpm); });
      box._metro = { start: start, stop: stop };
    });
  }

  /* ---------------- 组件：测验 ---------------- */
  function initQuizzes(scope) {
    qsa('.quiz', scope).forEach(function (q, qi) {
      if (q._quiz) return;
      q._quiz = true;
      var answer = +(q.getAttribute('data-answer') || 1);
      var qEl = qs('.quiz-q', q);
      if (qEl && !qs('.qn', qEl)) {
        var siblings = q.parentElement ? qsa(':scope > .quiz', q.parentElement) : [q];
        var n = siblings.indexOf(q) + 1;
        qEl.insertAdjacentHTML('afterbegin', '<span class="qn">' + (n || qi + 1) + '</span>');
        var inner = el('span');
        while (qEl.childNodes.length > 1) inner.appendChild(qEl.childNodes[1]);
        qEl.appendChild(inner);
      }
      var opts = qs('.quiz-opts', q);
      if (!opts) return;
      var lis = qsa(':scope > li', opts);
      var letters = 'ABCDEFG';
      lis.forEach(function (li, i) {
        var b = el('button', 'quiz-opt', '<span class="ol">' + letters[i] + '.</span><span>' + li.innerHTML + '</span>');
        b.type = 'button';
        li.innerHTML = '';
        li.appendChild(b);
        b.addEventListener('click', function (e) {
          if (e.target.closest('[data-play]') && e.target.closest('[data-play]') !== b) return;
          if (q.classList.contains('answered')) return;
          var right = i + 1 === answer;
          q.classList.add('answered', right ? 'is-right' : 'is-wrong');
          b.classList.add(right ? 'correct' : 'wrong');
          qsa('.quiz-opt', opts)[answer - 1].classList.add('correct');
          qsa('.quiz-opt', opts).forEach(function (x) { x.disabled = true; });
          updateScore(q.closest('.quiz-set'));
        });
      });
      if (!qs('.quiz-explain', q)) q.appendChild(el('div', 'quiz-explain', ''));
    });
    qsa('.quiz-set', scope).forEach(function (set) {
      if (!qs('.quiz-score', set)) {
        var sc = el('div', 'quiz-score');
        set.appendChild(sc);
        var reset = el('button', 'btn btn-sm btn-ghost', '↺ 重做本组题');
        reset.style.marginLeft = '8px';
        reset.addEventListener('click', function () { resetQuizzes(set); });
        sc.appendChild(el('span'));
        sc.appendChild(reset);
        updateScore(set);
      }
    });
  }
  function updateScore(set) {
    if (!set) return;
    var all = qsa('.quiz', set), done = all.filter(function (q) { return q.classList.contains('answered'); }), right = all.filter(function (q) { return q.classList.contains('is-right'); });
    var sc = qs('.quiz-score span', set);
    if (!sc) return;
    sc.textContent = done.length ? '已作答 ' + done.length + ' / ' + all.length + ' 题，答对 ' + right.length + ' 题' + (done.length === all.length ? (right.length === all.length ? ' —— 全对，太棒了！🎉' : ' —— 错题看看解析再回顾一下正文吧') : '') : '共 ' + all.length + ' 题，点击选项作答';
  }
  function resetQuizzes(set) {
    qsa('.quiz', set).forEach(function (q) {
      q.classList.remove('answered', 'is-right', 'is-wrong');
      qsa('.quiz-opt', q).forEach(function (b) { b.disabled = false; b.classList.remove('correct', 'wrong'); });
    });
    updateScore(set);
  }

  function initWidgets(scope) {
    scope = scope || document;
    initKeyboards(scope);
    initStaffs(scope);
    initPlayButtons(scope);
    initMetronomes(scope);
    initQuizzes(scope);
    if (global.MTServices && booted) global.MTServices.initLaunchers(scope);
  }

  /* ---------------- 启动 ---------------- */
  var booted = false, readyQueue = [];
  /** 在框架与组件初始化完成后执行 fn（若已完成则立即执行） */
  function ready(fn) {
    if (booted) { try { fn(); } catch (e) { console.error(e); } }
    else readyQueue.push(fn);
  }
  function boot() {
    if (body.getAttribute('data-layout') !== 'bare' && !embed) {
      buildSidebar();
      buildTopbar();
      buildChapterFooter();
      buildFooter();
    }
    initWidgets(document);
    qsa('details').forEach(function (dt) {
      dt.addEventListener('toggle', function () { if (dt.open && global.Staff) setTimeout(global.Staff.refreshAll, 0); });
    });
    // 文档锚点跳转后高亮
    if (location.hash) {
      var t = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (t) setTimeout(function () { t.scrollIntoView(); }, 50);
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { var pop = qs('.sound-pop.open'); if (pop) pop.classList.remove('open'); toggleSidebar(false); }
    });
    booted = true;
    readyQueue.splice(0).forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
  }

  global.MTSite = {
    NAV: NAV, root: root, pageId: pageId, embed: embed, href: href, store: store, toast: toast,
    initWidgets: initWidgets, progress: progress, setDone: setDone, qs: qs, qsa: qsa, el: el, esc: esc, ready: ready
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
