from PIL import Image
import numpy as np

SRC = '/Users/fangjinbao/.claude/image-cache/cbccdbb1-b42b-4176-ac2a-ea57e881b1ae/6.png'
im = Image.open(SRC).convert('RGBA')
im = Image.alpha_composite(Image.new('RGBA', im.size, (255,) * 4), im).convert('RGB')
a = np.asarray(im).astype(int)
lum = a.mean(axis=2)

# 只看二维码所在区域，避开卡片其他元素
x0, y0, x1, y1 = 580, 960, 840, 1233
m = lum[y0:y1, x0:x1] < 200
col, row = m.sum(axis=0), m.sum(axis=1)
cs, rs = np.nonzero(col > 0)[0], np.nonzero(row > 0)[0]
print('区域内暗像素 bbox:', x0 + cs.min(), y0 + rs.min(), x0 + cs.max(), y0 + rs.max())

# 按列/行打印分布，找二维码与其他元素的分界
print('列分布:')
for i in range(0, col.size, 20):
    print(f'  x={x0+i:4d} {col[i:i+20].sum():5d}')
print('行分布:')
for i in range(0, row.size, 20):
    print(f'  y={y0+i:4d} {row[i:i+20].sum():5d}')
