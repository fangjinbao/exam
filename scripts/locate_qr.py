"""定位新海报底部卡片里的白色托板与模型画的假二维码 bbox。"""
from PIL import Image
import numpy as np

POSTER = 'output/images/edit-2026-08-28T08-23-52-838Z-1.png'

im = Image.open(POSTER).convert('RGB')
a = np.asarray(im).astype(int)
print('size', im.size)

# 只看底部卡片右半区
y0, y1, x0, x1 = 1300, 1536, 600, 1024
sub = a[y0:y1, x0:x1]

# 1) 纯白托板：三通道都 >= 248
white = (sub > 247).all(axis=2)
ys, xs = np.where(white)
print('白托板 bbox x:', xs.min() + x0, xs.max() + x0, ' y:', ys.min() + y0, ys.max() + y0)

# 2) 托板内的深色墨迹（假码 + 抖音角标 + 文字）
lum = sub.mean(axis=2)
dark = lum < 150
ys, xs = np.where(dark)
print('深色墨迹 bbox x:', xs.min() + x0, xs.max() + x0, ' y:', ys.min() + y0, ys.max() + y0)

# 3) 逐行/逐列统计白托板宽度，找托板真实边界
rows = white.sum(axis=1)
cols = white.sum(axis=0)
rr = np.where(rows > 40)[0]
cc = np.where(cols > 40)[0]
print('托板行范围 y:', rr.min() + y0, rr.max() + y0)
print('托板列范围 x:', cc.min() + x0, cc.max() + x0)
