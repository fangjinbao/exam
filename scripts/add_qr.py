"""把抖音二维码以像素级原图合成到海报底部，保证可扫。"""
from PIL import Image, ImageDraw, ImageFont
import numpy as np

POSTER = 'output/images/edit-2026-08-28T07-37-14-934Z-1.png'
QR_SRC = '/Users/fangjinbao/.claude/image-cache/cbccdbb1-b42b-4176-ac2a-ea57e881b1ae/6.png'
QR_BOX = (640, 1024, 800, 1184)   # 原卡片中二维码所在区域
OUT = 'output/images/poster-with-qr.png'

FONT = '/System/Library/Fonts/Hiragino Sans GB.ttc'
F_BOLD, F_REG = 2, 0              # W6 / W3

BAND = 256                        # 底部新增条带高度
QR_SIZE = 168                     # 二维码最终边长

ROSE = (232, 30, 99)
DARK = (60, 20, 40)


def font(size, bold=True):
    return ImageFont.truetype(FONT, size, index=F_BOLD if bold else F_REG)


def extend_canvas(im, band):
    """向下延伸画布：复制底部像素行并做轻微竖向渐变，接缝不可见。"""
    W, H = im.size
    out = Image.new('RGB', (W, H + band))
    out.paste(im, (0, 0))
    a = np.asarray(im).astype(float)
    # 取底部 24 行的均值作为基色（底部本身是干净粉色区）
    base = a[H - 24:H].mean(axis=0)                    # (W,3)
    strip = np.repeat(base[None, :, :], band, axis=0)  # (band,W,3)
    # 越往下略微加深，避免大面积死平
    k = np.linspace(1.0, 0.955, band)[:, None, None]
    strip = np.clip(strip * k, 0, 255).astype(np.uint8)
    out.paste(Image.fromarray(strip), (0, H))
    return out


def load_qr(size):
    """抠出二维码并按整数倍最近邻缩放，保持码点边缘锐利。"""
    qr = Image.open(QR_SRC).convert('RGBA').crop(QR_BOX)
    # 原图背景近白，压成纯白底，去掉半透明
    bg = Image.new('RGBA', qr.size, (255, 255, 255, 255))
    qr = Image.alpha_composite(bg, qr).convert('RGB')
    # 放大用 LANCZOS，缩小同样；size 与原始 160 接近，形变极小
    return qr.resize((size, size), Image.LANCZOS)


def rounded_card(size, radius, fill=(255, 255, 255)):
    card = Image.new('RGBA', size, (0, 0, 0, 0))
    ImageDraw.Draw(card).rounded_rectangle(
        [0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=fill + (255,))
    return card


def main():
    poster = Image.open(POSTER).convert('RGB')
    W, H0 = poster.size
    im = extend_canvas(poster, BAND)
    W, H = im.size

    # ---- 白色圆角卡片，横跨底部条带 ----
    pad = 40
    card_h = BAND - 2 * 24
    card_w = W - 2 * pad
    card = rounded_card((card_w, card_h), 28)
    cx, cy = pad, H0 + 20

    # 卡片投影
    shadow = Image.new('RGBA', (card_w, card_h), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [0, 0, card_w - 1, card_h - 1], radius=28, fill=(150, 20, 60, 90))
    im.paste(Image.alpha_composite(
        Image.new('RGBA', (card_w, card_h), (0, 0, 0, 0)), shadow),
        (cx + 6, cy + 8), shadow)
    im.paste(card, (cx, cy), card)

    d = ImageDraw.Draw(im)

    # ---- 右侧二维码 ----
    qr = load_qr(QR_SIZE)
    qx = cx + card_w - QR_SIZE - 22
    qy = cy + (card_h - QR_SIZE) // 2
    im.paste(qr, (qx, qy))

    # ---- 左侧文案 ----
    tx = cx + 36
    d.text((tx, cy + 34), '抖音扫码看我直播', font=font(44), fill=ROSE)
    d.text((tx, cy + 96), '@B端Ai产品经理-老方', font=font(30), fill=DARK)
    d.text((tx, cy + 140), '2026.08.29  20:00 开播',
           font=font(26, bold=False), fill=(120, 90, 105))

    im.save(OUT)
    print(f'saved {OUT} {im.size}')


if __name__ == '__main__':
    main()
