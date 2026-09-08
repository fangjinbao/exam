from PIL import Image

SRC = '/Users/fangjinbao/.claude/image-cache/cbccdbb1-b42b-4176-ac2a-ea57e881b1ae/6.png'
im = Image.open(SRC).convert('RGBA')

# 密集暗像素范围 649,1033 - 790,1174（含抖音小图标），留少量余量
box = (640, 1024, 800, 1184)
qr = im.crop(box)
qr.save('output/qr-raw.png')
print('cropped', qr.size, '-> output/qr-raw.png')

# 放大 4 倍便于目视检查
qr.resize((qr.width * 4, qr.height * 4), Image.NEAREST).save('output/qr-raw-4x.png')
print('preview -> output/qr-raw-4x.png')
