# 乐理入门 · 开发与写作规范

本文件是这个项目的"施工图"：目录结构、页面模板、组件用法、写作风格、每一章的大纲和每个工具的需求。新增/修改页面前请先读一遍。

---

## 1. 项目结构

```
music-theory/
├── start.command / start.sh   一键启动（调用 scripts/serve.py）：./start.sh [--bg | stop | status | --page 路径 | --idle 分钟]
├── index.html                 首页（学习路线 + 工具箱）
├── chapters/                  教程章节（data-page 必须与 site.js 中 NAV 的 id 一致）
│   ├── 01-sound.html          ch01 声音与音高（样板章节，写新章节前先看它）
│   ├── 02-keyboard.html       ch02 音名、唱名与键盘
│   ├── 03-notation.html       ch03 看懂乐谱：五线谱与简谱
│   ├── 04-rhythm.html         ch04 节奏与节拍
│   ├── 05-intervals.html      ch05 音程
│   ├── 06-scales-keys.html    ch06 音阶与调
│   ├── 07-chords.html         ch07 和弦
│   ├── 08-progressions.html   ch08 和弦进行与和声入门
│   ├── 09-expression-form.html ch09 表情记号与曲式
│   └── appendix.html          appendix 附录：速查手册
├── tools/                     配套工具（data-page = 工具 id）
│   ├── piano.html             piano       在线钢琴
│   ├── metronome.html         metronome   节拍器
│   ├── ear-training.html      ear         练耳训练
│   ├── note-reading.html      reading     识谱练习
│   ├── rhythm-trainer.html    rhythm      节奏练习
│   ├── chord-scale.html       dictionary  和弦与音阶词典
│   ├── circle-of-fifths.html  circle      五度圈
│   ├── progression.html       progression 和弦进行播放器
│   ├── tuner.html             tuner       调音器
│   └── services.html          services    服务管理（NAV.system，不算练习工具）
├── scripts/serve.py           本地服务：静态文件 + /__svc/ 控制接口 + 空闲自动退出（运行时文件在 .run/）
├── scripts/make_launcher.sh   生成桌面图标「乐理入门.app」（AppleScript 小程序，调用 start.sh --bg；可重复运行）
├── .claude/launch.json        Claude 预览面板的启动配置（scripts/serve.py --port 8765 --strict-port --no-open）
└── assets/
    ├── css/style.css          全站样式（设计变量、组件样式）
    └── js/
        ├── theory.js          MT：乐理计算（音名、音程、音阶、和弦、调号、和弦识别）
        ├── audio.js           Sound：Web Audio 合成器、节拍器声音、鼓、精确时钟
        ├── keyboard.js        PianoKeyboard：钢琴键盘组件
        ├── staff.js           Staff：五线谱渲染 + 播放
        ├── jianpu.js          Jianpu：简谱渲染 + 播放
        ├── site.js            MTSite：顶栏/侧栏/目录/进度/搜索 + 声明式组件自动初始化 + 嵌入模式
        ├── services.js        MTServices：服务登记、服务面板、⚡ 菜单、跨标签页管理、服务器心跳、省资源策略
        └── search-index.js    搜索索引（脚本生成）
```

纯静态站点，无构建步骤、无外部依赖，可直接双击 `index.html` 打开（麦克风调音器需要 `http://localhost` 或 https）。本地预览：`./start.sh`（或双击 `start.command`），会自动打开 `http://localhost:8765`；服务器给所有文件加了 `Cache-Control: no-cache`，改完文件刷新即可看到。

---

## 2. 页面模板

