"""定位托板白色内区：在右下角找最大连通纯白矩形（虚线框内部）。"""
import numpy as np
from PIL import Image

SRC = 'output/images/edit-2026-08-28T08-55-24-575Z-1.png'
im = Image.open(SRC).convert('RGB')
a = np.asarray(im).astype(int)
H, W = a.shape[:2]
white = a.min(axis=2) > 246

# 搜索区：缎带下方、偏右
Y0, X0 = 1440, 570
sub = white[Y0:, X0:]
h, w = sub.shape

# 每行找最长连续白色区间，取长度 > 120 的行作为托板行
best = {}
for i in range(h):
    row = sub[i]
    run = start = 0
    bl = bs = 0
    for j in range(w):
        if row[j]:
            if run == 0:
                start = j
            run += 1
            if run > bl:
                bl, bs = run, start
        else:
            run = 0
    if bl > 120:
        best[i] = (bs, bs + bl - 1, bl)

rows = sorted(best)
# 取最长连续行段
segs, cur = [], [rows[0]]
for y in rows[1:]:
    if y - cur[-1] <= 2:
        cur.append(y)
    else:
        segs.append(cur)
        cur = [y]
segs.append(cur)
seg = max(segs, key=len)

top, bot = seg[0], seg[-1]
lefts = [best[y][0] for y in seg]
rights = [best[y][1] for y in seg]
left = int(np.median(lefts))
right = int(np.median(rights))
print('PLATE =', (left + X0, top + Y0, right + X0, bot + Y0))
print('尺寸', right - left + 1, 'x', bot - top + 1)
