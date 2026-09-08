"""独立校验成品海报里的二维码。

与 repaint_qr_plate.py 解耦：只读磁盘上的成品图和源图，自己重新推导期望值，
不复用 repaint 过程里的任何中间对象（避免"自己和自己比"的同义反复校验）。

三项检查：
  A 定位：在成品图里搜索二维码实际落点，与期望坐标比对
  B 保真：独立重算期望位图，与成品图对应区域逐像素比对
  C 可扫性：量模块边长 + 对比度，给出扫码可靠性判断
"""
import sys

import numpy as np
from PIL import Image

POSTER = 'output/images/poster-final.png'
QR_SRC = 'output/qr-raw.png'
PLATE = (676, 1331, 874, 1504)


def net_qr():
    """独立重算：压白底 + 裁墨迹边界，得到源码净位图。"""
    qr = Image.open(QR_SRC).convert('RGBA')
    qr = Image.alpha_composite(
        Image.new('RGBA', qr.size, (255, 255, 255, 255)), qr).convert('RGB')
    a = np.asarray(qr).astype(int)
    a[a.mean(axis=2) > 235] = 255
    dark = a.mean(axis=2) < 200
    ys, xs = np.where(dark)
    return Image.fromarray(a.astype('uint8')).crop(
        (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def module_px(img):
    """用左上定位符外框（7 模块宽）估模块边长。"""
    d = np.asarray(img.convert('L')).astype(int) < 128
    n = d.shape[0]
    best = 0
    for y in range(n // 3):
        c = longest = 0
        for v in d[y][:n // 3]:
            if v:
                c += 1
                longest = max(longest, c)
            else:
                c = 0
        best = max(best, longest)
    return best / 7


def main():
    poster = Image.open(POSTER).convert('RGB')
    pa = np.asarray(poster).astype(int)
    net = net_qr()
    print(f'源码净尺寸 {net.size[0]}x{net.size[1]}，模块边长 {module_px(net):.2f}px')

    # A 定位：在托板范围内滑动找与期望位图最匹配的落点
    x0, y0, x1, y1 = PLATE
    best = None
    for size in range(120, 145):
        want = np.asarray(net.resize((size, size), Image.LANCZOS)
                          if size != net.size[0] else net).astype(int)
        for py in range(y0, y1 - size):
            for px in range(x0, x1 - size):
                if abs(int(pa[py, px].mean()) - int(want[0, 0].mean())) > 20:
                    continue
                d = np.abs(pa[py:py + size, px:px + size] - want).mean()
                if best is None or d < best[0]:
                    best = (d, size, px, py)
    d, size, px, py = best
    print(f'A 定位: 最佳匹配 {size}x{size} @({px},{py})  平均绝对误差 {d:.2f}')

    # B 保真：独立重算的期望位图 vs 成品图
    want = np.asarray(net.resize((size, size), Image.LANCZOS)
                      if size != net.size[0] else net).astype(int)
    got = pa[py:py + size, px:px + size]
    diff = np.abs(got - want)
    print(f'B 保真: 最大偏差 {diff.max()}  平均 {diff.mean():.3f}  '
          f'({"逐像素一致" if diff.max() == 0 else "存在差异"})')

    # C 可扫性
    g = np.asarray(Image.fromarray(got.astype("uint8")).convert('L')).astype(int)
    mod = 2.0 * size / net.size[0]
    blur = ((g > 90) & (g < 190)).mean() * 100
    print(f'C 可扫性: 模块边长约 {mod:.2f}px  灰糊占比 {blur:.1f}%  '
          f'暗 {(g < 90).mean() * 100:.1f}% / 亮 {(g > 190).mean() * 100:.1f}%')
    print('  判定:', '偏小，依赖扫码端超分，建议实机测试'
          if mod < 2.5 else '模块尺寸充足')

    if diff.max() == 0:
        print('\nPASS: 成品图中的码与独立重算结果逐像素一致，未被二次重绘')
    else:
        print(f'\nFAIL: 存在 {(diff.max(axis=2) > 0).sum()} 个像素被改动')
        sys.exit(1)


if __name__ == '__main__':
    main()
