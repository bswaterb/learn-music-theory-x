"""生成站内搜索索引 assets/js/search-index.js
扫描 chapters/*.html 与 tools/*.html：每个 <h2> 视为一个小节，收集小节标题、锚点和正文纯文本。
用法：python3 scripts/build_search_index.py
"""
import json
import pathlib
import re
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP = {'script', 'style', 'svg', 'noscript'}
MAX_TEXT = 5000


class Extractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.in_h1 = self.in_h2 = False
        self.in_kicker = False
        self.h1 = ''
        self.kicker = ''
        self.sections = []  # [{title, id, text}]
        self.cur = None
        self.h2_buf = ''

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in SKIP:
            self.skip += 1
            return
        if self.skip:
            return
        cls = a.get('class') or ''
        if tag == 'h1':
            self.in_h1 = True
        elif tag == 'h2':
            self.in_h2 = True
            self.h2_buf = ''
            self.cur = {'title': '', 'id': a.get('id', ''), 'text': ''}
            self.sections.append(self.cur)
        elif tag == 'div' and 'chapter-kicker' in cls:
            self.in_kicker = True
        elif tag in ('p', 'li', 'td', 'th', 'div', 'br', 'h3', 'h4', 'summary') and self.cur is not None:
            self.cur['text'] += ' '

    def handle_endtag(self, tag):
        if tag in SKIP:
            self.skip = max(0, self.skip - 1)
            return
        if tag == 'h1':
            self.in_h1 = False
        elif tag == 'h2' and self.in_h2:
            self.in_h2 = False
            self.cur['title'] = re.sub(r'\s+', ' ', self.h2_buf).strip()
        elif tag == 'div' and self.in_kicker:
            self.in_kicker = False

    def handle_data(self, data):
        if self.skip:
            return
        if self.in_h1:
            self.h1 += data
        elif self.in_kicker:
            self.kicker += data
        elif self.in_h2:
            self.h2_buf += data
        elif self.cur is not None:
            self.cur['text'] += data


def extract(path):
    p = Extractor()
    p.feed(path.read_text(encoding='utf-8'))
    return p


def main():
    out = []
    for folder in ('chapters', 'tools'):
        for f in sorted((ROOT / folder).glob('*.html')):
            ex = extract(f)
            h1 = re.sub(r'\s+', ' ', ex.h1).strip()
            kicker = re.sub(r'\s+', ' ', ex.kicker).strip()
            page_title = (kicker + ' ' + h1).strip() if folder == 'chapters' else '工具 · ' + h1
            rel = f'{folder}/{f.name}'
            if not ex.sections:
                out.append({'p': rel, 'c': page_title, 's': '', 'a': '', 't': ''})
            for s in ex.sections:
                text = re.sub(r'\s+', ' ', s['text']).strip()
                out.append({'p': rel, 'c': page_title, 's': s['title'], 'a': s['id'], 't': text[:MAX_TEXT]})
    js = '/* 搜索索引：由 scripts/build_search_index.py 自动生成，请勿手改 */\nwindow.MT_SEARCH_INDEX = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
    (ROOT / 'assets/js/search-index.js').write_text(js, encoding='utf-8')
    print(f'{len(out)} 条索引，{len(js) // 1024} KB')


if __name__ == '__main__':
    main()
