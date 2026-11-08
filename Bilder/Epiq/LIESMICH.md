# Bilder Škoda Epiq

Fahrzeugprofil „epiq55“. Je Bild: `EpiqN-original.*` (wie geliefert), `EpiqN.webp` (freigestellt, zugeschnitten) und `hero/N.webp` (max. 1100 px, Karussell).
Aufbereiten: `python3 tools/epiq_bilder.py` (alle) oder mit Nummern; Art je Bild steht in `JOBS` im Skript.

| Nr. | Motiv | Art |
|---|---|---|
| 1 | Seitenansicht mit Bemaßung | Bemaßung hell |
| 2 | Schräg vorne (Studio) | schon freigestellt |
| 3 | Kofferraum offen | freigestellt (rembg) |
| 4 | Antrieb/Motor | schon freigestellt |
| 5 | Front + Heck mit Bemaßung | Bemaßung hell, Weiß durchsichtig |
| 6 | Draufsicht mit Innenmaßen | wie 5 |
| 7 | Wärmepumpe/Technik (Röntgen) | freigestellt |
| 8 | Airbags | freigestellt |
| 9 | Schräg vorne (Straße) | freigestellt |
| 10 | Seite (Straße) | freigestellt |
| 11 | Schräg hinten (Straße) | freigestellt |
| 12 | Akku/Plattform (Röntgen) | freigestellt |

Bodenschatten (künstlich, wie bei Bild 2): 7–12. Nicht bei Maßbildern, Motor und Kofferraum (unten abgeschnitten).

Reihenfolge und Darstellung im Karussell: `CAR_HERO` in `src/05-startseite-banner.js`.
Gemeinsame Bilder (Icons, Wetter, Statistik, Fahrzeugakte) bleiben direkt in `Bilder/`.