### 2.1 章节页

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>第 N 章 标题 · 乐理入门</title>
<script>try{var t=localStorage.getItem('mt-theme');document.documentElement.setAttribute('data-theme',t?JSON.parse(t):(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'))}catch(e){}</script>
<link rel="stylesheet" href="../assets/css/style.css">
<style>/* 本页专用样式（可选） */</style>
</head>
<body data-page="chNN" data-root="..">
<main class="page">
<article class="content doc">

<header class="chapter-header">
  <div class="chapter-kicker">第 N 章</div>
  <h1>标题：副标题</h1>
  <p class="lead">一两句话说清本章讲什么、为什么重要。</p>
  <div class="chapter-meta"><span>⏱ 预计 NN 分钟</span><span>🎯 难度 ★★☆☆☆</span></div>
  <div class="goals"><h4>学完本章，你将能够：</h4><ul><li>…</li></ul></div>
</header>

<section>
<h2 id="sN-1">N.1 小节标题</h2>
…
</section>
…
<section>
<h2 id="sN-summary">本章小结</h2>
<div class="callout summary"><div class="callout-title">要点回顾</div><ul>…</ul></div>
<h3>小测验</h3>
<div class="quiz-set"> …5～6 道 .quiz … </div>
<div class="callout tip"><div class="callout-title">课后练一练</div><p>…链接到工具…</p></div>
</section>

</article>
</main>
<script src="../assets/js/theory.js"></script>
<script src="../assets/js/audio.js"></script>
<script src="../assets/js/keyboard.js"></script>
<script src="../assets/js/staff.js"></script>
<script src="../assets/js/jianpu.js"></script>
<script src="../assets/js/site.js"></script>
<script src="../assets/js/services.js"></script>
<script src="../assets/js/search-index.js"></script>
<script>(function () { /* 本页专用交互（可选），写在 IIFE 里 */ })();</script>
</body>
</html>
```

要点：
- 每个"小章节"是一个 `<h2>`，id 形如 `s3-2`，文字以编号开头（`3.2 谱号`）。侧栏目录、搜索索引都从 h2 自动生成。h2 下可以再用 h3/h4 分层。
- 章节末尾的"上一章/下一章"导航、"我学完这一章了"按钮由 site.js 自动追加，不要手写。
- 页面专用 JS 放在最后一个 `<script>` 里，位于 site.js 之后。注意初始化时机：site.js 在 `DOMContentLoaded` 时才搭建框架并初始化声明式组件，所以——
  - 页面脚本**直接执行**的代码运行在初始化之前：此时插入到页面里的 `data-staff` / `data-play` 等元素会被自动初始化，但还拿不到 `容器._kb`、`容器._staff` 等实例；
  - 需要访问组件实例的代码，请放进 `MTSite.ready(function () { … })`（初始化完成后执行；若已完成则立即执行）；
  - 初始化之后再动态插入的 HTML 若包含声明式组件，调用 `MTSite.initWidgets(容器元素)`。

### 2.2 工具页

```html
<body data-page="piano" data-root="..">
<main class="page">
<div class="content wide tool-page">
  <div class="tool-header">
    <div><h1><span class="tool-icon">🎹</span>在线钢琴</h1><p>一句话说明。</p></div>
    <div class="btn-row">…可选的顶部按钮…</div>
  </div>
  <div class="panel">…主要功能…</div>
  <section class="how-to"><h2 class="toc-anchor" id="how">使用说明</h2>…</section>
</div>
</main>
…同样的 7 个 script…
<script>/* 工具逻辑 */</script>
</body>
```

工具页里带 `class="toc-anchor"` 的 h2 会出现在侧栏的"本页目录"里。工具页应有"使用说明"和"和教程哪一章配合"的说明，并链接回相应章节。

---

## 3. 声明式组件（写 HTML 即可）

### 3.1 播放按钮 `data-play`

```html
<button data-play="C4 E4 G4" data-mode="chord">C 大三和弦</button>
```

| 属性 | 说明 |
|---|---|
| `data-play` | 要播放的内容，见下方 mode |
| `data-mode` | `seq`（默认，逐个播放，每个 1 拍）、`chord`（同时）、`arp`（琶音并保持）、`arp-chord`（先琶音再柱式）、`melody`（五线谱记谱语法，带时值）、`freq`（频率 Hz，空格分隔）、`progression`（多个和弦，用 `\|` 分隔） |
| `data-bpm` | 速度，默认 100（seq/melody/progression） |
| `data-beats` | seq 模式每个音的拍数，如 `"1 1 2"`；progression 模式每个和弦的拍数（默认 2） |
| `data-dur` | chord / arp / freq 模式的时长（秒） |
| `data-gap` | arp / freq 的间隔（秒） |
| `data-instrument` | `piano` `epiano` `organ` `guitar` `sine` `triangle`；不写则用全站设置 |
| `data-velocity` | 力度 0～1 |
| `data-click` | （无值属性）seq/melody/progression 同时播放节拍器 |
| `data-click-sound` | 节拍器音色：`wood`（木鱼，默认）/ `beep` / `tick`（咔哒）。只想听节拍器时写 `data-play="R R R R" data-click`（全是休止符） |
| `data-count-in` | 预备拍数 |
| `data-kb="#id"` | 播放时在指定键盘上点亮按键（键盘容器需有 id） |
| `data-together` | freq 模式下多个频率同时发声 |
| `data-wave` | freq 模式的波形：`sine` `triangle` `square` `sawtooth` |

按钮会自动加上 ▶ 图标；播放中再点一次即停止；同一时间只有一个播放器发声（新的会停止旧的）。在表格里可用 `class="play-btn sm icon-only"` 做纯图标按钮。休止可在 seq 中写 `R`。

### 3.2 钢琴键盘 `data-keyboard`

```html
<div id="kb-c" data-keyboard="C4-B5" data-labels="name" data-highlight="C4 E4 G4" data-badges="1 3 5"></div>
```

| 属性 | 说明 |
|---|---|
| `data-keyboard` | 音域，如 `C3-C6`（自动扩到白键） |
| `data-labels` | `name`（白键音名，C 带八度号）、`name-plain`、`solfege`（唱名）、`number`（简谱数字）、`c`（默认，只标 C）、`none` |
| `data-black-labels` | 黑键也显示音名（C♯/D♭） |
| `data-highlight` / `data-hl2` / `data-hl3` | 高亮的音（紫 / 橙 / 绿） |
| `data-badges` / `data-badges2` / `data-badges3` | 高亮键上的小标签：`name`（按传入的拼写显示，如 F♯ / G♭）、`degree`（1,2,3…）、或空格分隔的自定义文字 |
| `data-size` | `compact` / `tall` |
| `data-interactive="false"` | 不可点击 |
| `data-caption` | 图注 |

JS 中通过 `容器._kb` 拿到 `PianoKeyboard` 实例。

### 3.3 五线谱 `data-staff`

```html
<div data-staff="C4:q D4 E4 F4 | G4:h G4 |]" data-time="4/4" data-key="G" data-names="name"></div>
<div data-staff="grand" data-treble="[C4 E4 G4]:w |]" data-bass="C3:w |]"></div>
```

属性：`data-clef`（`treble` 默认、`bass`、`alto`、`rhythm` 单线节奏谱、`none` 无谱号）、`data-key`（`G` `Bb` `F#` `Am` `c#m`…）、`data-time`（`4/4` `3/4` `6/8` `C`）、`data-names`（`name` 音名 / `solfege` 唱名 / `number` 简谱数字 / `octave` 带八度的音名）、`data-spacing="even"`（等距排列，适合展示音阶）、`data-bpm`、`data-click`（播放带节拍器）、`data-count-in="1"`（预备小节数）、`data-playable="false"`、`data-scale`（缩放，默认 1.15）、`data-staff-labels`（在右侧标出"第一线…第四间"）、`data-play-label`、`data-min-width`、`data-instrument`、`data-caption`、`data-wrap="false"`。

**记谱语法**（空格分隔）：

| 写法 | 含义 |
|---|---|
| `C4` `F#4` `Bb3` `Ebb5` `F##4` `Fn4` | 音符；`n` 强制显示还原号。中央 C = C4 |
| `:w` `:h` `:q` `:8` `:16` `:32` | 全/二分/四分/八分/十六分/三十二分；省略时沿用上一个时值（初始四分） |
| `:q.` `:h.` `:8.` | 附点；`:8t` 三连音（三个一组自动加"3"） |
| `[C4 E4 G4]:h` | 和弦；`[C4 E4* G4]` 只高亮其中一个音 |
| `R:q` | 休止符；`X:8` 无音高节奏音符（节奏谱用） |
| `\|` `\|\|` `\|]` `\|:` `:\|` `:\|:` | 小节线、双纵线、终止线、反复记号（播放时会按反复展开） |
| `{1}` `{2}` | 第一房子、第二房子（写在该小节最前面） |
| `$segno` `$coda` | 记号 𝄋、⊕ |
| `"rit."` / `_"文字"` | 独立的上方 / 下方文字（含空格时用；HTML 属性请用单引号包裹） |

修饰（写在时值之后，**文字类必须放在最后**）：`~` 延音线（连到下一个同音）、`(` `)` 圆滑线起止、`*` 高亮（橙）、`*2` 紫、`*3` 绿、`@s` 跳音、`@a` 重音、`@t` 保持音、`@f` 延长记号、`!p` `!mf` `!f`… 力度、`!<` 渐强开始、`!>` 渐弱开始、`!.` 结束发夹、`^文字` 上方文字（如 `^Am7`）、`_文字` 下方文字（如 `_do`）。

例子：`'E4:q(!p^C G4 C5 E5) | G4:h@f!f |]'`

JS：`Staff.render(el, spec)` 返回视图对象，可 `.play()` `.stop()` `.update(newSpec)` `.highlightEvents([事件序号], 'hl'|'hl2'|'hl3'|'dim')`；`spec.onSlot(slot)` 在播放到每个时间点时回调；`Staff.toSequence(str)` 把记谱字符串转换为 `Sound.playSequence` 的事件。

- `update()` / 对同一元素再次 `Staff.render()` 会与旧配置合并；`notes` 与 `treble/bass` 互斥（传其中一种会清掉另一种）。
- `highlightEvents` 的高亮会在容器宽度变化、自动重排后保留；`update()` 会清空高亮。
- `spec.instrument` 除了普通音色，还可以用打击音色 `clap`（拍手）、`wood`（木鱼）、`click`（咔哒）、`drum`（军鼓），适合节奏谱。
- 谱例会在容器宽度变化时自动重排（ResizeObserver）；没有小节线的短谱例优先整体缩小而不是折行（`data-wrap="true"` 可强制折行）。

### 3.4 简谱 `data-jianpu`

```html
<div data-jianpu="1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 - |]" data-key="C" data-time="4/4" data-lyrics="一 闪 一 闪 亮 晶 晶" data-bpm="90"></div>
```

语法：`1`～`7` 音符，`0` 休止；前缀 `#` / `b` 升降；`'` 高八度、`,` 低八度（可叠加）；后缀 `_` 八分、`__` 十六分、`.` 附点；独立的 `-` 表示把前一个音延长一拍；`~` 延音线、`(` `)` 圆滑线、`*` 高亮、`^文字` 上方文字；小节线同五线谱。`data-key` 是"1="后面的调（首调），`data-octave` 改变 1 所在的八度（默认 4）。歌词以空格分隔，与音符一一对应（自动跳过休止和延音），用 `_` 占位表示该音无字。

### 3.5 其他

- 小节拍器：`<div data-metronome data-bpm="80" data-beats="4"></div>`
- 临时启动按钮（在右下角服务面板里打开工具，并带上预设）：`<button data-launch="metronome" data-args="bpm=80&ts=3/4&play=1">3/4 拍</button>`。
  - `data-launch` 取 NAV.tools 的 id，`data-args` 会作为 `#` 后面的参数传给工具页；按钮前会自动加 ⚡。
  - 一组按钮用 `<div class="launch-row"><span class="lr-label">说明：</span>…按钮…</div>` 包起来。
  - 正文（`.doc`）里指向工具页的普通链接，后面会自动加「⚡ 临时打开」小按钮，不用手写；不想要时给链接或其父元素加 `class="no-launch"`。
  - 各工具支持的预设参数：
    - 节拍器：`bpm=80&ts=3/4&play=1`
    - 和弦与音阶词典：`chord=C:maj7:0`（根音:类型:转位）或 `scale=G:major`
    - 五度圈：`key=G` / `key=Em`
    - 和弦进行：`k=C&m=major&s=I.V.vi.IV&pre=1564&p=arp&bpm=90`
- 测验：

```html
<div class="quiz-set">
  <div class="quiz" data-answer="2">
    <p class="quiz-q">题干（可以放 <button data-play="C4 G4" data-mode="seq">播放</button> 做听力题）</p>
    <ol class="quiz-opts"><li>选项 A</li><li>选项 B（正确）</li><li>选项 C</li></ol>
    <div class="quiz-explain">解析：为什么选 B。</div>
  </div>
</div>
```
`data-answer` 从 1 开始。

- 提示框：`<div class="callout tip|note|warn|example|try|memory|analogy|summary"><div class="callout-title">标题</div><p>…</p></div>`
  （小贴士 / 注意 / 警告 / 例子 / 动手试试 / 记忆口诀 / 打个比方 / 要点回顾）
- 图示容器：`<div class="figure">…<div class="caption">图注</div></div>`；并排用 `.figure-row`（只适合单个音符/和弦这类窄谱例；多小节的谱例请上下排列，否则每栏太窄会折成很多行）。
- 表格：`<div class="table-wrap"><table class="table">…</table></div>`
- 折叠：`<details class="fold"><summary>标题</summary><div class="fold-body">…</div></details>`
- 步骤列表：`<ol class="steps">`；术语高亮：`<span class="term">术语</span>`；音名：`<span class="nn">F♯4</span>`；英文注释：`<span class="en">Interval</span>`；按键：`<kbd>A</kbd>`
- 布局：`.grid-2` `.grid-3` `.grid-4` `.card` `.btn` `.btn-primary` `.btn-sm` `.btn-row` `.segmented` `.switch` `.tag` `.panel` `.stat`

---

## 4. JS API 速查

**MT（theory.js）**
`parseNote('F#4')` → `{letter,acc,octave,midi}`；`fromMidi(61, preferFlat)`；`toMidi(x)`；`noteName(n,{octave})`；`pcName(n)` → `'F♯'`；`solfege(n)`；`jianpuNumber(n)`；`pretty('Bb')` → `'B♭'`；`midiToFreq` / `freqToMidi`；`interval(a,b)` → `{num,semis,quality,name,zh}`；`transpose(note,'M3',dir)`；`parseInterval('m7')`；`INTERVALS`（0～12 半音表）；`SCALES` / `scale(root,type,{octaves,top,descending})` / `scaleSteps(type)`；`CHORDS` / `chord(root,type,{inversion})` / `chordSymbol(root,type)` / `detectChord(midis)` → 候选数组；`keySignature('D')` → `{count,letters,names,map}`；`parseKey('Am')`；`keyName`；`relativeMinor` / `relativeMajor`；`CIRCLE`（五度圈数据）；`diatonicChords(key,{sevenths})` → `[{roman,symbol,notes,func,funcZh}]`；`romanToChord('vi', 'G')`；`spellInKey(midi,key)`；`tempoTerm(bpm)`；`shuffle` / `pick`。

**Sound（audio.js）**
`playNote(note,{duration,velocity,delay,at,instrument})`、`playChord(notes,{duration,strum})`、`playArpeggio(notes,{gap,duration})`、`playFrequency(hz,{type,duration})`、`startTone(hz)` → `{setFrequency,setVolume,stop}`、`noteOn(midi,vel,{key,instrument})` / `noteOff(midi,{key})` / `setSustain(bool)` / `allNotesOff()`、`click(time,{accent:0|1|2,sound:'wood'|'beep'|'tick',level})`、`drum('kick'|'snare'|'hat'|'openhat'|'clap',time,vel)`、`createClock({bpm,ticksPerBeat,onTick(tick,time)})` → `{start,stop,setBpm,setTicksPerBeat}`、`at(audioTime,fn)`（界面与声音同步）、`now()`、`playSequence(events,{bpm,onEvent,onEnd,countIn,click,exclusive})` → `{stop}`、`claim(handle, label)` / `unclaim(handle)`（独占播放，handle 需有 stop 方法；label 是显示在「⚡ 服务」里的名称，可以是返回字符串的函数，如 `function () { return '节拍器 · ' + bpm + ' BPM'; }`）、`stopPlayer()`、`stopAll()`、`setVolume` / `setInstrument` / `setReverb`、`INSTRUMENTS`、`settings`、`ctx`（AudioContext）、`master`（主输出节点）。

省资源：没有声音、时钟、实时按键、hold 时，引擎静默 `settings.sleepAfter` 秒（默认 30，`setSleepAfter(秒)` 修改，0 = 从不）后自动休眠，下次播放自动唤醒。

- `state`：`'off' | 'running' | 'sleeping' | 'suspended'`。
- `hold('麦克风')` 返回 release 函数。需要引擎一直运行时（如麦克风分析）调用，用完一定要 release。
- `sleep()`：停止一切并立即休眠。
- `engineInfo()`：返回状态详情。
- `on(fn)` 的事件类型增加 `'engine'`、`'player'`。

**PianoKeyboard（keyboard.js）**
`new PianoKeyboard(el,{start,end,labels,blackLabels,interactive,sound,size,instrument,onNoteOn(midi,vel),onNoteOff(midi)})`；`noteOn(m)` / `noteOff(m)`（发声+按下效果+回调，用于电脑键盘/MIDI）；`press` / `release` / `flash(m,ms)` / `releaseAll()`（仅视觉）；`setHighlight(notes,{cls,badges},keepOthers)` / `clearHighlight(cls)`；`setLabels(mode,blackLabels)`；`setRange(start,end)`；`setKeyHints({60:'A'})`；`pressedNotes()`；`scrollTo(m)`。

**MTSite（site.js）**
`NAV`（`chapters` / `tools` / `system`）、`embed`（是否在服务面板里）、`ready(fn)`、`initWidgets(scope)`、`toast(msg)`、`store.get/set`、`progress()`、`href(path)`、`esc(str)`。

**MTServices（services.js）**
"服务"指会持续占用电脑资源的东西：音频引擎、当前播放器（来自 `Sound.claim`）、页面登记的服务（如麦克风）、服务面板里的工具、本地服务器。

- 登记：`var svc = register({ id, name, icon, kind: 'mic' | 'other', detail: 字符串或函数, stop })`。
  - 返回的 `svc` 有 `update()` 和 `done()`（服务自己结束时调用）。
  - 用到麦克风等长期资源的页面必须登记，参考 tuner.html。
- 面板与停止：
  - `launch(toolId, args)`：在面板里打开工具。在面板内调用时，会交给外层页面打开。
  - `stop(key)`、`stopKind('mic')`、`stopAll()`（本页）、`stopEverywhere()`（所有标签页）。
- 状态与本地服务器：
  - `snapshot()`、`on(fn)`。
  - `server.state`：`'online' | 'file' | 'plain' | 'lost' | 'stopped'`。
  - `server.status()`、`server.shutdown()`、`server.setIdle(分钟)`。
- 设置：
  - `settings` / `setSetting(k, v)`。
  - `idleStop`：无操作多少分钟后停止服务。
  - `micHidden`：切到后台多少分钟后关麦克风。
  - `chips`：是否显示「⚡ 临时打开」。
- 管理页复用：`renderRows(rows, tabId)`、`serverHtml(full)`、`launchGridHtml()`、`bindActions(el)`。

**嵌入模式**：工具页以 `?embed=1` 打开（服务面板里的 iframe）时：
- `site.js` 不生成顶栏、侧栏、页脚，`<html>` 带 `class="embed"`，CSS 会隐藏工具标题和 `.how-to` 说明。
- `services.js` 把本页服务的状态用 postMessage 报给外层页面，并在面板关闭前收尾。

所以新工具页要注意三点：
- 窄到 375px 也不能溢出。
- 读取 `location.hash` 的预设参数，并监听 `hashchange`。
- 长期占用的资源要登记成服务。

---

## 5. 写作规范

1. **读者是零基础小白。** 每个术语第一次出现时用 `<span class="term">` 标出并用大白话解释，必要时附英文（`<span class="en">Interval</span>`）。先讲"是什么、为什么"，再讲"怎么用"。
2. **每个概念都要能听到、看到、动手。** 讲完一个知识点，紧跟一个可播放的例子（按钮 / 五线谱 / 键盘），关键处用"动手试试"让读者在键盘上操作。
3. **多用类比和生活化的例子**（`callout analogy`），多用对比（大调 vs 小调、协和 vs 不协和）。
4. **段落短、层次清楚。** 每个 h2 小节 300～900 字为宜，长内容用 h3 分层、表格、步骤列表、折叠块。
5. **记忆口诀**用 `callout memory`，**常见误区**用 `callout warn`，**小结**用 `callout summary`。
6. **准确性第一。** 乐理事实、音名拼写（升降号要拼对：D 大调是 F♯ 不是 G♭）、频率、音程计算务必核对；可以用 `MT` 在浏览器控制台里验证。
7. **版权**：示例旋律只用公有领域作品（民歌、古典音乐、上世纪 20 年代以前的歌曲，如《小星星》《欢乐颂》《两只老虎》《生日快乐》《茉莉花》《送别》《铃儿响叮当》等）。可以提歌名，**不要大段引用受版权保护的歌词**；歌词最多引用一两个字词作为提示。
8. **中文排版**：中文与英文/数字之间加空格；用全角标点；音名用 Unicode 升降号（♯ ♭ ♮），在 data 属性里用 ASCII（`F#4`、`Bb3`）。
   **注意**：`data-*` 属性值（尤其 `data-caption`）里不要出现英文双引号 `"`，否则属性会被截断——用中文引号“”或 `&quot;`；需要在记谱里写带空格的文字时，用单引号包裹整个属性值。
9. 每章 5～6 道测验题，**至少 1 道听力题**，每题都写解析；章末"课后练一练"链接到相关工具（`../tools/xxx.html`）。
10. 章与章之间多做呼应："第 X 章会详细讲""回忆一下第 X 章的……"。

---

## 6. 各章大纲

> 括号里是建议的互动内容。可以根据写作需要微调小节，但请保持编号连续、覆盖所列知识点。

### 第 2 章 音名、唱名与键盘（02-keyboard.html，ch02）
- 2.1 七个基本音：音名 C D E F G A B、唱名 do re mi fa sol la si、简谱 1～7 三套叫法的对照；音名循环（B 之后又是 C）；（键盘标签可切换 音名/唱名/简谱 的交互；C 大调音阶播放）
- 2.2 认识钢琴键盘：白键与黑键，88 键 = 52 白 + 36 黑；黑键"2 个一组、3 个一组"；找 C：两个黑键左边的白键；找 F：三个黑键左边；（"点出所有的 D"小游戏）
- 2.3 半音与全音：相邻两键 = 半音，隔一个键 = 全音；E–F、B–C 之间没有黑键，是天然的半音；（演示与小练习）
- 2.4 变音记号：升号 ♯、降号 ♭、还原号 ♮（重升、重降简介）；黑键的两个名字与"等音"（C♯ = D♭），白键也可以有别名（E♯ = F、C♭ = B）；变音记号的有效范围预告
- 2.5 音区与八度编号：科学音高记号（C4 = 中央 C，每到 C 换一个编号，B3 → C4）；88 键从 A0 到 C8；国内教材"大字组/小字组/小字一组 c¹"对照表；简谱高低音点预告
- 小结 / 测验 / 课后练一练（在线钢琴：找到所有 F♯；用电脑键盘弹 C 大调音阶）

### 第 3 章 看懂乐谱：五线谱与简谱（03-notation.html，ch03）
- 3.1 五线谱：五线四间，从下往上数（`data-staff-labels`）；位置越高音越高；音符在线上/间里交替
- 3.2 谱号：高音谱号（G 谱号，圈住第二线 = G4）、低音谱号（F 谱号，两点夹住第四线 = F3）、中音谱号简介；同一位置在不同谱号下是不同的音
- 3.3 加线与大谱表：上加线、下加线；中央 C 在高音谱表下加一线、低音谱表上加一线；大谱表（钢琴谱）
- 3.4 快速识谱技巧：口诀（高音谱表线 E G B D F、间 F A C E；低音谱表线 G B D F A、间 A C E G）；地标音法；"线间相邻差一个音名"的数法；（显示/隐藏音名的练习）
- 3.5 简谱入门：1～7 与 0；高音点、低音点；"1=C"表示调（第 6 章详述）；增时线和减时线简介（第 4 章详述）；《小星星》《欢乐颂》的简谱与五线谱对照（都可播放）
- 3.6 五线谱 vs 简谱：对照表（直观性、适用场景、转调、多声部），建议都学
- 小结 / 测验 / 课后练一练（识谱练习工具）

### 第 4 章 节奏与节拍（04-rhythm.html，ch04）
- 4.1 拍子与速度：拍 = 音乐的心跳；BPM；速度术语表（Largo 广板…Presto 急板）；小节拍器 `data-metronome`
- 4.2 音符时值：音符的结构（符头、符干、符尾/符杠）；全/二分/四分/八分/十六分（以四分音符为一拍）的"音符家族树"，每层可播放（带节拍器）；简谱对照（`1 - - -`、`1 -`、`1`、`1_`、`1__`）
- 4.3 休止符：五种休止符与时值对照；简谱的 0
- 4.4 附点与延音线：附点 = 延长一半；常见的"附点四分 + 八分"；延音线（同音相连，只弹一次）与圆滑线的区别（第 9 章详述）
- 4.5 拍号与小节：拍号上下数字的含义；小节线、终止线；常见拍号 2/4、3/4、4/4（C）、6/8；强弱规律（强弱 / 强弱弱 / 强弱次强弱 / 强弱弱次强弱弱），用带重音的节拍器播放
- 4.6 弱起、切分与三连音：弱起小节（《生日快乐》）；切分音（八分-四分-八分）；三连音
- 4.7 节奏练习：由易到难 5～8 条单线节奏谱（`data-clef="rhythm" data-click data-count-in="1"`），"先听、再拍、再对照"
- 小结 / 测验（含"听节奏选谱"）/ 课后练一练（节拍器、节奏练习工具）

### 第 5 章 音程：音与音的距离（05-intervals.html，ch05）
- 5.1 什么是音程：旋律音程与和声音程
- 5.2 度数：数音名（包含两端）；同音是一度、八度是八度；度数只看音名不看升降（C–E♭ 仍是三度、C–D♯ 是二度）
- 5.3 音程的性质：纯、大、小、增、减；"一四五八用纯，二三六七分大小"；半音数对照
- 5.4 常见音程一览：0～12 半音总表（名称、半音数、以 C 为根的例子、听感、旋律/和声两种播放按钮；只用确定无误的公有领域歌曲作记忆提示，没有就不写）
- 5.5 协和与不协和：完全协和、不完全协和、不协和；不协和 ≠ 难听，"紧张—解决"（三全音解决到三度的演示）
- 5.6 音程转位：度数相加等于 9；大↔小、增↔减、纯↔纯
- 5.7 快速判断音程的方法：三步法；"大调音阶尺子"法；复音程简介
- 小结 / 测验（至少 2 道听力题）/ 课后练一练（练耳训练）

### 第 6 章 音阶与调（06-scales-keys.html，ch06）
- 6.1 什么是音阶、什么是调：主音是"家"；停在主音和不停在主音的听感对比
- 6.2 大调音阶：全全半全全全半；C 大调；在任意音上构建（G 大调需要 F♯、F 大调需要 B♭）；（选根音 → 键盘 + 五线谱 + 全/半标注 的交互）
- 6.3 小调音阶：自然小调（全半全全半全全）；a 小调；和声小调（升高第 7 级、导音）、旋律小调（上行升 6、7 级，下行还原）
- 6.4 关系大小调与同主音大小调：C 大调 ↔ a 小调；同一旋律大调版/小调版对比
- 6.5 调号：升号顺序 F C G D A E B、降号顺序 B E A D G C F；认调方法（最后一个升号上方小二度；倒数第二个降号）；多个调号的五线谱示例
- 6.6 五度圈：顺时针加升号、逆时针加降号、内圈关系小调、相邻调关系近（链接五度圈工具）
- 6.7 五声音阶与中国调式：宫商角徵羽 = 1 2 3 5 6；没有半音；黑键就是五声音阶；五种调式简介；《茉莉花》片段
- 6.8 首调唱名与固定调唱名：简谱"1=G"是首调；固定调 do 永远是 C；对照表
- 6.9（可折叠）进阶预告：教会调式（Dorian、Lydian 等）试听
- 小结 / 测验 / 课后练一练（和弦与音阶词典、五度圈）

### 第 7 章 和弦（07-chords.html，ch07）
- 7.1 什么是和弦：三个或以上的音同时发声；三度叠置；根音、三音、五音
- 7.2 四种三和弦：大三、小三、减三、增三（结构、听感、对比播放；选根音 + 类型的交互）
- 7.3 和弦的写法：和弦符号（C、Cm、Cdim/C°、Caug/C+）；级数（罗马数字 I ii iii IV V vi vii°）
- 7.4 七和弦：大七、属七、小七、半减七、减七（公式、听感）；属七想"回家"（G7→C）
- 7.5 和弦转位：原位、第一转位、第二转位；斜线和弦 C/E；转位让低音更平滑（演示对比）
- 7.6 调内和弦：大调"大小小大大小减"；C 大调 C Dm Em F G Am B°；小调的调内和弦；（选调 → 七个和弦可播放的交互）
- 7.7 挂留和弦与加音和弦：sus2、sus4、add9、6
- 小结 / 测验 / 课后练一练（在线钢琴的和弦识别、和弦词典）

### 第 8 章 和弦进行与和声入门（08-progressions.html，ch08）
- 8.1 和弦的功能：主（T）、下属（S）、属（D）——"在家—出门—想回家"
- 8.2 终止式：正格（V→I）、变格（IV→I）、半终止（→V）、阻碍终止（V→vi）
- 8.3 流行音乐常用和弦进行：I–V–vi–IV、卡农进行、4536251/王道进行、I–vi–ii–V、ii–V–I、vi–IV–I–V、小调 i–VI–III–VII、12 小节布鲁斯（可选调播放）
- 8.4 给旋律配和弦：强拍旋律音属于哪个调内和弦；《小星星》配和弦（大谱表，可播放）；《欢乐颂》练习
- 8.5 伴奏织体入门：柱式、分解、节奏型；同一进行不同伴奏的对比
- 8.6 动手写一段和弦进行：步骤 + 链接和弦进行播放器
- 小结 / 测验 / 课后练一练

### 第 9 章 表情记号与曲式（09-expression-form.html，ch09）
- 9.1 力度记号：pp～ff、渐强渐弱、sfz、fp；同一乐句不同力度对比
- 9.2 速度与速度变化：速度术语回顾；rit./rall.、accel.、a tempo、延长记号
- 9.3 演奏法记号：连奏（圆滑线）、跳音、重音、保持音；延音线与圆滑线的区别
- 9.4 反复与跳跃记号：反复记号、第一/二房子、D.C.、D.S.、Fine、Coda；演奏顺序图解（谱例可播放，播放器会按反复展开）
- 9.5 曲式入门：动机、乐句、乐段；一段体、二段体 AB、三段体 ABA、回旋曲、变奏曲；流行歌曲结构（前奏、主歌、预副歌、副歌、桥段、尾奏）的彩色时间轴
- 9.6 旋律写作小技巧：级进与跳进、重复与模进、问句与答句、收在主音；用五声音阶写 4 小节的小练习
- 小结 / 测验 / 课后练一练 / 结语（学完全部章节，下一步学什么）

### 附录 速查手册（appendix.html，appendix）
音名对照、音程总表、和弦公式、音阶公式、调号总表、速度术语、力度与常用记号、术语中英对照、下一步学习建议。

---

## 7. 工具需求

所有工具：顶部 `.tool-header`；主要操作在 `.panel` 中；有"使用说明"区（`h2.toc-anchor`）与相关章节链接；移动端可用；快捷键在说明中列出；设置可存 localStorage（键名以 `mt-` 开头）。

- **在线钢琴 piano**：大键盘（默认 3 个八度，可选 2～5 个八度，八度左右移动）；电脑键盘弹奏（A W S E D F T G Y H U J K O L P ; ' 对应 C 起的半音，Z/X 移八度，键上显示按键提示可开关）；标签切换（音名/唱名/简谱/无）；延音踏板（按住空格 / 开关按钮）；音色与音量；信息面板（当前按下的音、两音显示音程、三音以上识别和弦及转位、最后一个音的频率）；音阶/和弦高亮（选根音 + 类型）；跟弹模式（公有领域儿歌/名曲，提示下一个键，弹对才前进，可"示范"）；录音与回放；Web MIDI 输入（可用时）。
- **节拍器 metronome**：大号 BPM、±按钮、滑块（20～300）、敲击测速（T 键）、速度术语；拍号（每小节拍数 1～12、单位音符；常用预设 2/4 3/4 4/4 6/8 5/4 7/8）；点击拍点循环切换 强/次强/弱/静音；细分（无/八分/三连音/十六分）；音色（木鱼/电子/咔哒）与音量；拍点闪烁、小节计数、可选摆锤动画；练习计时；速度训练（每 N 小节加 X BPM 直到目标）；静音小节训练；快捷键（空格、↑↓、←→、T）。使用 `Sound.createClock`。
- **调音器 tuner**：麦克风音高检测（自相关/YIN）；显示音名、频率、音分偏差指针，±5 音分内变绿；A4 基准可调（430～450）；乐器预设（吉他 EADGBE、尤克里里 GCEA、小提琴 GDAE、贝斯 EADG、自由）及每根弦的参考音；参考音发生器；权限被拒/不支持时给出友好提示（说明需要 localhost 或 https）；声明音频只在本地处理。
- **节奏练习 rhythm**：难度预设（入门/基础/进阶/挑战）、小节数、BPM；随机生成合法的 4/4（可选 3/4）节奏并用单线节奏谱显示；"听示范"（带预备拍和节拍器、播放高亮）；"跟着拍"（预备一小节后用空格/按钮/触屏敲击，按音频时钟计时，逐音判定准确/偏早/偏晚/漏拍并着色，给出准确率）；可显示数拍读法（1 + 2 + …）。
- **练耳训练 ear**：模式：音高比较（哪个高）、音程辨认（可选包含的音程、上行/下行/和声）、和弦性质（大/小/减/增，可选七和弦）、音阶调式（大调/自然小调/和声小调…）、单音辨认（先给参考音 C）；流程：播放 → 作答 → 反馈（在键盘和五线谱上显示正确答案）→ 下一题；"再听一次""参考音"；本次统计、连对、各项正确率（localStorage）。
- **识谱练习 reading**：谱号（高音/低音/混合）、音域（谱内/含加线）、是否含变音记号、作答方式（音名按钮/唱名按钮/钢琴键盘精确到八度）；练习模式与 60 秒挑战（最佳记录）；反馈带声音和颜色；统计正确率、平均用时、最易错的音；电脑键盘 C D E F G A B 作答。
- **和弦与音阶词典 dictionary**：两个标签页。和弦：根音（含 C♯/D♭ 等拼法）、类型分组（三和弦/七和弦/挂留与加音/其他）、转位；显示符号、中文名、公式、组成音（正确拼写）、相邻音程结构、听感，键盘高亮带 R/3/5/7 标签，五线谱，柱式/琶音播放。音阶：根音 + 类型（MT.SCALES）；显示组成音、全/半结构、听感、键盘、五线谱、上行/下行播放；大调/小调显示调内和弦（可点击播放）。支持 URL hash 分享状态。
- **五度圈 circle**：可点击 SVG 圆环（外圈大调、内圈关系小调、调号数量），选中后高亮相邻调（属调/下属调）与"同一组调内和弦"区域；详情面板：调名、关系小调、五线谱上的调号、升降号列表、音阶（可播放）、调内和弦（可播放并在键盘显示）、主要和弦 I–IV–V；等音调（F♯/G♭ 等）说明；"怎么看五度圈"说明。
- **和弦进行播放器 progression**：调（12 个，大/小调）、速度、每和弦拍数、循环；预设（1564、卡农、4536251、王道进行、1625、6415、251、12 小节布鲁斯、小调 i–VI–III–VII 等）；自定义：点击级数和弦（I ii iii IV V vi vii°、V7、♭VII、iv 等）追加，可删除/清空；伴奏型（柱式、分解、流行、华尔兹 3/4、民谣扫弦）；鼓点开关（`Sound.drum`）；平滑转位（选择离上一个和弦最近的转位）；当前和弦高亮、键盘显示、和弦名 + 级数；URL hash 分享。使用 `Sound.createClock` 做循环调度。
