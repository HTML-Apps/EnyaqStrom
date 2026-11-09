# Enyaq-Ladebild komplett (Bilder/Enyaq/Enyaq_live-voll-original.png → Enyaq_live-voll.webp): Auto + Kabel freigestellt (rembg),
# der vorhandene Schatten unter dem Auto bleibt erhalten (aus der Helligkeit gegenüber dem weißen Grund, als schwarze Transparenz), kein zusätzlicher.
# Linker Bildrand = Kabelende (in der App links bündig, damit das Kabel am Rand der Ansicht endet). Aufruf im Projektordner: python3 tools/enyaq_live.py
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
sys.argv = ['x']; exec(open('tools/epiq_bilder.py').read().split('for n in [int(x)')[0])
im = Image.open('Bilder/Enyaq/Enyaq_live-voll-original.png').convert('RGBA'); o = np.array(im).astype(float); H, W = o.shape[:2]
ar = rembg_alpha(im) / 255
# Kabel: grüne Pixel sicher übernehmen (rembg verliert das dünne Kabel am Boden), Kanten weich
r, g, b = o[:, :, 0], o[:, :, 1], o[:, :, 2]; gr = np.clip(((g - np.maximum(r, b)) - 12) / 30, 0, 1)
gr = nd.binary_dilation(gr > 0.5, iterations=1) * np.maximum(gr, 0.6); ar = np.maximum(ar, nd.gaussian_filter(gr.astype(float), 0.5).clip(0, 1))
# Felgen: Lücken zwischen den Speichen (weißer Grund) im unteren Teil des Autos dunkel auffüllen
inside = nd.binary_fill_holes(ar > 0.5); ys = np.where(inside.any(axis=1))[0]; inside[:int(ys.min() + (ys.max() - ys.min()) * 0.55)] = False
dark = np.array([28, 30, 34], float); o[:, :, :3] = np.where(inside[:, :, None], o[:, :, :3] * ar[:, :, None] + dark * (1 - ar[:, :, None]), o[:, :, :3]); ar = np.where(inside, 1.0, ar)
# Schatten: Abdunklung gegenüber Weiß, nur unterhalb der Wagenmitte
lum = o[:, :, :3].mean(axis=2); ash = np.clip(1 - lum / 250, 0, 1); ash[ash < 0.025] = 0; ash[:int(H * 0.55)] = 0
ash = nd.gaussian_filter(ash, 0.6)
A = ar + ash * (1 - ar); out = np.zeros((H, W, 4))
out[:, :, :3] = o[:, :, :3] * (ar / np.maximum(A, 1e-6))[:, :, None]; out[:, :, 3] = A * 255
img = Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA'); ys, xs = np.where(out[:, :, 3] > 10)
box = (0, max(0, ys.min() - 2), min(W, xs.max() + 3), min(H, ys.max() + 3)); img = img.crop(box)   # links nicht beschneiden: Kabel endet am Bildrand
img.save('Bilder/Enyaq/Enyaq_live-voll.webp', 'WEBP', quality=88, method=6)
print(img.size, 'aspect', round(img.width / img.height, 4))
bg = Image.new('RGBA', (img.width + 40, img.height + 40), (8, 26, 82, 255)); bg.alpha_composite(img, (20, 20)); bg.convert('RGB').save('/tmp/enyaq_live_check.png')
