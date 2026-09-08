from PIL import Image, ImageFilter
import numpy as np

POSTER = 'output/images/edit-2026-08-28T07-37-14-934Z-1.png'
im = Image.open(POSTER).convert('RGB')
W, H = im.size
edge = np.asarray(im.convert('L').filter(ImageFilter.FIND_EDGES)).astype(float)

# 按 64px 网格给出边缘密度，越小越空
gs = 64
print('grid busyness (0-100), 每行 = y 起点')
for y in range(0, H, gs):
    row = []
    for x in range(0, W, gs):
        blk = edge[y:y + gs, x:x + gs]
        row.append(int(min(100, blk.mean())))
    print(f'{y:5d} ' + ' '.join(f'{v:3d}' for v in row))
