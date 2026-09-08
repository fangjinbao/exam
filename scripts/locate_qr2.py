"""细化：托板内假码的精确 bbox，排除底部「长按识别」文字行。"""
from PIL import Image
import numpy as np

im = Image.open('output/images/edit-2026-08-28T08-23-52-838Z-1.png').convert('RGB')
a = np.asarray(im).astype(int)

x0, x1, y0, y1 = 660, 900, 1305, 1525
sub = a[y0:y1, x0:x1]
lum = sub.mean(axis=2)
dark = lum < 160

print('逐行深色像素数（y, count）:')
for i, c in enumerate(dark.sum(axis=1)):
    if c:
        print(y0 + i, c)
