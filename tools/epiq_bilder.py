"""Epiq-Bilder aufbereiten (Originale haben schon Transparenz): zuschneiden, beim Maßbild die dunkle Bemaßung außerhalb des Autos hell umfärben.
Ergebnis: Bilder/Epiq/EpiqN.webp (volle Auflösung) + Bilder/Epiq/hero/N.webp (1100 px breit, fürs Karussell).
Aufruf: python3 tools/epiq_bilder.py"""
import numpy as np, os
from PIL import Image
from scipy import ndimage as nd
LIGHT = np.array([226, 232, 240.])                                   # #e2e8f0 wie bei Enyaq7–9
def process(src, n, masse=False):
    im = Image.open(src).convert('RGBA'); o = np.array(im).astype(float); A = o[:, :, 3]
    if masse:
        car = nd.binary_opening(A > 200, structure=np.ones((9, 9)))
        lab, k = nd.label(car); sz = nd.sum(car, lab, range(1, k + 1)); car = np.isin(lab, 1 + np.where(sz > 5000)[0])
        car = nd.binary_dilation(nd.binary_fill_holes(nd.binary_closing(car, structure=np.ones((7, 7)))), iterations=2)
        o[~car, :3] = LIGHT                                            # Linien, Pfeile, Zahlen außerhalb des Autos → hell
    out = Image.fromarray(o.clip(0, 255).astype(np.uint8), 'RGBA'); ys, xs = np.where(o[:, :, 3] > 12)
    out = out.crop((max(0, xs.min() - 2), max(0, ys.min() - 2), xs.max() + 3, ys.max() + 3))
    out.save(f'Bilder/Epiq/Epiq{n}.webp', 'WEBP', quality=92, method=6)
    os.makedirs('Bilder/Epiq/hero', exist_ok=True); w = min(1100, out.width)
    out.resize((w, round(out.height * w / out.width)), Image.LANCZOS).save(f'Bilder/Epiq/hero/{n}.webp', 'WEBP', quality=88, method=6)
    print(n, out.size, 'aspect', round(out.width / out.height, 4))
process('Bilder/Epiq/Epiq1-original.webp', 1, masse=True)            # Seitenansicht mit Bemaßung
process('Bilder/Epiq/Epiq2-original.png', 2)                          # Schrägansicht vorne
