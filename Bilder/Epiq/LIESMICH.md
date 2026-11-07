# Bilder Škoda Epiq

Epiq-Bilder (Papa-Modus / Fahrzeugprofil „epiq55“). Aufbau wie in `Bilder/Enyaq/`:

- `Epiq1…N.*` – Originale fürs Karussell, aufbereitet nach `hero/` (WebP 1100 px, Rand entfernt)
- `Epiq_live.webp` – Ladebild im Live-Modus
- `Epiq_4.webp` – Schnittbild Akku (Berichte → Akku)
- `epiq-top.webp` – Draufsicht (Reifen)

Vorhanden: `Epiq1` (Seitenansicht mit Bemaßung, Bemaßung hell), `Epiq2` (Schrägansicht vorne), je als `EpiqN.webp`
(freigestellt, zugeschnitten) und `hero/N.webp` (1100 px). Originale: `EpiqN-original.*`. Aufbereiten: `python3 tools/epiq_bilder.py`.

Gemeinsame Bilder (Icons, Wetter, Statistik, Fahrzeugakte) bleiben direkt in `Bilder/`.
