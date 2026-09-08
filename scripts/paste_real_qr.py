"""把抖音卡片里的真实二维码像素贴进已生成的海报，替换模型重绘的假码。"""
from PIL import Image
import numpy as np

POSTER = 'output/images/edit-2026-08-28T07-59-26-670Z-1.png'
QR_SRC = '/Users/fangjinbao/.claude/image-cache/cbccdbb1-b42b-4176-ac2a-ea57e881b1ae/6.png'
OUT = 'output/images/poster-real-qr.png'

QR_CROP = (645, 1029, 795, 1179)   # 原卡片中二维码（含抖音角标）所在方形
FAKE = (655, 1332, 824, 1500)      # 海报里模型画的假码 bbox
CARD = (101, 1324, 922, 1521)      # 底部白卡片
QR_OUT = 176                       # 贴进去的边长，比假码略大，利于扫码


def card_bg(arr):
    """取卡片内文字与二维码之间的空白作为卡片底色。"""
    patch = arr[1340:1380, 570:640].reshape(-1, 3)
    return patch.mean(axis=0).round().astype(int)


def load_real_qr(size, bg):
    """抠出真实二维码：压白底 -> 把白底换成卡片底色 -> 缩放。"""
    qr = Image.open(QR_SRC).convert('RGBA').crop(QR_CROP)
    qr = Image.alpha_composite(
        Image.new('RGBA', qr.size, (255, 255, 255, 255)), qr).convert('RGB')
    a = np.asarray(qr).astype(int)

    # 原图底色近白但带一点粉，统一替换为卡片底色，避免贴上去出现色块边框
    lum = a.mean(axis=2)
    isbg = lum > 232
    a[isbg] = bg

    qr = Image.fromarray(a.astype('uint8'))
    return qr.resize((size, size), Image.LANCZOS)


def main():
    im = Image.open(POSTER).convert('RGB')
    arr = np.asarray(im).astype(int)
    bg = card_bg(arr)
    print('卡片底色:', tuple(bg))

    # 1) 用卡片底色抹掉模型画的假码（范围略放大，清掉抗锯齿残留）
    pad = 6
    ex = (FAKE[0] - pad, FAKE[1] - pad, FAKE[2] + pad + 1, FAKE[3] + pad + 1)
    im.paste(Image.new('RGB', (ex[2] - ex[0], ex[3] - ex[1]), tuple(bg)), ex[:2])

    # 2) 贴真实二维码，中心对齐原假码中心
    qr = load_real_qr(QR_OUT, bg)
    ccx = (FAKE[0] + FAKE[2]) // 2
    ccy = (CARD[1] + CARD[3]) // 2
    px, py = ccx - QR_OUT // 2, ccy - QR_OUT // 2
    im.paste(qr, (px, py))
    print(f'二维码贴入 ({px},{py}) 尺寸 {QR_OUT}x{QR_OUT}')

    im.save(OUT)
    print('saved', OUT, im.size)

    # 3) 校验：贴入区域与原图缩放结果逐像素一致
    check = np.asarray(Image.open(OUT).convert('RGB')).astype(int)
    got = check[py:py + QR_OUT, px:px + QR_OUT]
    want = np.asarray(qr).astype(int)
    diff = np.abs(got - want).max()
    print('像素最大偏差:', diff, '(0 = 原样贴入，未被重绘)')


if __name__ == '__main__':
    main()
