# Epiq-Ladebild (Bilder/Epiq/Epiq_live-original.jpg → Epiq_live.webp): Auto + Kabel freigestellt (rembg), weiße Wallbox auf weißer Wand per Helligkeit + abgerundetem Rechteck, Bodenschatten nur unter dem Auto.
# Aufruf im Projektordner: python3 tools/epiq_live.py
import sys, numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd
sys.argv = ['x']; exec(open('tools/epiq_bilder.py').read().split('for n in [int(x)')[0])
im = Image.open('Bilder/Epiq/Epiq_live-original.jpg').convert('RGBA'); o = np.array(im).astype(float); H, W = o.shape[:2]
a = rembg_alpha(im)
# Wallbox: helles Gehäuse auf heller Wand → im Ausschnitt alles dunkler als die Wand, größte Fläche, Löcher füllen, als abgerundetes Rechteck übernehmen
x0, y0, x1, y1 = 1240, 205, 1330, 326
lum = o[y0:y1, x0:x1, :3].mean(axis=2); m = lum < 236
m = nd.binary_closing(m, np.ones((5, 5))); lab, n = nd.label(m); sz = nd.sum(m, lab, range(1, n + 1)); m = lab == (1 + np.argmax(sz)); m = nd.binary_fill_holes(m)
ys, xs = np.where(m); bx0, by0, bx1, by1 = x0 + xs.min(), y0 + ys.min(), x0 + xs.max(), y0 + ys.max(); bx0 += 6; by0 += 1; bx1 -= 1; print('wallbox', bx0, by0, bx1, by1)
wb = Image.new('L', (W, H), 0); ImageDraw.Draw(wb).rounded_rectangle((bx0, by0, bx1, by1), radius=int((bx1 - bx0) * 0.18), fill=255)
wb = np.array(wb).astype(float)
alpha = np.maximum(a, wb)
# Schatten nur aus dem Auto (Kabel/Wallbox fallen durch das Öffnen weg)
car = car_mask(a, 15).astype(float) * 255
oc = o.copy(); oc[:, :, 3] = car
sh, ground = add_shadow(oc)                                                # liefert Bild mit Rand (5 %/8 %) – Schattenanteil = Alpha minus Auto
py, px = int(H * 0.08), int(W * 0.05)
shadow = sh[:, :, 3] / 255; carA = np.zeros_like(shadow); carA[py:py + H, px:px + W] = car / 255; shadow = np.clip((shadow - carA) / np.maximum(1 - carA, 1e-6), 0, 1)
big = np.zeros((H + 2 * py, W + 2 * px, 4)); big[py:py + H, px:px + W, :3] = o[:, :, :3]; big[py:py + H, px:px + W, 3] = alpha
al = big[:, :, 3] / 255; out = np.zeros_like(big)
out[:, :, 3] = (al + shadow * (1 - al)) * 255
out[:, :, :3] = np.where(al[:, :, None] > 0, big[:, :, :3] * (al / np.maximum(out[:, :, 3] / 255, 1e-6))[:, :, None], 0)
img = Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA'); ys, xs = np.where(out[:, :, 3] > 12)
box = (max(0, xs.min() - 2), max(0, ys.min() - 2), xs.max() + 3, ys.max() + 3); img = img.crop(box)
img.save('Bilder/Epiq/Epiq_live.webp', 'WEBP', quality=88, method=6)
print(img.size, 'aspect', round(img.width / img.height, 4), 'extra', round((box[3] - 1 - ground) / img.height, 4))
bg = Image.new('RGBA', (img.width + 40, img.height + 40), (8, 26, 82, 255)); bg.alpha_composite(img, (20, 20)); bg.convert('RGB').save('/tmp/epiq_live_check.png')
