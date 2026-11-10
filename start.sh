#!/bin/sh
# 乐理入门 · 一键启动脚本
#
#   ./start.sh              启动本地服务并打开浏览器（已经在运行就直接打开）
#   ./start.sh --bg         后台启动，不占用终端窗口
#   ./start.sh stop         停止服务
#   ./start.sh status       查看状态：端口、运行时长、打开了哪些页面
#   ./start.sh --page tools/metronome.html   直接打开某个页面
#   ./start.sh --idle 30    没有页面打开 30 分钟后才自动退出（默认 10，0 = 不自动退出）
#   ./start.sh --help       全部选项
#
# 只依赖 Python 3.8+（macOS 自带）。服务只监听本机 127.0.0.1，别的电脑访问不到。
# 想指定 Python：MT_PYTHON=/path/to/python3 ./start.sh
cd "$(dirname "$0")" || exit 1

# 依次尝试：MT_PYTHON → PATH 里的 python3 → Homebrew / 官方安装包 → 系统自带（从桌面图标启动时没有终端的 PATH，所以要多找几处）
pick_python() {
  for c in "$MT_PYTHON" python3 /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3 python; do
    [ -n "$c" ] || continue
    p=$(command -v "$c" 2>/dev/null) || continue
    # 没装命令行工具时，/usr/bin/python3 只是个"请安装"的占位程序，运行它会弹出安装窗口，所以先确认
    if [ "$p" = /usr/bin/python3 ] && ! xcode-select -p >/dev/null 2>&1; then continue; fi
    if "$p" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' >/dev/null 2>&1; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

if ! PY=$(pick_python); then
  echo "没有找到 Python 3（需要 3.8 或更高版本）。" >&2
  echo "  · macOS：在终端运行 xcode-select --install，或到 https://www.python.org 下载安装" >&2
  echo "  · 也可以直接双击 index.html 打开网站（除麦克风等少数功能外都能用）" >&2
  exit 1
fi

exec "$PY" scripts/serve.py "$@"
