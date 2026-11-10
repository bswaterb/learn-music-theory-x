"""把 gen_appendix_tables.js 生成的表格填入 chapters/appendix.html（可重复执行）
用法：python3 scripts/fill_appendix.py
"""
import json, re, subprocess, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
data = json.loads(subprocess.check_output(['node', str(root / 'scripts/gen_appendix_tables.js')]))
p = root / 'chapters/appendix.html'
s = p.read_text(encoding='utf-8')
for key, html in data.items():
    block = f'<!--GEN:{key}-->\n{html}<!--/GEN:{key}-->'
    pat = re.compile(rf'<!--GEN:{key}-->(.*?<!--/GEN:{key}-->)?', re.S)
    s, n = pat.subn(lambda m: block, s, count=1)
    print(key, 'ok' if n else 'MISSING')
p.write_text(s, encoding='utf-8')
