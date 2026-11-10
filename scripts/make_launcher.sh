#!/bin/sh
# 生成「乐理入门.app」桌面入口：双击即在后台启动本地服务（不开终端窗口）并用默认浏览器打开网站。
#
#   sh scripts/make_launcher.sh                  生成到桌面（~/Desktop）
#   sh scripts/make_launcher.sh /Applications    生成到其他文件夹，比如"应用程序"
#
# 只用 macOS 自带工具（osacompile / osascript / sips / iconutil / codesign），可以重复运行：
# 移动了项目文件夹之后，在新位置重新运行一次即可。
set -e

ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEST_DIR=${1:-"$HOME/Desktop"}
NAME="乐理入门"
APP="$DEST_DIR/$NAME.app"
BUNDLE_ID="local.musictheory.launcher"

if [ "$(uname)" != "Darwin" ]; then echo "这个脚本只适用于 macOS。" >&2; exit 1; fi
[ -d "$DEST_DIR" ] || { echo "目标文件夹不存在：$DEST_DIR" >&2; exit 1; }

# 已经有同名 App：是我们生成的就替换，不是就停下，免得误删别的程序
if [ -e "$APP" ]; then
  OLD_ID=$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$APP/Contents/Info.plist" 2>/dev/null || true)
  if [ "$OLD_ID" != "$BUNDLE_ID" ]; then
    echo "$APP 已存在，而且不是这个脚本生成的，为安全起见没有覆盖。请先改名或移走它。" >&2
    exit 1
  fi
  rm -rf "$APP"
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# ---------- 1. 启动脚本（AppleScript） ----------
# 项目路径写进脚本；路径里的 \ 和 " 需要转义
ROOT_AS=$(printf '%s' "$ROOT" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
cat > "$TMP/launcher.applescript" <<EOF
-- 乐理入门 · 桌面启动入口（由 scripts/make_launcher.sh 生成，可重复生成）
-- 双击：在后台启动本地服务（不打开终端窗口），并用默认浏览器打开网站；服务已经在运行时直接打开网站。
-- 所有页面都关闭 10 分钟后，服务会自动退出，不会一直占用电脑资源。
on run
	set projectDir to "$ROOT_AS"
	try
		do shell script "test -f " & quoted form of (projectDir & "/start.sh")
	on error
		display dialog "找不到「乐理入门」的项目文件夹：" & return & projectDir & return & return & "如果移动过这个文件夹，请在新位置打开终端运行：" & return & "sh scripts/make_launcher.sh" & return & "重新生成桌面入口。" with title "乐理入门" buttons {"好"} default button 1 with icon caution
		return
	end try
	try
		do shell script "cd " & quoted form of projectDir & " && PATH=/opt/homebrew/bin:/usr/local/bin:\$PATH /bin/sh ./start.sh --bg"
	on error errMsg
		set choice to button returned of (display dialog "本地服务没能启动：" & return & errMsg & return & return & "也可以不启动服务，直接打开网页学习（除了麦克风调音器，其他功能都能用）。" with title "乐理入门" buttons {"取消", "直接打开网页"} default button 2 cancel button 1 with icon caution)
		if choice is "直接打开网页" then do shell script "open " & quoted form of (projectDir & "/index.html")
	end try
end run
EOF
/usr/bin/osacompile -o "$APP" "$TMP/launcher.applescript"

# ---------- 2. 图标：用 AppKit 画 1024×1024 的 PNG，再做成 .icns ----------
cat > "$TMP/icon.js" <<'EOF'
// 紫色渐变圆角方块 + 白色双八分音符（♫），配色与网站 Logo 一致
ObjC.import('AppKit');
function rgb(r, g, b, a) { return $.NSColor.colorWithSRGBRedGreenBlueAlpha(r / 255, g / 255, b / 255, a == null ? 1 : a); }
function run(argv) {
  var S = 1024;
  var rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
    null, S, S, 8, 4, true, false, 'NSDeviceRGBColorSpace', 0, 0);
  var ctx = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep);
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.setCurrentContext(ctx);

  // 底板：macOS 图标网格（824×824，圆角约 186），带轻微投影
  var box = $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius($.NSMakeRect(100, 110, 824, 824), 186, 186);
  $.NSGraphicsContext.saveGraphicsState;
  var sh = $.NSShadow.alloc.init;
  sh.shadowBlurRadius = 24;
  sh.shadowOffset = $.NSMakeSize(0, -10);
  sh.shadowColor = rgb(20, 15, 60, 0.30);
  sh.set;
  rgb(81, 69, 205).setFill;
  box.fill;
  $.NSGraphicsContext.restoreGraphicsState;
  $.NSGradient.alloc.initWithStartingColorEndingColor(rgb(84, 70, 214), rgb(160, 96, 246)).drawInBezierPathAngle(box, -50);
  $.NSGradient.alloc.initWithStartingColorEndingColor(rgb(255, 255, 255, 0.20), rgb(255, 255, 255, 0)).drawInBezierPathAngle(box, -90);

  // 音符：按设计坐标画，再整体缩放、居中
  var t = $.NSAffineTransform.transform;
  t.translateXByYBy(512, 522);
  t.scaleBy(0.84);
  t.translateXByYBy(-527, -546);
  t.concat;
  $.NSGraphicsContext.saveGraphicsState;
  var sh2 = $.NSShadow.alloc.init;
  sh2.shadowBlurRadius = 18;
  sh2.shadowOffset = $.NSMakeSize(0, -8);
  sh2.shadowColor = rgb(40, 20, 120, 0.35);
  sh2.set;
  $.NSColor.whiteColor.setFill;
  function head(cx, cy) {
    var p = $.NSBezierPath.bezierPathWithOvalInRect($.NSMakeRect(-92, -66, 184, 132));
    var m = $.NSAffineTransform.transform;
    m.translateXByYBy(cx, cy);
    m.rotateByDegrees(24);
    p.transformUsingAffineTransform(m);
    return p;
  }
  var notes = $.NSBezierPath.bezierPath;
  notes.appendBezierPath(head(392, 318));
  notes.appendBezierPath(head(662, 372));
  notes.appendBezierPath($.NSBezierPath.bezierPathWithRect($.NSMakeRect(450, 330, 32, 470)));
  notes.appendBezierPath($.NSBezierPath.bezierPathWithRect($.NSMakeRect(718, 384, 32, 462)));
  var beam = $.NSBezierPath.bezierPath;
  beam.moveToPoint($.NSMakePoint(450, 704));
  beam.lineToPoint($.NSMakePoint(750, 758));
  beam.lineToPoint($.NSMakePoint(750, 854));
  beam.lineToPoint($.NSMakePoint(450, 800));
  beam.closePath;
  notes.appendBezierPath(beam);
  notes.setWindingRule(0);
  notes.fill;
  $.NSGraphicsContext.restoreGraphicsState;

  $.NSGraphicsContext.restoreGraphicsState;
  rep.representationUsingTypeProperties(4 /* PNG */, $({})).writeToFileAtomically(argv[0], true);
  return 'ok';
}
EOF
/usr/bin/osascript -l JavaScript "$TMP/icon.js" "$TMP/icon.png" >/dev/null
mkdir "$TMP/AppIcon.iconset"
for s in 16 32 128 256 512; do
  /usr/bin/sips -z "$s" "$s" "$TMP/icon.png" --out "$TMP/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  /usr/bin/sips -z "$d" "$d" "$TMP/icon.png" --out "$TMP/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
/usr/bin/iconutil -c icns "$TMP/AppIcon.iconset" -o "$APP/Contents/Resources/applet.icns"
# 新版 osacompile 会用 Assets.car 里的默认图标，去掉它才能用上面的 applet.icns
rm -f "$APP/Contents/Resources/Assets.car"
/usr/bin/plutil -remove CFBundleIconName "$APP/Contents/Info.plist" 2>/dev/null || true

# ---------- 3. 应用信息 + 重新签名（改过图标后需要重新做一次本机签名） ----------
/usr/bin/plutil -replace CFBundleIdentifier -string "$BUNDLE_ID" "$APP/Contents/Info.plist"
/usr/bin/plutil -replace CFBundleShortVersionString -string "1.0" "$APP/Contents/Info.plist"
/usr/bin/plutil -replace NSHumanReadableCopyright -string "乐理入门 · 本地学习网站启动器" "$APP/Contents/Info.plist"
/usr/bin/codesign --force --deep --sign - "$APP" >/dev/null 2>&1
touch "$APP"

echo "已生成：$APP"
echo "双击它就会启动本地服务并打开网站；也可以把它拖到程序坞（Dock）里，以后点一下就能学习。"
