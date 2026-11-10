#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""乐理入门 · 本地服务（只用 Python 标准库，3.8+）

  python3 scripts/serve.py                启动并打开浏览器（已经在运行就直接打开）
  python3 scripts/serve.py start --bg     后台启动，不占用终端窗口
  python3 scripts/serve.py stop           停止所有正在运行的服务
  python3 scripts/serve.py status         查看运行状态和已打开的页面

常用选项（start）：
  --port 8765        首选端口，被其他程序占用时自动换下一个
  --idle 10          没有任何页面打开 N 分钟后自动退出；0 = 不自动退出
  --page 路径        打开指定页面，例如 tools/metronome.html
  --no-open          启动后不打开浏览器
  --strict-port      只用 --port 指定的端口，被占用就报错（给编辑器预览用）

除了静态文件，服务还提供一个很小的控制接口（只监听 127.0.0.1）：
  GET  /__svc/ping       探测是否是本服务
  GET  /__svc/status     运行状态 + 当前打开的页面
  POST /__svc/heartbeat  页面每 20 秒报一次"我还开着"
  POST /__svc/bye        页面关闭时告别
  POST /__svc/config     修改自动退出时间（需请求头 X-MT-Svc: 1）
  POST /__svc/shutdown   关闭服务（需请求头 X-MT-Svc: 1）
