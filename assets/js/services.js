/*!
 * services.js — 「服务」：统一登记、显示、停止页面里会持续占用电脑资源的东西
 * 全局对象：window.MTServices（需在 audio.js、site.js 之后加载）
 *
 * 哪些算服务：
 *   🔊 音频引擎        Web Audio；静默 N 秒后自动休眠（audio.js 的 sleepAfter），播放时自动唤醒
 *   ▶️ 正在播放        节拍器、五线谱、和弦进行……（来自 Sound.claim(handle, '名称')）
 *   🎙️ 页面登记的服务   例如麦克风：MTServices.register({...})
 *   🧩 服务面板里的工具  右下角面板里临时打开的工具页（iframe），关闭面板 = 浏览器回收它的全部资源
 *   🖥️ 本地服务器      scripts/serve.py：页面每 20 秒心跳一次；没有页面打开 N 分钟后服务器自动退出
 *
 * 页面里登记一个服务：
 *   var svc = MTServices.register({ id: 'mic', name: '麦克风', icon: '🎙️', kind: 'mic',
 *                                   detail: function () { return '正在聆听'; }, stop: stopMic });
 *   svc.update();   // 显示内容有变化时调用
 *   svc.done();     // 服务自己结束了（比如用户点了页面上的停止按钮）
 *
 * 文档里的「临时启动」按钮（写 HTML 即可）：
 *   <button data-launch="metronome" data-args="bpm=80&ts=3/4&play=1">跟着 80 BPM 的 3/4 拍拍手</button>
 *   data-launch 取 MTSite.NAV.tools 里的 id；data-args 作为 # 后面的参数传给工具页。
 *   正文（.doc）里所有指向工具页的链接后面，会自动加一个「⚡ 临时打开」小按钮（可在服务管理里关闭）。
 *
 * 其他 API：launch(id, args) · stopAll() · stopEverywhere() · snapshot() · on(fn) · settings · setSetting(k, v)
 *           server.state / server.info / server.status() / server.shutdown() / server.setIdle(分钟)
 *           renderRows(rows, tabId) · serverHtml(full) · bindActions(container)   （服务管理页复用）
 *
 * 省资源策略（settings，存在 localStorage 'mt-svc'，所有标签页共享）：
 *   idleStop  N 分钟没有任何操作（点击、按键、滚动）→ 停止本页所有服务，0 = 不限制（默认 30）
 *   micHidden 页面切到后台 N 分钟 → 自动关闭麦克风，0 = 不限制（默认 1）
 *   chips     是否在正文的工具链接后显示「⚡ 临时打开」（默认开）
 */
