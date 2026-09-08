"""精确输出：红色虚线框 bbox、白托板 bbox、底部文字行 bbox。"""
from PIL import Image
import numpy as np

im = Image.open('output/images/edit-2026-08-28T08-23-52-838Z-1.png').convert('RGB')
a = np.asarray(im).astype(int)
r, g, b = a[..., 0], a[..., 1], a[..., 2]

reg = (slice(1322, 1512), slice(665, 895))
red = ((r > 140) & (g < 120) & (b < 140))[reg]
white = (a > 247).all(axis=2)[reg]
dark = (a.mean(axis=2) < 140)[reg]

Y0, X0 = 1322, 665


def bbox(m, name, minc=1):
    ys = np.where(m.sum(axis=1) >= minc)[0]
    xs = np.where(m.sum(axis=0) >= minc)[0]
    print(f'{name}: x {xs.min()+X0}..{xs.max()+X0}  y {ys.min()+Y0}..{ys.max()+Y0}')


bbox(red, '红虚线框')
bbox(white, '白托板 ')
# 底部文字行单独看
txt = dark[1489 - Y0:1510 - Y0, :]
ys = np.where(txt.sum(axis=1) > 0)[0]
xs = np.where(txt.sum(axis=0) > 0)[0]
print(f'长按识别文字: x {xs.min()+X0}..{xs.max()+X0}  y {ys.min()+1489}..{ys.max()+1489}')

# 白托板每行宽度，找纯白内区
w = white.sum(axis=1)
for i in range(0, white.shape[0], 10):
    print(1322 + i, w[i])
