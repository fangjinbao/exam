from PIL import Image
import numpy as np

NEW = 'output/images/edit-2026-08-28T07-59-26-670Z-1.png'
lum = np.asarray(Image.open(NEW).convert('L')).astype(int)

# 卡片 x 101-922 / y 1324-1521；文字占 x161-540，二维码占 x651-830
WIN = (645, 1324, 840, 1521)
x0, y0, x1, y1 = WIN
mask = lum[y0:y1, x0:x1] < 130
col = mask.sum(axis=0); row = mask.sum(axis=1)
cs = np.nonzero(col > 0)[0]; rs = np.nonzero(row > 0)[0]
QX0, QY0, QX1, QY1 = x0 + cs.min(), y0 + rs.min(), x0 + cs.max(), y0 + rs.max()
print('二维码 bbox:', (QX0, QY0, QX1, QY1))
print('尺寸:', QX1 - QX0 + 1, 'x', QY1 - QY0 + 1)
print('中心:', (QX0 + QX1) // 2, (QY0 + QY1) // 2)
print('卡片中心 y:', (1324 + 1521) // 2)
