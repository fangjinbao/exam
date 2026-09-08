"""查清红色虚线描边相对白托板的位置，确定可安全擦除的内区。"""
from PIL import Image
import numpy as np

im = Image.open('output/images/edit-2026-08-28T08-23-52-838Z-1.png').convert('RGB')
a = np.asarray(im).astype(int)

r, g, b = a[..., 0], a[..., 1], a[..., 2]
red = (r > 150) & (g < 110) & (b < 130)
white = (a > 247).all(axis=2)

print('y=1400 这一行，x 660..900 的类型（W=白托板 R=红 .=其他）:')
row = ''
for x in range(660, 900):
    row += 'W' if white[1400, x] else ('R' if red[1400, x] else '.')
print(row)

print()
print('x=775 这一列，y 1310..1525:')
col = ''
for y in range(1310, 1525):
    col += 'W' if white[y, 775] else ('R' if red[y, 775] else '.')
print(col)
