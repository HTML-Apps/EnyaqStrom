# Enyaq-Ladebild komplett (Bilder/Enyaq/Enyaq_live-voll-original.jpg → Enyaq_live-voll.webp): Auto + Kabel freigestellt (rembg), Bodenschatten nur unter dem Auto.
# Aufruf im Projektordner: python3 tools/enyaq_live.py
import sys, numpy as np
from PIL import Image
sys.argv = ['x']; exec(open('tools/epiq_bilder.py').read().split('for n in [int(x)')[0])
im = Image.open('Bilder/Enyaq/Enyaq_live-voll-original.jpg').convert('RGBA'); o = np.array(im).astype(float); H, W = o.shape[:2]
alpha = rembg_alpha(im)
# Felgen: rembg macht die Lücken zwischen den Speichen durchsichtig (dahinter weißer Hintergrund) → im unteren Teil des Autos dunkel auffüllen
from scipy import ndimage as nd
inside = nd.binary_fill_holes(alpha > 128); ys = np.where(inside.any(axis=1))[0]; inside[:int(ys.min() + (ys.max() - ys.min()) * 0.55)] = False
a1 = (alpha / 255)[:, :, None]; dark = np.array([28, 30, 34], float)
o[:, :, :3] = np.where(inside[:, :, None], o[:, :, :3] * a1 + dark * (1 - a1), o[:, :, :3]); alpha = np.where(inside, 255, alpha)
car = car_mask(alpha, 15).astype(float) * 255                               # ohne dünnes Kabel – nur daraus der Schatten
oc = o.copy(); oc[:, :, 3] = car
sh, ground = add_shadow(oc)
py, px = int(H * 0.08), int(W * 0.05)
shadow = sh[:, :, 3] / 255; carA = np.zeros_like(shadow); carA[py:py + H, px:px + W] = car / 255; shadow = np.clip((shadow - carA) / np.maximum(1 - carA, 1e-6), 0, 1)
big = np.zeros((H + 2 * py, W + 2 * px, 4)); big[py:py + H, px:px + W, :3] = o[:, :, :3]; big[py:py + H, px:px + W, 3] = alpha
al = big[:, :, 3] / 255; out = np.zeros_like(big)
out[:, :, 3] = (al + shadow * (1 - al)) * 255
out[:, :, :3] = np.where(al[:, :, None] > 0, big[:, :, :3] * (al / np.maximum(out[:, :, 3] / 255, 1e-6))[:, :, None], 0)
img = Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA'); ys, xs = np.where(out[:, :, 3] > 12)
box = (max(0, xs.min() - 2), max(0, ys.min() - 2), xs.max() + 3, ys.max() + 3); img = img.crop(box)
img.save('Bilder/Enyaq/Enyaq_live-voll.webp', 'WEBP', quality=88, method=6)
print(img.size, 'aspect', round(img.width / img.height, 4))
bg = Image.new('RGBA', (img.width + 40, img.height + 40), (8, 26, 82, 255)); bg.alpha_composite(img, (20, 20)); bg.convert('RGB').save(sys.argv[-1] if len(sys.argv) > 1 and sys.argv[-1].endswith('.png') else '/tmp/enyaq_live_check.png')
