"""生成静态部署产物到 public/ 目录。

单文件 index.html 直接作为站点根，附带 404 兜底与站点元数据，
public/ 目录可直接整体上传到任意静态托管（Vercel / Netlify / Gitee Pages / Nginx 等）。
"""

import io
import os
import shutil
import sys

SRC = 'index.html'
OUT = 'public'

if not os.path.isfile(SRC):
    sys.exit('index.html not found')

html = io.open(SRC, encoding='utf-8').read()
if not html.lstrip().startswith('<!DOCTYPE html>'):
    sys.exit('index.html missing DOCTYPE')

if os.path.isdir(OUT):
    shutil.rmtree(OUT)
os.makedirs(OUT)

# 1) 主页面：原样拷贝（已是零外部请求单文件）
io.open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8', newline='\n').write(html)

# 2) 404 兜底：静态托管找不到路径时回到首页（适用于纯前端无路由场景）
io.open(os.path.join(OUT, '404.html'), 'w', encoding='utf-8', newline='\n').write(
    '<!DOCTYPE html>\n'
    '<html lang="zh-CN"><head><meta charset="utf-8">\n'
    '<meta http-equiv="refresh" content="0;url=/">\n'
    '<title>页面不存在 - 熊熊雀庄团队赛事规则</title></head>\n'
    '<body><p style="font-family:system-ui,sans-serif;padding:40px">页面不存在，'
    '正在返回<a href="/">首页</a>…</p></body></html>\n'
)

# 3) 关闭 Jekyll 处理（GitHub Pages 下避免忽略以下划线开头的文件）
io.open(os.path.join(OUT, '.nojekyll'), 'w', encoding='utf-8', newline='\n').write('')

# 4) robots：允许收录
io.open(os.path.join(OUT, 'robots.txt'), 'w', encoding='utf-8', newline='\n').write(
    'User-agent: *\nAllow: /\n'
)

size = os.path.getsize(os.path.join(OUT, 'index.html'))
print('public/ built')
for name in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, name)
    print('  {:12s} {:>8d} bytes'.format(name, os.path.getsize(p)))
print('index.html size', size)
