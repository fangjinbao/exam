"""把真二维码贴入新海报（1152x2048 版）托板白色内区。

托板内区已由模型画成纯白 + 红虚线描边，「长按识别」也已渲染，
因此这里只做一件事：把真码居中贴进白区，不重绘边框与文字。
"""
import os

import numpy as np
from PIL import Image

POSTER = 'output/images/edit-2026-08-28T08-55-24-575Z-1.png'
QR_SRC = 'output/qr-raw.png'
OUT = 'output/images/poster-v2-final.png'

PLATE = (616, 1476, 839, 1621)   # locate_plate_v2.py 实测白色内区
PAD = 4                          # 码与虚线的额外留白


def load_qr(size):
    """压白底 + 按墨迹收紧边界 + LANCZOS 缩放，不做二值化。"""
    if not os.path.exists(QR_SRC):
        raise SystemExit(f'二维码源图不存在: {QR_SRC}')
    qr = Image.open(QR_SRC).convert('RGBA')
    qr = Image.alpha_composite(
        Image.new('RGBA', qr.size, (255, 255, 255, 255)), qr).convert('RGB')
    a = np.asarray(qr).astype(int)
    a[a.mean(axis=2) > 235] = 255

    dark = a.mean(axis=2) < 200
    ys, xs = np.where(dark)
    net = Image.fromarray(a.astype('uint8')).crop(
        (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    if size == net.size[0]:
        return net, net.size[0]
    return net.resize((size, size), Image.LANCZOS), net.size[0]


def main():
    if not os.path.exists(POSTER):
        raise SystemExit(f'海报底图不存在: {POSTER}')
    im = Image.open(POSTER).convert('RGB')
    x0, y0, x1, y1 = PLATE
    if x1 > im.size[0] or y1 > im.size[1]:
        raise SystemExit(f'托板坐标 {PLATE} 超出海报尺寸 {im.size}')

    avail_w = (x1 - x0 + 1) - PAD * 2
    avail_h = (y1 - y0 + 1) - PAD * 2
    size = min(avail_w, avail_h)

    qr, net = load_qr(size)
    px = x0 + PAD + (avail_w - size) // 2
    py = y0 + PAD + (avail_h - size) // 2
    im.paste(qr, (px, py))

    im.save(OUT)
    print(f'二维码 {size}x{size} 贴入 ({px},{py})  源净尺寸 {net} -> 缩放比 {size / net:.3f}')
    print('saved', OUT, im.size)


if __name__ == '__main__':
    main()