(function (global) {
  'use strict';

  var doc = document, body = doc.body;
  var Site = global.MTSite || {};
  var S = global.Sound || null;
  var NAV = Site.NAV || { tools: [] };
  var TOOLS = NAV.tools || [];
  var EMBED = !!Site.embed;
  var root = body.getAttribute('data-root') || '.';
  var SHORT = { piano: '钢琴', dictionary: '和弦/音阶', progression: '和弦进行', ear: '练耳', reading: '识谱', rhythm: '节奏' };
  var MAX_PANELS = 3;

  function href(p) { return (root === '.' ? '' : root + '/') + p; }
  function $(s, el) { return (el || doc).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(s)); }
  function mk(tag, cls, html) { var e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function now() { return Date.now(); }
  function toast(msg, ms) { if (Site.toast) Site.toast(msg, ms || 3200); }
  function toolById(id) { for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].id === id) return TOOLS[i]; return null; }
  function toolByUrl(u) {
    var m = /(?:^|\/)tools\/([\w-]+\.html)/.exec(u || '');
    if (!m) return null;
    for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].href === 'tools/' + m[1]) return TOOLS[i];
    return null;
  }
  function pageTitle() { return (doc.title || '').replace(/\s*·\s*乐理入门.*$/, '') || '乐理入门'; }
  function pagePath() {
    var m = /((?:chapters|tools)\/[^/?#]+|index\.html)$/.exec(location.pathname);
    return m ? m[1] : (location.pathname.split('/').pop() || 'index.html');
  }
  function ago(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + ' 秒';
    var m = Math.round(s / 60);
    return m < 60 ? m + ' 分钟' : Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分钟';
  }

  /* ======================= 设置 ======================= */
  var STORE = 'mt-svc', BUS_KEY = 'mt-svc-bus';
  var DEFAULTS = { idleStop: 30, micHidden: 1, chips: true };
  function readSettings() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { /* */ }
    return Object.assign({}, DEFAULTS, s);
  }
  var settings = readSettings();
  function setSetting(k, v) {
    settings[k] = v;
    try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch (e) { /* */ }
    changed();
  }

  /* ======================= 本页登记的服务 ======================= */
  var reg = new Map(), seq = 0;
  function register(o) {
    o = o || {};
    var key = (o.id || 'svc') + '-' + (++seq);
    var svc = { key: key, id: o.id || 'svc', name: o.name || '服务', icon: o.icon || '⚙️', kind: o.kind || 'other', detail: o.detail, stop: o.stop, since: now() };
    reg.set(key, svc);
    changed();
    return {
      key: key,
      update: function (patch) { if (patch) Object.assign(svc, patch); if (reg.has(key)) changed(); },
      done: function () { if (reg.delete(key)) changed(); },
      get active() { return reg.has(key); }
    };
  }
  function detailOf(x) { try { return typeof x === 'function' ? (x() || '') : (x || ''); } catch (e) { return ''; } }

  function engineText(i) {
    if (i.state === 'running') {
      if (i.busy) return i.holds.length ? '运行中（' + i.holds.join('、') + ' 正在使用）' : '运行中 · 正在发声';
      return i.sleepAfter ? '运行中 · 已静默 ' + i.idleFor + ' 秒，约 ' + Math.max(0, i.sleepAfter - i.idleFor) + ' 秒后自动休眠' : '运行中 · 已关闭自动休眠';
    }
    if (i.state === 'sleeping') return '已休眠，不占 CPU · 播放时自动唤醒';
    if (i.state === 'suspended') return '等待点击页面后启用';
    if (i.state === 'closed') return '已关闭';
    return i.state;
  }
  function panelText(p) {
    var c = p.child;
    if (!c) return '加载中…';
    var parts = [];
    if (c.player) parts.push('▶ ' + c.player);
    (c.services || []).forEach(function (s) { parts.push(s.icon + ' ' + s.name + (s.detail ? '：' + s.detail : '')); });
    if (!parts.length) parts.push(c.engine === 'sleeping' ? '已打开 · 空闲（声音已休眠）' : '已打开 · 空闲');
    if (minimized) parts.push('面板已收起');
    return parts.join(' · ');
  }

  /** 本页的服务行（含音频引擎、当前播放器、登记的服务、面板） */
  function localRows() {
    var out = [];
    var info = S && S.engineInfo ? S.engineInfo() : null;
    if (info && info.player) out.push({ key: 'player', icon: '▶️', name: '正在播放', kind: 'player', active: true, detail: info.player, action: '停止' });
    reg.forEach(function (s) { out.push({ key: s.key, icon: s.icon, name: s.name, kind: s.kind, active: true, detail: detailOf(s.detail), action: '停止', since: s.since }); });
    panels.forEach(function (p) {
      out.push({ key: p.key, icon: p.tool.icon, name: p.tool.title + '（面板）', kind: 'panel', active: true, busy: p.busy, detail: panelText(p), action: '关闭', since: p.opened });
    });
    if (info && info.state !== 'off') {
      out.push({ key: 'engine', icon: '🔊', name: '音频引擎', kind: 'engine', active: info.state === 'running', detail: engineText(info), action: info.state === 'running' && !info.holds.length ? '休眠' : '' });
    }
    return out;
  }
  function countActive(rows) { return rows.filter(function (r) { return r.kind !== 'engine'; }).length; }
  function localActive() { return countActive(localRows()); }

  function stopKey(key, reason) {
    if (key === 'player') { if (S) S.stopPlayer(); changed(); return; }
    if (key === 'engine') { if (S) S.sleep(); changed(); return; }
    var svc = reg.get(key);
    if (svc) {
      reg.delete(key);
      try { if (svc.stop) svc.stop(reason || 'user'); } catch (e) { console.error(e); }
      changed();
      return;
    }
    var p = panels.get(key);
    if (p) closePanel(p);
  }
  function stopKind(kind) {
    var n = 0;
    Array.from(reg.values()).forEach(function (s) { if (s.kind === kind) { stopKey(s.key, 'policy'); n++; } });
    panels.forEach(function (p) {
      if (p.child && (p.child.services || []).some(function (s) { return s.kind === kind; })) { sendChild(p, { action: 'stopKind', kind: kind }); n++; }
    });
    return n;
  }
  /** 停止本页所有服务、关闭所有面板、让音频引擎休眠；返回停止的数量 */
  function stopAll(reason) {
    var n = 0;
    Array.from(reg.values()).forEach(function (s) { stopKey(s.key, reason); n++; });
    Array.from(panels.values()).forEach(function (p) { closePanel(p); n++; });
    if (S) { if (S.player) n++; S.sleep(); }
    changed();
    return n;
  }
  /** 所有标签页一起停 */
  function stopEverywhere() { stopAll('user'); post({ type: 'cmd', to: '*', key: '*' }); }
  function activeNames() {
    return localRows().filter(function (r) { return r.kind !== 'engine'; }).map(function (r) { return r.kind === 'player' ? r.detail : r.name; }).join('、');
  }

  /* ======================= 跨标签页（BroadcastChannel，旧浏览器退回 localStorage 事件） ======================= */
  var tabId = Math.random().toString(36).slice(2, 9) + now().toString(36).slice(-4);
  var remote = new Map();
  var bc = null;
  if (!EMBED) {
    try { bc = new BroadcastChannel('mt-svc'); bc.onmessage = function (e) { onBus(e.data); }; } catch (e) { bc = null; }
  }
  function post(msg) {
    if (EMBED) return;
    msg.from = tabId;
    if (bc) { try { bc.postMessage(msg); return; } catch (e) { /* 退回 localStorage */ } }
    try { localStorage.setItem(BUS_KEY, JSON.stringify({ m: msg, n: Math.random() })); } catch (e) { /* */ }
  }
  function tabInfo() { return { id: tabId, title: pageTitle(), page: pagePath(), url: location.href.split('#')[0], visible: !doc.hidden }; }
  function publish() { if (!EMBED) post({ type: 'state', tab: tabInfo(), rows: localRows() }); }
  function ping() { post({ type: 'ping' }); }
  function onBus(m) {
    if (!m || m.from === tabId || EMBED) return;
    switch (m.type) {
      case 'state': remote.set(m.from, { tab: m.tab || {}, rows: m.rows || [], at: now() }); refreshUI(); break;
      case 'bye': if (remote.delete(m.from)) refreshUI(); break;
      case 'ping': publish(); break;
      case 'cmd':
        if (m.to !== tabId && m.to !== '*') break;
        if (m.key === '*') stopAll(m.reason || 'remote'); else stopKey(m.key, 'remote');
        break;
      case 'server': if (m.state === 'stopped') { server.state = 'stopped'; server.info = null; refreshUI(); } break;
    }
  }
  global.addEventListener('storage', function (e) {
    if (e.key === STORE) { settings = readSettings(); refreshUI(); }
    else if (e.key === BUS_KEY && e.newValue && !bc && !EMBED) { try { onBus(JSON.parse(e.newValue).m); } catch (err) { /* */ } }
  });
  function remoteTabs() {
    var out = [];
    remote.forEach(function (v) { out.push(v); });
    return out.sort(function (a, b) { return (a.tab.title || '').localeCompare(b.tab.title || ''); });
  }
  function remoteActive() { var n = 0; remote.forEach(function (v) { n += countActive(v.rows); }); return n; }

  /* ======================= 本地服务器（scripts/serve.py） ======================= */
  var server = { state: location.protocol === 'file:' ? 'file' : 'checking', info: null, at: 0 };
  var beatTimer = null;
  function request(path, bodyObj, write) {
    var opts = { method: bodyObj ? 'POST' : 'GET', cache: 'no-store', headers: {} };
    if (bodyObj) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(bodyObj); }
    if (write) opts.headers['X-MT-Svc'] = '1';
    return fetch(href('__svc/' + path), opts).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function serverInit() {
    if (EMBED || server.state === 'file') return;
    request('ping').then(function (d) {
      if (!d || d.app !== 'music-theory') throw new Error('not ours');
      heartbeat();
      beatTimer = setInterval(heartbeat, 20000);
    }).catch(function () { server.state = 'plain'; refreshUI(); });
  }
  function heartbeat() {
    request('heartbeat', { id: tabId, page: pagePath(), title: pageTitle(), visible: !doc.hidden, services: localActive() })
      .then(function (d) { server.state = 'online'; server.info = d; server.at = now(); refreshUI(); })
      .catch(function () { if (server.state !== 'stopped') server.state = 'lost'; server.info = null; refreshUI(); });
  }
  var serverApi = {
    get state() { return server.state; },
    get info() { return server.info; },
    status: function () { return request('status'); },
    refresh: function () { if (beatTimer) heartbeat(); },
    shutdown: function () {
      return request('shutdown', {}, true).then(function (d) {
        server.state = 'stopped'; server.info = null;
        post({ type: 'server', state: 'stopped' });
        refreshUI();
        return d;
      });
    },
    setIdle: function (min) {
      return request('config', { idle_minutes: min }, true).then(function (d) { server.info = d; refreshUI(); return d; });
    }
  };

  /* ======================= 服务面板（右下角，iframe 承载工具页） ======================= */
  var panels = new Map(), dock = null, pill = null, activeKey = null, minimized = false;
  function frameUrl(t, args) { return href(t.href) + '?embed=1' + (args ? '#' + String(args).replace(/^#/, '') : ''); }
  function fullUrl(t, args) { return href(t.href) + (args ? '#' + String(args).replace(/^#/, '') : ''); }

  function ensureDock() {
    if (dock) return;
    dock = mk('section', 'svc-dock');
    dock.setAttribute('aria-label', '服务面板');
    dock.innerHTML =
      '<div class="svc-dock-bar">' +
      '<div class="svc-tabs" role="tablist"></div>' +
      '<div class="svc-dock-acts">' +
      '<div class="svc-add-wrap"><button class="svc-act svc-add" type="button" title="在面板里再打开一个工具" aria-label="打开其他工具">＋</button><div class="svc-add-menu"></div></div>' +
      '<button class="svc-act svc-wide" type="button" title="加宽 / 还原" aria-label="加宽或还原">⇔</button>' +
      '<a class="svc-act svc-full" target="_blank" rel="noopener" title="在新标签页打开完整页面" aria-label="新标签页打开">↗</a>' +
      '<button class="svc-act svc-min" type="button" title="收起面板（工具继续运行）" aria-label="收起">—</button>' +
      '<button class="svc-act svc-close" type="button" title="关闭当前工具，释放它占用的资源" aria-label="关闭">✕</button>' +
      '</div></div>' +
      '<div class="svc-frames"></div>' +
      '<div class="svc-dock-foot">关闭面板 = 释放资源 · 收起时工具继续运行 · <a href="' + href('tools/services.html') + '">服务管理</a></div>';
    body.appendChild(dock);
    pill = mk('button', 'svc-pill');
    pill.type = 'button';
    body.appendChild(pill);

    var menu = $('.svc-add-menu', dock);
    menu.innerHTML = TOOLS.map(function (t) { return '<button type="button" data-tool="' + t.id + '"><span>' + t.icon + '</span>' + esc(t.title) + '</button>'; }).join('');
    $('.svc-add', dock).addEventListener('click', function (e) { e.stopPropagation(); menu.classList.toggle('open'); });
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tool]');
      if (!b) return;
      menu.classList.remove('open');
      launch(b.getAttribute('data-tool'), '');
    });
    doc.addEventListener('click', function (e) { if (!e.target.closest('.svc-add-wrap')) menu.classList.remove('open'); });
    $('.svc-wide', dock).addEventListener('click', function () { dock.classList.toggle('wide'); });
    $('.svc-min', dock).addEventListener('click', function () { setMinimized(true); });
    $('.svc-close', dock).addEventListener('click', function () { var p = panels.get(activeKey); if (p) closePanel(p); });
    pill.addEventListener('click', function () { setMinimized(false); });
    $('.svc-tabs', dock).addEventListener('click', function (e) {
      var tab = e.target.closest('.svc-tab');
      if (!tab) return;
      var p = panels.get(tab.getAttribute('data-key'));
      if (!p) return;
      if (e.target.closest('.st-x')) closePanel(p); else showPanel(p);
    });
  }

  /** 在面板里打开工具；同一个工具已打开时切过去（参数不同则只更新 # 参数，不重新加载） */
  function launch(id, args) {
    if (EMBED) { try { global.parent.postMessage({ mtsvc: 1, type: 'launch', id: id, args: args || '' }, '*'); } catch (e) { /* */ } return null; }
    var t = toolById(id);
    if (!t) return null;
    args = String(args || '').replace(/^#/, '');
    var key = 'panel:' + id;
    var p = panels.get(key);
    if (p) {
      if (args && args !== p.args) { p.args = args; p.frame.src = frameUrl(t, args); }
      showPanel(p);
      return p;
    }
    if (panels.size >= MAX_PANELS) {
      var victim = null;
      panels.forEach(function (q) { if (!q.busy && (!victim || q.used < victim.used)) victim = q; });
      if (!victim) { toast('已经有 ' + MAX_PANELS + ' 个工具在运行，先关掉一个再打开新的吧', 4200); setMinimized(false); return null; }
      closePanel(victim);
      toast('为了节省资源，已关闭空闲的「' + victim.tool.title + '」', 3600);
    }
    ensureDock();
    p = { key: key, tool: t, args: args, opened: now(), used: now(), child: null, childJson: '', busy: false };
    var f = doc.createElement('iframe');
    f.className = 'svc-frame';
    f.title = t.title;
    f.setAttribute('allow', 'autoplay; microphone; midi');
    f.src = frameUrl(t, args);
    f.addEventListener('load', function () {
      if (activeKey === key && !minimized) { try { f.contentWindow.focus(); } catch (e) { /* */ } }
    });
    p.frame = f;
    $('.svc-frames', dock).appendChild(f);
    panels.set(key, p);
    showPanel(p);
    return p;
  }
  function showPanel(p) {
    activeKey = p.key;
    p.used = now();
    panels.forEach(function (q) { q.frame.classList.toggle('active', q === p); });
    $('.svc-full', dock).href = fullUrl(p.tool, p.args);
    setMinimized(false);
    renderTabs();
    changed();
  }
  function closePanel(p) {
    if (!panels.has(p.key)) return;
    panels.delete(p.key);
    sendChild(p, { action: 'stopAll' });
    var f = p.frame;
    f.classList.remove('active');
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 80); // 先让工具自己收尾（停止声音、关麦克风），再整个移除
    if (activeKey === p.key) {
      activeKey = null;
      var next = null;
      panels.forEach(function (q) { if (!next || q.used > next.used) next = q; });
      if (next) { showPanel(next); return; }
    }
    renderTabs();
    changed();
  }
  function setMinimized(m) {
    if (!dock) return;
    minimized = !!m && panels.size > 0;
    dock.classList.toggle('open', panels.size > 0 && !minimized);
    renderPill();
    if (!minimized) { var p = panels.get(activeKey); if (p) p.used = now(); }
  }
  function renderTabs() {
    if (!dock) return;
    var html = '';
    panels.forEach(function (p) {
      html += '<button type="button" role="tab" class="svc-tab' + (p.key === activeKey ? ' active' : '') + (p.busy ? ' busy' : '') + '" data-key="' + esc(p.key) + '" title="' + esc(p.tool.title + ' · ' + panelText(p)) + '">' +
        '<span class="st-dot"></span><span class="st-ico">' + p.tool.icon + '</span><span class="st-name">' + esc(SHORT[p.tool.id] || p.tool.title) + '</span>' +
        '<span class="st-x" title="关闭并释放资源" aria-label="关闭">✕</span></button>';
    });
    $('.svc-tabs', dock).innerHTML = html;
    dock.classList.toggle('open', panels.size > 0 && !minimized);
    if (!panels.size) minimized = false;
    renderPill();
  }
  function renderPill() {
    if (!pill) return;
    var show = panels.size > 0 && minimized;
    pill.classList.toggle('show', show);
    if (!show) return;
    var busy = 0;
    panels.forEach(function (p) { if (p.busy) busy++; });
    var p = panels.get(activeKey) || panels.values().next().value;
    pill.innerHTML = '<span class="sp-dot' + (busy ? ' on' : '') + '"></span>' + p.tool.icon + ' ' + esc(SHORT[p.tool.id] || p.tool.title) +
      (panels.size > 1 ? ' 等 ' + panels.size + ' 个工具' : '') + (busy ? ' · 运行中' : ' · 空闲') + ' <span class="sp-up">▲</span>';
    pill.title = '展开服务面板';
  }
  function sendChild(p, cmd) {
    try { p.frame.contentWindow.postMessage({ mtsvc: 1, type: 'cmd', action: cmd.action, kind: cmd.kind }, '*'); } catch (e) { /* */ }
  }
  function panelFor(src) { var found = null; panels.forEach(function (p) { if (p.frame.contentWindow === src) found = p; }); return found; }

  /* ======================= 嵌入模式（自己是面板里的工具页） ======================= */
  function childState() {
    var info = S && S.engineInfo ? S.engineInfo() : null;
    var list = [];
    reg.forEach(function (s) { list.push({ key: s.key, icon: s.icon, name: s.name, kind: s.kind, detail: detailOf(s.detail) }); });
    return { title: pageTitle(), engine: info ? info.state : 'off', player: info ? info.player : null, services: list };
  }
  function postState() { if (EMBED) { try { global.parent.postMessage({ mtsvc: 1, type: 'state', state: childState() }, '*'); } catch (e) { /* */ } } }
  var lastForward = 0;
  function forwardActivity() {
    if (!EMBED || now() - lastForward < 4000) return;
    lastForward = now();
    try { global.parent.postMessage({ mtsvc: 1, type: 'activity' }, '*'); } catch (e) { /* */ }
  }

  global.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || m.mtsvc !== 1) return;
    if (EMBED) {
      if (e.source !== global.parent || m.type !== 'cmd') return;
      if (m.action === 'stopAll') stopAll('panel-closed');
      else if (m.action === 'stopKind') stopKind(m.kind);
      else if (m.action === 'state') postState();
      return;
    }
    var p = panelFor(e.source);
    if (!p) return;
    if (m.type === 'state') {
      var js = JSON.stringify(m.state || null);
      if (js === p.childJson) return;
      p.childJson = js;
      p.child = m.state || null;
      p.busy = !!(p.child && (p.child.player || (p.child.services || []).length));
      renderTabs();
      changed();
    } else if (m.type === 'activity') { lastInteraction = now(); p.used = now(); }
    else if (m.type === 'launch') launch(m.id, m.args);
  });

  /* ======================= 「临时启动」按钮 ======================= */
  function initLaunchers(scope) {
    scope = scope || doc;
    $$('[data-launch]', scope).forEach(function (b) {
      if (b._svcLaunch) return;
      var t = toolById(b.getAttribute('data-launch'));
      if (!t) return;
      b._svcLaunch = true;
      if (!b.classList.contains('btn')) b.classList.add('launch-btn');
      if (!b.textContent.trim()) b.textContent = '临时打开' + t.title;
      if (!$('.lb-ico', b)) b.insertAdjacentHTML('afterbegin', '<span class="lb-ico">⚡</span>');
      if (b.tagName === 'BUTTON' && !b.getAttribute('type')) b.setAttribute('type', 'button');
      if (!b.title) b.title = '不离开本页：在右下角的服务面板里临时打开「' + t.title + '」，用完关掉即可释放资源';
      b.addEventListener('click', function (e) { e.preventDefault(); launch(t.id, b.getAttribute('data-args') || ''); });
    });
    if (EMBED || !settings.chips) return;
    $$('.doc a[href*="tools/"]', scope).forEach(function (a) {
      if (a._svcChip || a.closest('.no-launch, [data-launch], .launch-chip')) return;
      var t = toolByUrl(a.getAttribute('href'));
      if (!t || t.id === Site.pageId) return;
      a._svcChip = true;
      var hash = (a.getAttribute('href').split('#')[1] || '');
      var c = mk('button', 'launch-chip', '⚡ 临时打开');
      c.type = 'button';
      c.title = '不离开本页：在右下角的服务面板里临时打开「' + t.title + '」';
      c.addEventListener('click', function (e) { e.preventDefault(); launch(t.id, hash); });
      a.insertAdjacentElement('afterend', c);
    });
  }

  /* ======================= 顶栏「⚡ 服务」菜单 ======================= */
  var pop = null, popBtn = null;
  function buildTopbarButton() {
    var tb = $('.topbar'), soundBtn = $('.sound-btn');
    if (!tb || !soundBtn) return;
    var wrap = mk('div', 'svc-top');
    wrap.innerHTML = '<button class="icon-btn svc-btn" type="button" aria-label="服务">⚡<span class="svc-badge" hidden></span></button><div class="popover svc-pop" role="dialog" aria-label="服务"></div>';
    tb.insertBefore(wrap, soundBtn.parentNode);
    popBtn = $('.svc-btn', wrap);
    pop = $('.svc-pop', wrap);
    popBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var sp = $('.sound-pop.open'); if (sp) sp.classList.remove('open');
      pop.classList.toggle('open');
      if (pop.classList.contains('open')) { renderPopover(); ping(); serverApi.refresh(); }
    });
    soundBtn.addEventListener('click', function () { pop.classList.remove('open'); });
    pop.addEventListener('click', function (e) { e.stopPropagation(); });
    doc.addEventListener('click', function () { pop.classList.remove('open'); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') pop.classList.remove('open'); });
    bindActions(pop);
    updateBadge();
  }
  function updateBadge() {
    if (!popBtn) return;
    var b = $('.svc-badge', popBtn), local = localActive(), others = remoteActive(), n = local + others;
    b.hidden = !n;
    b.textContent = n;
    popBtn.classList.toggle('busy', n > 0);
    popBtn.title = n ? '正在运行 ' + n + ' 个服务（本页 ' + local + ' 个' + (others ? '，其他标签页 ' + others + ' 个' : '') + '）· 点击查看或停止' : '服务：查看、停止正在运行的工具，或在面板里临时打开工具';
  }

  /** 服务行 HTML（tab 为其他标签页的 id，本页留空） */
  function renderRows(rows, tab) {
    if (!rows.length) return '<div class="svc-empty">没有正在运行的服务</div>';
    return rows.map(function (r) {
      return '<div class="svc-row' + (r.active ? ' on' : '') + '" data-kind="' + esc(r.kind) + '">' +
        '<span class="svc-ico">' + r.icon + '</span>' +
        '<div class="svc-txt"><div class="svc-name">' + esc(r.name) + '</div><div class="svc-detail">' + esc(r.detail) + '</div></div>' +
        (r.action ? '<button class="btn btn-sm svc-stop" type="button" data-svc-stop="' + esc(r.key) + '"' + (tab ? ' data-svc-tab="' + esc(tab) + '"' : '') + '>' + esc(r.action) + '</button>' : '') +
        '</div>';
    }).join('');
  }
  var SERVER_TEXT = {
    checking: ['正在检测…', ''],
    file: ['未使用', '当前是直接双击打开的本地文件，大部分功能照常可用。想用麦克风、或在这里统一管理，可以双击项目里的 start.command 启动。'],
    plain: ['普通静态服务器', '当前不是用 start.command / start.sh 启动的，无法在网页里查看状态或关闭它。'],
    lost: ['已断开', '服务器可能已经退出（例如超过空闲时间）。需要时双击 start.command 或运行 ./start.sh 重新启动。'],
    stopped: ['已关闭', '已经打开的页面还能继续用。需要时双击 start.command 或运行 ./start.sh 重新启动。']
  };
  /** 本地服务器状态 HTML；full = 服务管理页用的详细版 */
  function serverHtml(full) {
    var i = server.info;
    if (server.state === 'online' && i) {
      var idle = i.idle_minutes ? '没有页面打开 ' + i.idle_minutes + ' 分钟后自动退出' : '不会自动退出';
      return '<div class="svc-srv on"><span class="svc-dot"></span><div class="svc-txt"><div class="svc-name">本地服务器 · 运行中</div>' +
        '<div class="svc-detail">localhost:' + i.port + ' · 已运行 ' + ago(i.uptime * 1000) + ' · ' + i.pages + ' 个页面打开' + (full ? '' : ' · ' + idle) + '</div></div>' +
        '<button class="btn btn-sm svc-stop" type="button" data-svc-shutdown>' + (full ? '关闭服务器' : '关闭') + '</button></div>';
    }
    var t = SERVER_TEXT[server.state] || [server.state, ''];
    return '<div class="svc-srv"><span class="svc-dot"></span><div class="svc-txt"><div class="svc-name">本地服务器 · ' + t[0] + '</div>' + (t[1] ? '<div class="svc-detail">' + t[1] + '</div>' : '') + '</div></div>';
  }
  function launchGridHtml() {
    return '<div class="svc-grid">' + TOOLS.map(function (t) {
      return '<button type="button" class="svc-gbtn" data-svc-launch="' + t.id + '" title="在面板里临时打开「' + esc(t.title) + '」"><span>' + t.icon + '</span>' + esc(SHORT[t.id] || t.title) + '</button>';
    }).join('') + '</div>';
  }
  function renderPopover() {
    if (!pop || !pop.classList.contains('open') || $('.confirm', pop)) return; // 正在"二次确认"时不刷新，免得按钮被重置
    var rows = localRows(), tabs = remoteTabs();
    var html = '<div class="svc-pop-head"><h4>⚡ 服务</h4><a href="' + href('tools/services.html') + '">服务管理 →</a></div>';
    html += '<div class="svc-sec">本页</div>' + renderRows(rows, '');
    if (tabs.length) {
      html += '<div class="svc-sec">其他标签页</div>';
      tabs.forEach(function (v) {
        var act = v.rows.filter(function (r) { return r.kind !== 'engine'; });
        var eng = v.rows.filter(function (r) { return r.kind === 'engine'; })[0];
        html += '<div class="svc-tabname">' + esc(v.tab.title || v.tab.page) + (v.tab.visible ? '' : '<span class="svc-bg">后台</span>') + '</div>';
        html += act.length ? renderRows(act, v.tab.id) : '<div class="svc-empty sm">' + (eng ? '空闲 · 音频引擎' + (eng.active ? '运行中' : '已休眠') : '空闲') + '</div>';
      });
    }
    html += '<div class="svc-sec">本地服务器</div>' + serverHtml(false);
    html += '<div class="svc-sec">在面板里临时打开</div>' + launchGridHtml();
    html += '<div class="svc-pop-foot"><button class="btn btn-sm" type="button" data-svc-stopall>■ 全部停止（所有标签页）</button></div>';
    pop.innerHTML = html;
  }

  /** 给容器绑定统一的按钮行为：停止 / 临时打开 / 全部停止 / 关闭服务器（两次确认） */
  function bindActions(container) {
    container.addEventListener('click', function (e) {
      var b = e.target.closest('[data-svc-stop]');
      if (b) {
        e.preventDefault();
        var tab = b.getAttribute('data-svc-tab'), key = b.getAttribute('data-svc-stop');
        b.disabled = true;
        if (!tab || tab === tabId) stopKey(key, 'user');
        else { post({ type: 'cmd', to: tab, key: key }); setTimeout(ping, 250); }
        return;
      }
      var l = e.target.closest('[data-svc-launch]');
      if (l) {
        e.preventDefault();
        if (pop) pop.classList.remove('open');
        launch(l.getAttribute('data-svc-launch'), l.getAttribute('data-svc-args') || '');
        return;
      }
      if (e.target.closest('[data-svc-stopall]')) {
        e.preventDefault();
        stopEverywhere();
        toast('已停止所有标签页里的服务，音频引擎已休眠');
        setTimeout(ping, 250);
        return;
      }
      var sd = e.target.closest('[data-svc-shutdown]');
      if (sd) {
        e.preventDefault();
        if (!sd.classList.contains('confirm')) {
          sd.classList.add('confirm');
          sd._label = sd.textContent;
          sd.textContent = '再点一次确认';
          setTimeout(function () { if (sd.isConnected) { sd.classList.remove('confirm'); sd.textContent = sd._label; } }, 4000);
          return;
        }
        sd.disabled = true;
        var settle = function () { sd.classList.remove('confirm'); refreshUI(); };
        serverApi.shutdown().then(function () {
          settle();
          toast('本地服务器已关闭。已打开的页面还能继续用，需要时双击 start.command 重新启动', 5200);
        }, function () { settle(); toast('关闭失败：服务器可能已经退出了'); serverApi.refresh(); });
      }
    });
  }

  /* ======================= 刷新 / 广播 / 省资源策略 ======================= */
  var listeners = [], flushTimer = null;
  function on(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }
  function refreshUI() {
    updateBadge();
    renderPopover();
    renderPill();
    listeners.forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
  }
  /** 本页服务有变化：稍后统一刷新界面并广播（合并短时间内的多次变化） */
  function changed() {
    if (flushTimer) return;
    flushTimer = setTimeout(function () {
      flushTimer = null;
      if (EMBED) { postState(); return; }
      publish();
      refreshUI();
    }, 120);
  }

  var lastInteraction = now(), hiddenSince = doc.hidden ? now() : null, pendingNotice = null;
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) {
    global.addEventListener(ev, function () { lastInteraction = now(); forwardActivity(); }, { passive: true, capture: true });
  });
  function notice(msg) { if (doc.hidden) pendingNotice = msg; else toast(msg, 6500); }
  function policies() {
    var t = now();
    if (settings.idleStop > 0 && t - lastInteraction >= settings.idleStop * 60000 && localActive() > 0) {
      var names = activeNames();
      stopAll('idle');
      lastInteraction = t;
      notice('已经 ' + settings.idleStop + ' 分钟没有操作，为节省资源自动停止了：' + names + '（可在「服务管理」里调整）');
    }
    if (settings.micHidden > 0 && hiddenSince && t - hiddenSince >= settings.micHidden * 60000 && stopKind('mic')) {
      notice('页面切到后台超过 ' + settings.micHidden + ' 分钟，已自动关闭麦克风');
    }
  }
  function tick() {
    if (EMBED) { postState(); return; }
    var t = now();
    remote.forEach(function (v, k) { if (t - v.at > 150000) remote.delete(k); });
    publish();
    policies();
    refreshUI();
  }

  doc.addEventListener('visibilitychange', function () {
    hiddenSince = doc.hidden ? now() : null;
    if (!doc.hidden && pendingNotice) { toast(pendingNotice, 6500); pendingNotice = null; }
    if (!EMBED) { publish(); serverApi.refresh(); }
  });
  global.addEventListener('pagehide', function () {
    if (EMBED) return;
    post({ type: 'bye' });
    if (server.state === 'online' && navigator.sendBeacon) {
      try { navigator.sendBeacon(href('__svc/bye'), new Blob([JSON.stringify({ id: tabId })], { type: 'text/plain' })); } catch (e) { /* */ }
    }
  });
  global.addEventListener('pageshow', function (e) { if (e.persisted && !EMBED) { publish(); serverApi.refresh(); } });
  if (S && S.on) S.on(function (type) { if (type === 'engine' || type === 'player') changed(); });

  /* ======================= 启动 ======================= */
  function init() {
    if (EMBED) {
      // 面板里的工具页：跳到其他页面的链接改为新标签页打开，免得面板里"走丢"
      doc.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href]');
        if (!a || a.target || /^(#|javascript:)/.test(a.getAttribute('href'))) return;
        a.target = '_blank'; a.rel = 'noopener';
      }, true);
      postState();
      setInterval(tick, 5000);
      return;
    }
    buildTopbarButton();
    initLaunchers(doc);
    serverInit();
    publish();
    ping();
    setInterval(tick, 5000);
    doc.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !dock || minimized || !panels.size) return;
      if ($('.popover.open') || $('.sidebar.open')) return;
      setMinimized(true);
    });
  }
  if (Site.ready) Site.ready(init);
  else if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();

  global.MTServices = {
    tabId: tabId, embed: EMBED,
    register: register, launch: launch, initLaunchers: initLaunchers,
    stop: stopKey, stopKind: stopKind, stopAll: stopAll, stopEverywhere: stopEverywhere,
    on: on, ping: ping, server: serverApi,
    get settings() { return settings; }, setSetting: setSetting, DEFAULTS: DEFAULTS,
    renderRows: renderRows, serverHtml: serverHtml, launchGridHtml: launchGridHtml, bindActions: bindActions,
    /** 当前所有服务的快照：{ local: rows, tabs: [{ tab, rows, at }], server, settings, panels } */
    snapshot: function () {
      return { local: localRows(), tabs: remoteTabs(), server: { state: server.state, info: server.info }, settings: settings, panels: panels.size, tabId: tabId };
    },
    sendCommand: function (tab, key) { if (!tab || tab === tabId) stopKey(key, 'user'); else post({ type: 'cmd', to: tab, key: key }); }
  };
})(window);
