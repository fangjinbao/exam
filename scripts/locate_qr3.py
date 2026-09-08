"""确定假码本体（不含底部文字行）的列范围与最终替换方框。"""
from PIL import Image
import numpy as np

im = Image.open('output/images/edit-2026-08-28T08-23-52-838Z-1.png').convert('RGB')
a = np.asarray(im).astype(int)

# 码本体行区间（1491 起是「长按识别」文字）
y0, y1 = 1326, 1491
x0, x1 = 670, 890
sub = a[y0:y1, x0:x1]
dark = sub.mean(axis=2) < 170
cols = dark.sum(axis=0)
nz = np.where(cols > 0)[0]
print('码本体列范围 x:', nz.min() + x0, nz.max() + x0)
rows = dark.sum(axis=1)
nzr = np.where(rows > 0)[0]
print('码本体行范围 y:', nzr.min() + y0, nzr.max() + y0)
print('宽高:', nz.max() - nz.min() + 1, nzr.max() - nzr.min() + 1)