网页里的「服务管理」就是通过它显示状态、关闭服务器的。
"""
import argparse
import http.server
import json
import os
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
import webbrowser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
RUN_DIR = ROOT / '.run'
CONFIG_FILE = RUN_DIR / 'config.json'
LOG_FILE = RUN_DIR / 'server.log'
APP = 'music-theory'
API = '/__svc/'
HOST = '127.0.0.1'
DEFAULT_PORT = 8765
DEFAULT_IDLE = 10
CLIENT_TTL = 90  # 页面超过这么多秒没心跳就当作已关闭（浏览器会把后台标签页的定时器放慢到每分钟一次）
VERBOSE = False


def say(*parts):
    print(time.strftime('[%H:%M:%S]'), *parts, flush=True)


def state_file(port):
    return RUN_DIR / ('server-%d.json' % port)


def load_config():
    try:
        return json.loads(CONFIG_FILE.read_text(encoding='utf-8'))
    except Exception:
        return {}


def save_config(cfg):
    try:
        RUN_DIR.mkdir(exist_ok=True)
        CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding='utf-8')
    except OSError:
        pass


def write_json_atomic(path, data):
    RUN_DIR.mkdir(exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    os.replace(str(tmp), str(path))


def fmt_minutes(sec):
    m = int(sec // 60)
    if m < 1:
        return '不到 1 分钟'
    if m < 60:
        return '%d 分钟' % m
    return '%d 小时 %d 分钟' % (m // 60, m % 60)


# --------------------------------------------------------------------------
# 运行中的服务：记录打开的页面，空闲时自动退出
# --------------------------------------------------------------------------
class Hub:
    def __init__(self, port, idle_minutes):
        self.lock = threading.Lock()
        self.instance = uuid.uuid4().hex[:12]
        self.port = port
        self.idle_minutes = idle_minutes
        self.started = time.time()
        self.clients = {}
        self.empty_since = time.time()
        self.httpd = None
        self.stopping = False
        self.last_count = 0

    def _count_changed(self):
        """打印"打开的页面数"的变化（由 watchdog 每 5 秒采样调用，避免切换页面时刷屏）"""
        n = len(self.clients)
        if n == self.last_count:
            return
        if n == 0:
            tail = ('，%d 分钟内没有新页面就自动退出' % self.idle_minutes) if self.idle_minutes else ''
            say('所有页面都已关闭' + tail)
        else:
            say('当前打开的页面：%d 个' % n)
        self.last_count = n

    def beat(self, data):
        cid = str(data.get('id') or '')[:40]
        if not cid:
            return
        now = time.time()
        with self.lock:
            c = self.clients.get(cid) or {'first': now}
            c.update(
                page=str(data.get('page') or '')[:200],
                title=str(data.get('title') or '')[:120],
                visible=bool(data.get('visible')),
                services=max(0, int(data.get('services') or 0)),
                last=now,
            )
            self.clients[cid] = c
            self.empty_since = None

    def bye(self, cid):
        with self.lock:
            if self.clients.pop(str(cid or ''), None) is not None and not self.clients:
                self.empty_since = time.time()

    def prune(self):
        now = time.time()
        with self.lock:
            for cid in [k for k, c in self.clients.items() if now - c['last'] > CLIENT_TTL]:
                del self.clients[cid]
            if not self.clients and self.empty_since is None:
                self.empty_since = now

    def snapshot(self, detail=False):
        now = time.time()
        with self.lock:
            snap = {
                'ok': True, 'app': APP, 'instance': self.instance, 'pid': os.getpid(), 'port': self.port,
                'started': int(self.started * 1000), 'uptime': int(now - self.started),
                'idle_minutes': self.idle_minutes, 'pages': len(self.clients),
                'shutdown_in': None,
            }
            if self.idle_minutes and self.empty_since is not None:
                snap['shutdown_in'] = max(0, int(self.idle_minutes * 60 - (now - self.empty_since)))
            if detail:
                snap['clients'] = sorted(
                    ({'id': k, 'page': c['page'], 'title': c['title'], 'visible': c['visible'], 'services': c['services'],
                      'since': int(c['first'] * 1000), 'last': int(c['last'] * 1000)} for k, c in self.clients.items()),
                    key=lambda x: x['since'])
        return snap

    def set_idle(self, minutes):
        with self.lock:
            self.idle_minutes = minutes
            if not self.clients:
                self.empty_since = time.time()
        cfg = load_config()
        cfg['idle_minutes'] = minutes
        save_config(cfg)
        say('自动退出时间改为：' + ('不自动退出' if not minutes else '没有页面 %d 分钟后' % minutes))

    def stop(self, reason):
        if self.stopping:
            return
        self.stopping = True
        say('正在关闭服务：' + reason)
        threading.Thread(target=self.httpd.shutdown, daemon=True).start()

    def watchdog(self):
        while not self.stopping:
            time.sleep(5)
            self.prune()
            with self.lock:
                self._count_changed()
                idle = self.idle_minutes and self.empty_since is not None and time.time() - self.empty_since >= self.idle_minutes * 60
            if idle:
                self.stop('已经 %d 分钟没有页面打开，自动退出以节省资源' % self.idle_minutes)


class Handler(http.server.SimpleHTTPRequestHandler):
    server_version = 'MusicTheory/1.0'
    hub = None  # 启动时赋值

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        if VERBOSE:
            super().log_message(fmt, *args)

    def end_headers(self):
        if not self.path.startswith(API):
            # 本地编辑友好：浏览器每次都确认文件有没有更新，改完刷新就能看到
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    # ---- 安全检查：只接受来自本机地址的请求，防止其他网站借浏览器操控本服务 ----
    def _allowed_hosts(self):
        p = self.hub.port
        return {'127.0.0.1:%d' % p, 'localhost:%d' % p, '[::1]:%d' % p}

    def host_ok(self):
        return (self.headers.get('Host') or '').lower() in self._allowed_hosts()

    def origin_ok(self):
        origin = self.headers.get('Origin')
        if not origin:
            return True
        return origin.lower() in {'http://' + h for h in self._allowed_hosts()}

    def hidden_path(self, path):
        return any(part.startswith('.') for part in unquote(path).split('/') if part)

    def do_GET(self):
        self._route('GET')

    def do_HEAD(self):
        self._route('HEAD')

    def do_POST(self):
        self._route('POST')

    def _route(self, method):
        if not self.host_ok():
            return self.send_error(403, 'Forbidden host')
        path = urlsplit(self.path).path
        if path.startswith(API):
            if method == 'POST' and not self.origin_ok():
                return self.send_error(403, 'Forbidden origin')
            return self.api(method, path[len(API):])
        if method == 'POST':
            return self.send_error(405)
        if self.hidden_path(path):
            return self.send_error(404)
        if method == 'HEAD':
            return super().do_HEAD()
        return super().do_GET()

    # ---- 控制接口 ----
    def read_json(self):
        try:
            n = min(int(self.headers.get('Content-Length') or 0), 65536)
            return json.loads(self.rfile.read(n).decode('utf-8') or '{}') if n else {}
        except Exception:
            return {}

    def send_json(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)

    def api(self, method, name):
        hub = self.hub
        if method in ('GET', 'HEAD'):
            if name == 'ping':
                return self.send_json({'ok': True, 'app': APP, 'instance': hub.instance, 'version': 1})
            if name == 'status':
                hub.prune()
                return self.send_json(hub.snapshot(detail=True))
            return self.send_error(404)
        body = self.read_json()
        if name == 'heartbeat':
            hub.beat(body)
            return self.send_json(hub.snapshot())
        if name == 'bye':
            hub.bye(body.get('id'))
            return self.send_json({'ok': True})
        # 以下是"写"操作：要求自定义请求头。其他网站发跨域请求时浏览器会先预检，本服务不放行，所以拦得住
        if self.headers.get('X-MT-Svc') != '1':
            return self.send_error(403, 'Missing X-MT-Svc header')
        if name == 'config':
            try:
                minutes = int(body.get('idle_minutes'))
            except (TypeError, ValueError):
                return self.send_json({'ok': False, 'error': 'idle_minutes 必须是整数'}, 400)
            if not 0 <= minutes <= 720:
                return self.send_json({'ok': False, 'error': 'idle_minutes 范围 0～720'}, 400)
            hub.set_idle(minutes)
            return self.send_json(hub.snapshot())
        if name == 'shutdown':
            self.send_json({'ok': True})
            hub.stop('收到 ./start.sh stop 命令' if body.get('by') == 'cli' else '网页上点了「关闭服务器」')
            return None
        return self.send_error(404)


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


# --------------------------------------------------------------------------
# 端口 / 实例管理
# --------------------------------------------------------------------------
def port_in_use(port):
    for family, addr in ((socket.AF_INET, '127.0.0.1'), (socket.AF_INET6, '::1')):
        try:
            with socket.socket(family, socket.SOCK_STREAM) as s:
                s.settimeout(0.3)
                if s.connect_ex((addr, port)) == 0:
                    return True
        except OSError:
            pass
    return False


def bind(port, strict):
    candidates = [port] if strict else list(range(port, port + 20)) + [0]
    last_err = None
    for p in candidates:
        if p and port_in_use(p):
            last_err = OSError('端口 %d 已被占用' % p)
            continue
        try:
            return Server((HOST, p), Handler)
        except OSError as e:
            last_err = e
    raise SystemExit('无法启动：%s' % last_err)


def ping(port, timeout=1.0):
    try:
        with urllib.request.urlopen('http://%s:%d%sping' % (HOST, port, API), timeout=timeout) as r:
            data = json.loads(r.read().decode('utf-8'))
            return data if data.get('app') == APP else None
    except Exception:
        return None


def running_instances():
    """返回仍在运行的实例 [{port, pid, ...}]，顺手清理已失效的状态文件。"""
    out = []
    if not RUN_DIR.exists():
        return out
    for f in sorted(RUN_DIR.glob('server-*.json')):
        try:
            info = json.loads(f.read_text(encoding='utf-8'))
        except Exception:
            info = None
        live = info and ping(int(info.get('port', 0)))
        if live and live.get('instance') == info.get('instance'):
            out.append(info)
        else:
            try:
                f.unlink()
            except OSError:
                pass
    return out


def page_url(port, page):
    page = (page or '').lstrip('/')
    return 'http://localhost:%d/%s' % (port, page)


def open_browser(url):
    try:
        webbrowser.open(url)
    except Exception:
        pass


# --------------------------------------------------------------------------
# 命令
# --------------------------------------------------------------------------
def cmd_start(args):
    if not args.strict_port:
        live = running_instances()
        if live:
            url = page_url(live[0]['port'], args.page)
            say('服务已经在运行：' + url)
            if not args.no_open:
                open_browser(url)
            return 0
    if args.bg:
        return start_background(args)
    return serve_foreground(args)


def start_background(args):
    RUN_DIR.mkdir(exist_ok=True)
    try:
        if LOG_FILE.exists() and LOG_FILE.stat().st_size > 1_000_000:
            LOG_FILE.unlink()
    except OSError:
        pass
    cmd = [sys.executable, str(Path(__file__).resolve()), 'start', '--no-open', '--port', str(args.port), '--idle', str(args.idle)]
    if args.strict_port:
        cmd.append('--strict-port')
    log = open(str(LOG_FILE), 'a', encoding='utf-8')
    kw = {'stdout': log, 'stderr': subprocess.STDOUT, 'stdin': subprocess.DEVNULL, 'cwd': str(ROOT)}
    if os.name == 'nt':
        kw['creationflags'] = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    else:
        kw['start_new_session'] = True
    proc = subprocess.Popen(cmd, **kw)
    for _ in range(60):
        time.sleep(0.1)
        live = [i for i in running_instances() if i.get('pid') == proc.pid]
        if live:
            url = page_url(live[0]['port'], args.page)
            say('已在后台启动：' + url)
            say('日志：%s；停止：./start.sh stop 或网页「服务管理」' % LOG_FILE.relative_to(ROOT))
            if not args.no_open:
                open_browser(url)
            return 0
        if proc.poll() is not None:
            break
    # 失败信息写到 stderr：从桌面图标启动时，启动器会把它显示在提示框里
    tail = ''
    try:
        tail = '\n'.join(LOG_FILE.read_text(encoding='utf-8').strip().splitlines()[-3:])
    except OSError:
        pass
    print('后台启动失败，详情见 %s%s' % (LOG_FILE, ('\n' + tail) if tail else ''), file=sys.stderr, flush=True)
    return 1


def serve_foreground(args):
    httpd = bind(args.port, args.strict_port)
    port = httpd.server_address[1]
    hub = Hub(port, args.idle)
    hub.httpd = httpd
    Handler.hub = hub
    sf = state_file(port)
    write_json_atomic(sf, {'app': APP, 'pid': os.getpid(), 'port': port, 'instance': hub.instance,
                           'started': int(hub.started), 'url': page_url(port, '')})

    def on_signal(signum, _frame):
        hub.stop({signal.SIGINT: '收到 Ctrl+C', signal.SIGTERM: '收到停止信号'}.get(signum, '终端窗口已关闭'))

    for sig in ('SIGINT', 'SIGTERM', 'SIGHUP'):
        if hasattr(signal, sig):
            signal.signal(getattr(signal, sig), on_signal)

    url = page_url(port, args.page)
    print('')
    print('  🎵 乐理入门 · 本地服务已启动')
    print('     地址：' + page_url(port, ''))
    if port != args.port:
        print('     （端口 %d 被占用，改用 %d）' % (args.port, port))
    print('     省资源：' + ('没有页面打开 %d 分钟后自动退出' % args.idle if args.idle else '不会自动退出（--idle 0）'))
    if sys.stdout.isatty():
        print('     停止：按 Ctrl+C / 关闭这个窗口 / 网页右上角「⚡ 服务」→ 关闭服务器')
    else:  # 后台运行（./start.sh --bg 或桌面图标启动），输出写在 .run/server.log 里
        print('     停止：./start.sh stop，或网页右上角「⚡ 服务」→ 关闭服务器（不用管它也行，会自动退出）')
    print('', flush=True)
    threading.Thread(target=hub.watchdog, daemon=True).start()
    if not args.no_open:
        threading.Timer(0.3, open_browser, args=(url,)).start()
    try:
        httpd.serve_forever(poll_interval=0.5)
    finally:
        httpd.server_close()
        try:
            sf.unlink()
        except OSError:
            pass
        say('服务已停止（本次运行时长：' + fmt_minutes(time.time() - hub.started) + '）。下次双击 start.command 或运行 ./start.sh 即可重新打开。')
    return 0


def cmd_stop(args):
    live = running_instances()
    if args.port_given:
        live = [i for i in live if int(i['port']) == args.port]
    if not live:
        say('没有正在运行的服务')
        return 0
    for info in live:
        port, pid = int(info['port']), int(info.get('pid') or 0)
        req = urllib.request.Request('http://%s:%d%sshutdown' % (HOST, port, API), data=b'{"by": "cli"}', method='POST',
                                     headers={'X-MT-Svc': '1', 'Content-Type': 'application/json'})
        try:
            urllib.request.urlopen(req, timeout=2).read()
        except Exception:
            pass
        for _ in range(30):
            if not ping(port, 0.3):
                break
            time.sleep(0.1)
        else:
            if pid and os.name != 'nt':
                try:
                    os.kill(pid, signal.SIGTERM)
                except OSError:
                    pass
        try:
            state_file(port).unlink()
        except OSError:
            pass
        say('已停止端口 %d 上的服务' % port)
    return 0


def cmd_status(_args):
    live = running_instances()
    if not live:
        say('没有正在运行的服务。启动：双击 start.command，或运行 ./start.sh')
        return 0
    for info in live:
        port = int(info['port'])
        try:
            with urllib.request.urlopen('http://%s:%d%sstatus' % (HOST, port, API), timeout=2) as r:
                s = json.loads(r.read().decode('utf-8'))
        except Exception as e:
            say('端口 %d：无法读取状态（%s）' % (port, e))
            continue
        idle = s['idle_minutes']
        print('● 运行中  %s  （PID %s，运行时长：%s）' % (page_url(port, ''), s['pid'], fmt_minutes(s['uptime'])))
        print('  自动退出：' + ('没有页面 %d 分钟后' % idle if idle else '关闭'))
        if s.get('shutdown_in') is not None:
            print('  当前没有页面打开，约 %s后自动退出' % fmt_minutes(s['shutdown_in'] + 59))
        clients = s.get('clients') or []
        print('  打开的页面：%d 个' % len(clients))
        for c in clients:
            extra = ('，%d 个服务运行中' % c['services']) if c['services'] else ''
            print('    - %s（%s%s）' % (c['title'] or c['page'], '前台' if c['visible'] else '后台', extra))
    return 0


def main(argv=None):
    global VERBOSE
    cfg = load_config()
    ap = argparse.ArgumentParser(description='乐理入门 · 本地服务', formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split('\n\n', 1)[1] if '\n\n' in __doc__ else None)
    ap.add_argument('command', nargs='?', default='start', choices=['start', 'stop', 'status'], help='默认 start')
    ap.add_argument('--port', type=int, default=None, help='首选端口（默认 %d）' % DEFAULT_PORT)
    ap.add_argument('--idle', type=int, default=None, help='没有页面打开 N 分钟后自动退出，0 = 不自动退出（默认 %d，网页里改过则用改过的值）' % DEFAULT_IDLE)
    ap.add_argument('--page', default='', help='要打开的页面，如 tools/metronome.html')
    ap.add_argument('--bg', action='store_true', help='后台运行（日志写到 .run/server.log）')
    ap.add_argument('--no-open', action='store_true', help='不自动打开浏览器')
    ap.add_argument('--strict-port', action='store_true', help='只用指定端口，不复用已运行的实例')
    ap.add_argument('--verbose', action='store_true', help='打印每个请求')
    args = ap.parse_args(argv)
    VERBOSE = args.verbose
    args.port_given = args.port is not None
    if args.port is None:
        args.port = DEFAULT_PORT
    if args.idle is None:
        try:
            args.idle = int(cfg.get('idle_minutes', DEFAULT_IDLE))
        except (TypeError, ValueError):
            args.idle = DEFAULT_IDLE
    args.idle = max(0, min(720, args.idle))
    return {'start': cmd_start, 'stop': cmd_stop, 'status': cmd_status}[args.command](args)


if __name__ == '__main__':
    sys.exit(main())
