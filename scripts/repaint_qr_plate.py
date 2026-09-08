"""重画底部托板内区：纯白底 + 真实二维码 + 红色虚线描边 + 「长按识别」。

模型画的假码不做局部修补，整块内区重绘，保证留白（安静区）与码本体清晰度可控。
"""
import os

from PIL import Image, ImageDraw, ImageFont
import numpy as np

POSTER = 'output/images/edit-2026-08-28T08-23-52-838Z-1.png'
QR_SRC = 'output/qr-raw.png'
OUT = 'output/images/poster-final.png'

# 托板白底实测 bbox：沿 x=680/684/870 三列与 y=1420 扫连续近白像素得到
# （白底 199x174；此前用的 1327 上沿偏高 4px，会切到上方粉色卡片）
PLATE = (676, 1331, 874, 1504)
INSET = 0          # PLATE 已是白底内沿，无需再内缩
DASH_INSET = 3     # 红虚线相对白底的内缩
RED = (226, 42, 62)
GREY = (110, 110, 118)
FONT = '/System/Library/Fonts/Hiragino Sans GB.ttc'


def dashed_rect(dr, box, color, width=2, dash=7, gap=5, radius=10):
    """沿圆角矩形边框画虚线（圆角处用实线短弧近似，视觉足够）。"""
    x0, y0, x1, y1 = box
    dr.rounded_rectangle(box, radius=radius, outline=color, width=width)
    # 用白色打断成虚线（末段可能超出圆角起点，需裁掉后再画）
    for x in range(x0 + radius, x1 - radius, dash + gap):
        xa, xb = x + dash, min(x + dash + gap, x1 - radius)
        if xb <= xa:
            continue
        dr.rectangle([xa, y0 - 1, xb, y0 + width], fill='white')
        dr.rectangle([xa, y1 - width, xb, y1 + 1], fill='white')
    for y in range(y0 + radius, y1 - radius, dash + gap):
        ya, yb = y + dash, min(y + dash + gap, y1 - radius)
        if yb <= ya:
            continue
        dr.rectangle([x0 - 1, ya, x0 + width, yb], fill='white')
        dr.rectangle([x1 - width, ya, x1 + 1, yb], fill='white')


def load_qr(size):
    """真码压白底后缩放，不做二值化，保留 LANCZOS 灰阶以免破坏码点边缘。

    源图 160x160 自带约 8px 白边，托板本身已提供安静区，这里裁掉源白边得到
    144x144 净码区（实测左上定位符外框 14px / 7 模块 = 模块边长 2px）。

    注意：源码模块只有 2px，是屏幕扫码的下限。缩到 size 后模块边长为
    2*size/144 px，size 越接近 144 越好；实测 132~144 区间灰阶分布几乎不变
    （灰糊占比 21.8% vs 22.2%），对比度未被破坏。
    """
    if not os.path.exists(QR_SRC):
        raise SystemExit(f'二维码源图不存在: {QR_SRC}')
    qr = Image.open(QR_SRC).convert('RGBA')
    qr = Image.alpha_composite(Image.new('RGBA', qr.size, (255, 255, 255, 255)), qr).convert('RGB')
    a = np.asarray(qr).astype(int)
    a[a.mean(axis=2) > 235] = 255          # 原图近白底带粉，压成纯白

    # 按实际墨迹收紧边界
    dark = a.mean(axis=2) < 200
    ys, xs = np.where(dark)
    net = Image.fromarray(a.astype('uint8')).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    if size == net.size[0]:
        return net                          # 尺寸相同则不重采样
    return net.resize((size, size), Image.LANCZOS)


def main():
    if not os.path.exists(POSTER):
        raise SystemExit(f'海报底图不存在: {POSTER}')
    im = Image.open(POSTER).convert('RGB')
    if PLATE[2] > im.size[0] or PLATE[3] > im.size[1]:
        raise SystemExit(f'托板坐标 {PLATE} 超出海报尺寸 {im.size}')
    dr = ImageDraw.Draw(im)

    x0, y0, x1, y1 = PLATE
    inner = (x0 + INSET, y0 + INSET, x1 - INSET, y1 - INSET)

    # 1) 内区全部刷白，抹掉假码与旧虚线
    dr.rounded_rectangle(inner, radius=12, fill='white')

    # 2) 红色虚线描边
    dash_box = (inner[0] + DASH_INSET, inner[1] + DASH_INSET,
                inner[2] - DASH_INSET, inner[3] - DASH_INSET)
    dashed_rect(dr, dash_box, RED, width=2, radius=10)

    # 3) 二维码尽量取大：先按可用空间反推，再给文字留位
    cx = (inner[0] + inner[2]) / 2
    QR_PAD = 4        # 码与虚线框的额外留白（虚线外还有白底安静区）
    TEXT_H = 17       # 「长按识别」占高
    GAP = 3           # 码与文字间隙
    avail_h = (dash_box[3] - dash_box[1]) - QR_PAD * 2 - TEXT_H - GAP
    avail_w = (dash_box[2] - dash_box[0]) - QR_PAD * 2
    size = min(avail_h, avail_w, 144)     # 144 = 源码净尺寸，不放大

    # 4) 真码居中贴入
    qr = load_qr(size)
    px = int(cx - size / 2)
    py = dash_box[1] + QR_PAD + (avail_h - size) // 2
    im.paste(qr, (px, py))

    # 5) 「长按识别」放在码下方
    font = ImageFont.truetype(FONT, 15, index=1)
    text = '长按识别'
    tw = dr.textlength(text, font=font)
    dr.text((cx - tw / 2, py + size + GAP), text, font=font, fill=GREY)

    im.save(OUT)
    print(f'二维码 {size}x{size} 贴入 ({px},{py})  源净尺寸 144 -> 缩放比 {size / 144:.3f}')
    print('saved', OUT, im.size)
    return px, py, size


if __name__ == '__main__':
    main()
    print('保真度校验请单独运行: python3 scripts/verify_qr.py')
