"""Epiq-Bilder aufbereiten → Bilder/Epiq/EpiqN.webp (volle Auflösung, freigestellt) + Bilder/Epiq/hero/N.webp (max. 1100 px, Karussell).
Originale liegen als Bilder/Epiq/EpiqN-original.* daneben. Arten:
  alpha  – Original hat schon Transparenz: nur zuschneiden
  rembg  – Foto mit Hintergrund: Auto per KI freistellen (rembg, Modell isnet-general-use), Schatten/Umgebung fallen weg
  masse  – Maßzeichnung: Auto bleibt, Bemaßung (Linien, Pfeile, Zahlen) außerhalb des Autos wird hell (#e2e8f0), Weiß wird durchsichtig
Aufruf: python3 tools/epiq_bilder.py            (alle)   |   python3 tools/epiq_bilder.py 5 6   (nur diese Nummern)
Benötigt: pip install rembg onnxruntime scipy pillow numpy   (Modell wird beim ersten Lauf geladen)
Danach Seitenverhältnisse in CAR_HERO (src/05-startseite-banner.js) übernehmen – das Skript gibt sie aus."""
import glob, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as nd

D = 'Bilder/Epiq/'
LIGHT = np.array([226, 232, 240.])
JOBS = {1: 'masse_alpha', 2: 'alpha', 3: 'rembg', 4: 'alpha', 5: 'masse', 6: 'masse', 7: 'rembg', 8: 'rembg', 9: 'rembg', 10: 'rembg', 11: 'rembg'}
_sess = None
def rembg_alpha(im):
    global _sess
    from rembg import new_session, remove
    if _sess is None: _sess = new_session('isnet-general-use')
    return np.array(remove(im.convert('RGB'), session=_sess))[:, :, 3].astype(float)
def car_mask(a, k=9):
    """größte zusammenhängende Flächen = Auto (dünne Linien fallen durch das Öffnen weg), Löcher gefüllt"""
    m = nd.binary_opening(a > 128, structure=np.ones((k, k)))
    lab, n = nd.label(m); sz = nd.sum(m, lab, range(1, n + 1)); m = np.isin(lab, 1 + np.where(sz > 0.02 * m.size)[0])
    return nd.binary_dilation(nd.binary_fill_holes(nd.binary_closing(m, structure=np.ones((9, 9)))), iterations=2)
def process(n, kind):
    src = glob.glob(f'{D}Epiq{n}-original.*')[0]; im = Image.open(src).convert('RGBA'); o = np.array(im).astype(float)
    if kind == 'masse_alpha':                                            # Epiq1: Original schon transparent, Bemaßung dunkel
        car = car_mask(o[:, :, 3], 9); o[~car, :3] = LIGHT
    elif kind == 'masse':                                                # weißer Hintergrund mit Bemaßung
        car = car_mask(rembg_alpha(im), 11)
        dark = 1 - o[:, :, :3].mean(axis=2) / 255                        # wie dunkel ein Pixel ist = wie sichtbar die Linie
        o[:, :, 3] = np.where(car, 255, np.clip((dark - 0.08) / 0.5, 0, 1) * 255)
        o[~car, :3] = LIGHT
    elif kind == 'rembg':
        o[:, :, 3] = rembg_alpha(im)
    out = Image.fromarray(o.clip(0, 255).astype(np.uint8), 'RGBA'); ys, xs = np.where(o[:, :, 3] > 12)
    out = out.crop((max(0, xs.min() - 2), max(0, ys.min() - 2), xs.max() + 3, ys.max() + 3))
    out.save(f'{D}Epiq{n}.webp', 'WEBP', quality=92, method=6)
    os.makedirs(D + 'hero', exist_ok=True); w = min(1100, out.width)
    out.resize((w, round(out.height * w / out.width)), Image.LANCZOS).save(f'{D}hero/{n}.webp', 'WEBP', quality=88, method=6)
    print(n, kind, out.size, 'aspect', round(out.width / out.height, 4))

for n in [int(x) for x in sys.argv[1:]] or sorted(JOBS):
    process(n, JOBS[n])
