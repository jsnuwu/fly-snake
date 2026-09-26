# Fliegenhirn spielt Google Snake

Ein echter Ausschnitt des Fruchtfliegen-Gehirns (Janelia/Google MaleCNS-Connectome, 4.812 Neuronen, 266.216
Verbindungen) spielt das Snake aus der Google-Suche (`google.com/fbx?fbx=snake_arcade`) in einem Edge-Fenster –
und lernt dabei mit Dopamin dazu.

```
npm install
node play.ts              # spielen und weiterlernen (Gedächtnis: gedaechtnis.json)
node play.ts --schutz     # mit Reflex-Schutz (fährt nie direkt in eine Wand)
node play.ts --instinkt   # nur die angeborene Verdrahtung, ohne Lernen
node play.ts --games=10   # nach 10 Spielen aufhören

node train.ts 1000        # 1000 Spiele im schnellen Nachbau üben (~3 Spiele/s statt ~1/min)
node train.ts 300 --pruefen   # testen, was sie kann (ohne Lernen, nichts wird gespeichert)
node train.ts 300 --instinkt  # Vergleich: nur Instinkt
node train.ts 1000 --frisch   # Gedächtnis löschen und von vorne lernen
```
Beenden: Fenster schließen oder Strg+C. `play.ts` und `train.ts` können nicht gleichzeitig lernen
(sonst überschreiben sie sich gegenseitig das Gedächtnis) – das zweite Programm bricht dann mit einem Hinweis ab.

## Instinkt – die angeborene Verdrahtung

Alles aus Sicht des Schlangenkopfs, so wie die Fliege ihre Welt sieht:

- **Apfel links/rechts** reizt die LC10-Neuronen des linken/rechten Auges – die Bahn, mit der ein Fliegenmännchen ein
  Weibchen verfolgt. Jedes Augen-Neuron schaut auf seinen eigenen Fleck im Sehfeld.
- **Wand oder Körper nah** (links, schräg, vorne, rechts) reizt die LC4/LPLC2-Neuronen („etwas kommt auf mich zu“).
- **Lenk-Neuronen DNa01/DNa02** rechts minus links → rechts/links abbiegen.
- **Fluchtneuron DNp01 (Giant Fiber)** feuert → weg von der Gefahr abbiegen.

Die Verdrahtung ist die echte und ändert sich nie. Nur die Schwellen sind mit `probe.ts` eingestellt.

## Lernen – Dopamin wie im Pilzkörper

- **Gedächtnis-Code:** Von den 4.812 Neuronen nehmen jeweils nur die ~100 auffälligsten am Lernen teil
  (wie die Kenyon-Zellen im Pilzkörper). Jede Situation hat ihr eigenes kleines Muster, so überschreibt Neues nicht Altes.
- **Körpersinn:** Die Fliege spürt ihre Länge, wo ihr Schwanz liegt und ob links/geradeaus/rechts ein Raum kommt, der
  zu klein für ihren Körper ist (Falle), knapp (eng) oder von dem aus sie ihren Schwanz erreicht. Was das bedeutet,
  wird ihr nicht gesagt – das lernt sie.
- **Handlungs-Neuronen** für links/geradeaus/rechts schätzen, wie gut jede Richtung ist. Der Instinkt bekommt einen
  kleinen Vorsprung, darum spielt eine frische Fliege wie die reine Verdrahtung.
- **Dopamin = Überraschung:** Apfel → besser als erwartet → die aktiven Synapsen werden stärker. Crash → schlechter als
  erwartet → schwächer. Eine abklingende Spur sorgt dafür, dass auch die Züge davor (in die Falle hinein) lernen.

## Ergebnisse (lokaler Nachbau, 17×15 wie Google Snake)

| | Äpfel Ø |
|---|---|
| Nur Instinkt | ~8 |
| Lernen, ohne Körpersinn (nach 700 Spielen) | ~21 |
| Lernen mit Körpersinn (nach 400 Spielen) | ~31 |

Im echten Google Snake etwas weniger, weil das Spiel in Echtzeit läuft.

## Das Panel

Rechts neben dem Spiel: Statistik und Erfahrung, die Gehirnaktivität in Frontalansicht (jedes Neuron an der echten
Position seines Zellkörpers, violette Ringe = aktueller Gedächtnis-Code), die Sinne und der Körpersinn, der Instinkt
(Lenk-Zeiger, Fluchtneuron), die Entscheidung mit Dopamin-Signal, die gelernten Werte pro Richtung und die Lernkurve
über das ganze Leben der Fliege.

## Dateien

| Datei | Was |
|---|---|
| `play.ts` | spielt Google Snake im Browser, lernt live, speichert nach jedem Spiel |
| `train.ts` | Üben und Prüfen im schnellen Snake-Nachbau |
| `brain.ts` | Simulation des Connectome-Ausschnitts |
| `fly.ts` | Sinne (Augen, Körpersinn), Instinkt und Entscheidung |
| `learn.ts` | Dopamin-Lernen und Gedächtnis |
| `game.ts` | der Snake-Nachbau (17×15 wie Google) |
| `panel.ts` | das Panel neben dem Spiel |
| `files.ts` | Gehirn und Gedächtnis von der Festplatte laden/speichern |

`brain.ts`, `fly.ts`, `learn.ts`, `game.ts` und `panel.ts` laufen auch im Browser: `node ../web/build.ts` übernimmt sie
in die Browser-Version (`web/`).
| `probe.ts` | wie reagieren Lenk- und Fluchtneuronen auf typische Situationen? |
| `network.json` | der Connectome-Ausschnitt (gebaut mit `build_network.py` im Hauptordner) |
| `gedaechtnis.json` | was die Fliege gelernt hat |
