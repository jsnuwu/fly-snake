# Fly – Fruchtfliegen-Connectome spielt Snake

Ein echter Ausschnitt des Nervensystems der männlichen Fruchtfliege (Janelia/Google **MaleCNS v1.0**) als simuliertes
Gehirn: 800 Seh-Neuronen, 4.000 Zwischenneuronen, 12 Descending-Neuronen, 266.216 Verbindungen. Es spielt Snake und
lernt dabei mit Dopamin dazu.

**Ausprobieren:** https://jsnuwu.github.io/fly-snake/

| Ordner | Was |
|---|---|
| `snake/` | Die Fliege spielt das **echte Google Snake** in einem Edge-Fenster und lernt live (`node play.ts`) – [snake/README.md](snake/README.md) |
| `web/` | **Browser-Version** zum Selbst-Starten: eigenes Snake, Start/Pause, Tempo bis Turbo, neue oder trainierte Fliege, Lernkurve – läuft komplett im Browser |

## Browser-Version

```
node web/build.ts     # Code aus snake/ für den Browser übernehmen (nach Änderungen an snake/*.ts)
node web/serve.ts     # dann http://localhost:8080 öffnen
```
Auf GitHub veröffentlicht sich `web/` automatisch als GitHub-Pages-Seite (`.github/workflows/pages.yml`), sobald auf
`main` gepusht wird. Einmalig nötig: im Repository unter Settings → Pages als Quelle „GitHub Actions“ wählen.

## Connectome neu bauen

```
uv run python build_network.py
```
Schreibt `snake/network.json`. Braucht die Dateien aus `data/` (öffentlich: https://male-cns.janelia.org/download/).
