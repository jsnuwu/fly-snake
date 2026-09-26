// The side panel next to the game (injected into the Google Snake page by play.ts, used as-is by the web version):
// dark theme, the fly brain in frontal view with every neuron at its real soma position, senses, instinct,
// learning and the learning curve.
// installPanel() may run inside a foreign page (serialised by puppeteer), so it must be self-contained.
import type { Brain } from './brain.ts'

export interface PanelLayout {
  pos: number[]            // x0, y0, x1, y1 ... in 0..1 (front view, fly's left on the left)
  role: number[]           // 0 interneuron, 1 LC10 (apple), 2 LC4/LPLC2 (danger), 3 DNa steering, 4 DNp01 giant fiber, 5 other DN
  labels: { text: string; x: number; y: number }[]
  height: number           // y extent of the positions (x extent is 1)
  footer?: string          // hint at the bottom right
}

/** neuron positions and roles for the panel's brain view (fly's left drawn on the left) */
export function panelLayout(brain: Brain): PanelLayout {
  const n = brain.neurons
  const role = n.map(x => x.role === 'hidden' ? 0 : x.role === 'in:target' ? 1 : x.role === 'in:loom' ? 2
    : x.type.startsWith('DNa') ? 3 : x.type === 'DNp01' ? 4 : 5)
  const meanOf = (list: number[], k: 0 | 1) => list.reduce((s, i) => s + (n[i].pos?.[k] ?? 0.5), 0) / Math.max(1, list.length)
  const flip = meanOf(brain.groups.tL, 0) > meanOf(brain.groups.tR, 0)
  const pos = n.flatMap(x => { const [px, py] = x.pos ?? [0.5, 0.5]; return [flip ? 1 - px : px, py] })
  const height = Math.max(...n.map(x => x.pos?.[1] ?? 0))
  const at = (list: number[], text: string, dy = -0.07) => {
    const xs = list.map(i => pos[2 * i]), ys = list.map(i => pos[2 * i + 1])
    return { text, x: xs.reduce((a, b) => a + b, 0) / xs.length, y: Math.max(0.03, Math.min(...ys) + dy) }
  }
  const idx = (f: (i: number) => boolean) => n.map((_, i) => i).filter(f)
  return {
    pos, role, height,
    labels: [
      at([...brain.groups.tL, ...brain.groups.lL], 'Sehlappen L'),
      at([...brain.groups.tR, ...brain.groups.lR], 'Sehlappen R'),
      at(brain.groups.hidden, 'Zentralhirn', -0.02),
      at(idx(i => role[i] === 3 || role[i] === 4), 'DNa · DNp01', 0.12),
    ],
  }
}

/** rolling mean of apples per game over the fly's whole life (at most ~150 points), and where this session starts */
export function learningCurve(history: number[], sessionStart: number): { curve: number[]; curveToday: number } {
  const win = Math.max(5, Math.min(100, Math.round(history.length / 10)))
  const step = Math.max(1, Math.ceil(history.length / 150)), curve: number[] = []
  let curveToday = 0
  for (let k = win; k <= history.length; k += step) {
    let sum = 0
    for (let i = k - win; i < k; i++) sum += history[i]
    if (k <= sessionStart) curveToday = curve.length + 1
    curve.push(sum / win)
  }
  return { curve, curveToday }
}

export interface PanelState {
  apples: number; best: number; avg: number | null; playing: boolean; schutz: boolean
  sees: { appleL: number; appleR: number; loomL: number; loomR: number }
  steer: number; gfL: number; gfR: number; turn: number; reason: string
  learning: boolean        // dopamine learning on?
  experience: number       // games played in total (all sessions)
  q: number[] | null       // learned value of left / straight / right
  instinct: number         // what the descending neurons wanted
  dopamine: number         // last prediction error
  curve: number[]          // rolling mean of apples per game over the whole life of the fly
  curveToday: number       // index in curve where this session starts
  code: number[]           // neurons of the sparse memory code the fly learns with
  body: number[] | null    // body sense: per left/straight/right [blocked, trap, tight, tail reachable], ...
  length: number           // snake length in cells
}

export function installPanel(layout: PanelLayout) {
  const COLORS = ['#5b8fd6', '#e0679a', '#e3a13b', '#52c08a', '#e05a52', '#a88be0']
  const css = `
    html, body { background: #111214 !important; }
    body { padding-right: 640px !important; box-sizing: border-box; }
    .fly-game-frame { border-radius: 6px !important; overflow: hidden !important; box-shadow: 0 0 0 1px #2a2c31 !important; }
    #fly-panel { position: fixed; top: 16px; right: 16px; bottom: 16px; width: 608px; overflow-y: auto; z-index: 99999;
      color: #d8d8d8; font: 13px/1.45 system-ui, "Segoe UI", sans-serif; background: #17181b;
      border: 1px solid #2a2c31; border-radius: 6px; padding: 16px 18px 12px; }
    #fly-panel * { box-sizing: border-box; }
    #fly-panel .mono, #fly-panel .num, #fly-panel .stats b { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
    #fly-panel .hd { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
    #fly-panel .ttl { font: 700 17px ui-monospace, "Cascadia Mono", Consolas, monospace; color: #f0f0f0; }
    #fly-panel .sub { color: #8a8d93; font-size: 12px; }
    #fly-panel .live { margin-left: auto; font-size: 12px; color: #52c08a; }
    #fly-panel .live::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 6px; background: currentColor; vertical-align: 1px; }
    #fly-panel .live.off { color: #8a8d93; }
    #fly-panel .stats { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid #2a2c31; border-bottom: 1px solid #2a2c31; }
    #fly-panel .stats div { padding: 7px 10px; border-left: 1px solid #2a2c31; }
    #fly-panel .stats div:first-child { border-left: none; padding-left: 0; }
    #fly-panel .stats span { display: block; color: #8a8d93; font-size: 11px; }
    #fly-panel .stats b { font-size: 19px; font-weight: 600; color: #f0f0f0; }
    #fly-panel .sec { display: flex; align-items: center; gap: 10px; color: #b5b7bb; font-size: 12px; font-weight: 600; margin: 14px 0 7px; }
    #fly-panel .sec::after { content: ''; flex: 1; height: 1px; background: #2a2c31; order: 1; }
    #fly-panel .sec em { order: 2; font-style: normal; font-weight: 400; color: #6f7278; font-size: 11px; }
    #fly-panel canvas.brain { width: 100%; display: block; background: #0c0d0f; border: 1px solid #2a2c31; border-radius: 4px; }
    #fly-panel .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 7px; font-size: 11px; color: #a0a3a8; }
    #fly-panel .legend i { display: inline-block; width: 8px; height: 8px; margin-right: 5px; vertical-align: 0; }
    #fly-panel .row { display: grid; grid-template-columns: 86px 1fr 34px; align-items: center; gap: 10px; margin: 5px 0; font-size: 12px; }
    #fly-panel .track { height: 6px; background: #26282d; overflow: hidden; }
    #fly-panel .fill { height: 100%; transition: width .06s linear; }
    #fly-panel .num { text-align: right; color: #8a8d93; font-size: 11px; }
    #fly-panel .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    #fly-panel .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    #fly-panel .card { border: 1px solid #2a2c31; border-radius: 4px; padding: 10px 12px; }
    #fly-panel .gauge { position: relative; height: 22px; margin: 8px 0 4px; }
    #fly-panel .gauge .base { position: absolute; left: 0; right: 0; top: 10px; height: 2px; background: #3a3d43; }
    #fly-panel .gauge .th { position: absolute; top: 5px; width: 1px; height: 12px; background: #5a5d63; }
    #fly-panel .gauge .needle { position: absolute; top: 2px; width: 3px; height: 18px; margin-left: -1.5px; background: #f0f0f0; transition: left .06s linear; }
    #fly-panel .gscale { display: flex; justify-content: space-between; font-size: 10px; color: #6f7278; }
    #fly-panel .gf { display: flex; gap: 10px; margin-top: 10px; }
    #fly-panel .gf > div { flex: 1; }
    #fly-panel .gf .track { position: relative; overflow: visible; }
    #fly-panel .gf .mark { position: absolute; top: -3px; width: 1px; height: 12px; background: #8a8d93; left: 65%; }
    #fly-panel .badge { display: grid; place-items: center; text-align: center; border: 1px solid #2a2c31; border-radius: 4px; font-weight: 700; font-size: 15px;
      padding: 10px 6px; min-height: 72px; }
    #fly-panel .badge small { display: block; font-size: 11px; font-weight: 400; margin-top: 3px; }
    #fly-panel canvas.hist { width: 100%; display: block; }
    #fly-panel .qrow { display: grid; grid-template-columns: 58px 1fr 44px; align-items: center; gap: 8px; margin: 4px 0; font-size: 12px; color: #a0a3a8; }
    #fly-panel .qrow.pick span:first-child { color: #f0f0f0; font-weight: 600; }
    #fly-panel .qtrack { position: relative; height: 6px; background: #26282d; }
    #fly-panel .qtrack .zero { position: absolute; left: 50%; top: -2px; width: 1px; height: 10px; background: #5a5d63; }
    #fly-panel .qtrack .fill { position: absolute; top: 0; transition: left .06s linear, width .06s linear; }
    #fly-panel .dop { display: grid; place-items: center; text-align: center; border: 1px solid #2a2c31; border-radius: 4px; padding: 10px 6px; min-height: 72px;
      font-size: 11px; color: #8a8d93; transition: border-color .25s; }
    #fly-panel .dop b { display: block; font: 600 18px ui-monospace, "Cascadia Mono", Consolas, monospace; color: #f0f0f0; }
    #fly-panel .inst { font-size: 11px; color: #8a8d93; margin-top: 6px; }
    #fly-panel .chips { display: flex; gap: 5px; }
    #fly-panel .chips b { flex: 1; text-align: center; font-size: 11px; font-weight: 600; padding: 1px 0; border: 1px solid #2a2c31; border-radius: 3px; color: #8a8d93; }
    @media (max-width: 1180px) {
      body { padding-right: 0 !important; }
      #fly-panel { position: relative; top: auto; right: auto; bottom: auto; width: auto; max-width: 608px; margin: 16px auto; overflow: visible; }
    }
    @media (max-width: 560px) {
      #fly-panel .stats { grid-template-columns: 1fr 1fr; }
      #fly-panel .stats div:nth-child(3) { border-left: none; padding-left: 0; border-top: 1px solid #2a2c31; }
      #fly-panel .stats div:nth-child(4) { border-top: 1px solid #2a2c31; }
      #fly-panel .cols { display: block; }
    }
    #fly-panel .foot { margin-top: 12px; padding-top: 8px; border-top: 1px solid #2a2c31; font-size: 11px; color: #6f7278;
      display: flex; justify-content: space-between; gap: 8px; }`
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)

  // give the game a thin frame
  const game = document.querySelector('canvas.cer0Bd')
  let frame = game?.parentElement ?? null
  while (frame && frame.parentElement && frame.parentElement !== document.body && frame.getBoundingClientRect().height < 600) frame = frame.parentElement
  frame?.classList.add('fly-game-frame')
  // Google centers the game in the whole window; move it into the free space left of the panel
  const place = () => {
    if (!frame) return
    frame.style.translate = ''
    const r = frame.getBoundingClientRect(), free = window.innerWidth - 640
    frame.style.translate = `${Math.min(0, free / 2 - (r.left + r.width / 2))}px 0`
  }
  window.addEventListener('resize', place)
  setTimeout(place, 0)

  const el = document.createElement('div')
  el.id = 'fly-panel'
  el.innerHTML = `
    <div class="hd">
      <div class="ttl">fly-snake</div>
      <div class="sub">Drosophila, MaleCNS-Connectome (Janelia/Google)</div>
      <div class="live" id="fp-live">läuft</div>
    </div>
    <div class="stats">
      <div><span>Äpfel</span><b id="fp-apples">0</b></div>
      <div><span>Rekord</span><b id="fp-best">0</b></div>
      <div><span>Schnitt</span><b id="fp-avg">–</b></div>
      <div><span>Spiele gesamt</span><b id="fp-exp">0</b></div>
    </div>
    <div class="sec">Gehirn <em>von vorne, Zellkörper an echter Position</em></div>
    <canvas class="brain" id="fp-brain"></canvas>
    <div class="legend">
      <span><i style="background:${COLORS[1]}"></i>LC10 Apfel</span>
      <span><i style="background:${COLORS[2]}"></i>LC4/LPLC2 Gefahr</span>
      <span><i style="background:${COLORS[0]}"></i>Zwischenneuronen</span>
      <span><i style="background:${COLORS[3]}"></i>DNa Lenken</span>
      <span><i style="background:${COLORS[4]}"></i>DNp01 Flucht</span>
      <span><i style="border:1.5px solid ${COLORS[5]};border-radius:50%;box-sizing:border-box"></i>Gedächtnis-Code</span>
    </div>
    <div class="cols">
      <div>
        <div class="sec">Sinne</div>
        <div class="row"><span>Apfel links</span><div class="track"><div class="fill" id="fp-aL" style="background:${COLORS[1]}"></div></div><span class="num" id="fp-aLn">0</span></div>
        <div class="row"><span>Apfel rechts</span><div class="track"><div class="fill" id="fp-aR" style="background:${COLORS[1]}"></div></div><span class="num" id="fp-aRn">0</span></div>
        <div class="row"><span>Gefahr links</span><div class="track"><div class="fill" id="fp-lL" style="background:${COLORS[2]}"></div></div><span class="num" id="fp-lLn">0</span></div>
        <div class="row"><span>Gefahr rechts</span><div class="track"><div class="fill" id="fp-lR" style="background:${COLORS[2]}"></div></div><span class="num" id="fp-lRn">0</span></div>
        <div class="row body"><span>Körper</span><div class="chips"><b id="fp-b0">←</b><b id="fp-b1">↑</b><b id="fp-b2">→</b></div><span class="num" id="fp-len">–</span></div>
        <div class="sec">Instinkt</div>
        <div class="card">
          <div style="display:flex;justify-content:space-between;font-size:12px"><span>Lenk-Neuronen DNa01/02</span><span class="num" id="fp-steer">0.000</span></div>
          <div class="gauge"><div class="base"></div><div class="th" style="left:37.5%"></div><div class="th" style="left:62.5%"></div><div class="needle" id="fp-needle" style="left:50%"></div></div>
          <div class="gscale"><span>◀ links</span><span>geradeaus</span><span>rechts ▶</span></div>
          <div class="gf">
            <div><div style="font-size:11px;color:#8a8d93;margin-bottom:4px">Flucht L <span class="num" id="fp-gfLn"></span></div><div class="track"><div class="fill" id="fp-gfL" style="background:${COLORS[4]}"></div><div class="mark"></div></div></div>
            <div><div style="font-size:11px;color:#8a8d93;margin-bottom:4px">Flucht R <span class="num" id="fp-gfRn"></span></div><div class="track"><div class="fill" id="fp-gfR" style="background:${COLORS[4]}"></div><div class="mark"></div></div></div>
          </div>
        </div>
      </div>
      <div>
        <div class="sec">Entscheidung</div>
        <div class="pair">
          <div class="badge" id="fp-badge">–<small id="fp-reason"></small></div>
          <div class="dop" id="fp-dop"><div>Dopamin<b id="fp-dopv">0.00</b><span id="fp-dopt">–</span></div></div>
        </div>
        <div class="sec">Gelernt <em id="fp-learninfo"></em></div>
        <div class="card" style="padding:8px 12px">
          <div class="qrow" id="fp-q0"><span>↰ links</span><div class="qtrack"><div class="zero"></div><div class="fill"></div></div><span class="num"></span></div>
          <div class="qrow" id="fp-q1"><span>↑ gerade</span><div class="qtrack"><div class="zero"></div><div class="fill"></div></div><span class="num"></span></div>
          <div class="qrow" id="fp-q2"><span>rechts ↱</span><div class="qtrack"><div class="zero"></div><div class="fill"></div></div><span class="num"></span></div>
          <div class="inst" id="fp-inst"></div>
        </div>
      </div>
    </div>
    <div class="sec">Lernkurve <em id="fp-histinfo"></em></div>
    <canvas class="hist" id="fp-hist"></canvas>
    <div class="foot"><span id="fp-mode"></span><span>${layout.footer ?? ''}</span></div>`
  document.body.appendChild(el)

  // ---- brain canvas: static silhouette once, activity on top ----
  const canvas = el.querySelector('#fp-brain') as HTMLCanvasElement
  const dpr = window.devicePixelRatio || 1
  // fit the brain into a 584 x 188 box, keeping its real proportions
  const W = 584, H = 188, PAD = 10
  const S = Math.min(W - 2 * PAD, (H - 2 * PAD - 6) / layout.height), OX = (W - S) / 2
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.aspectRatio = `${W} / ${H}`
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  const N = layout.role.length
  const X = (i: number) => OX + layout.pos[2 * i] * S
  const Y = (i: number) => PAD + 6 + layout.pos[2 * i + 1] * S
  const bg = document.createElement('canvas')
  bg.width = W * dpr; bg.height = H * dpr
  const b = bg.getContext('2d')!
  b.scale(dpr, dpr)
  for (let i = 0; i < N; i++) {
    b.fillStyle = COLORS[layout.role[i]]; b.globalAlpha = layout.role[i] >= 3 ? 0.5 : 0.13
    b.beginPath(); b.arc(X(i), Y(i), layout.role[i] >= 3 ? 2.2 : 1.1, 0, 7); b.fill()
  }
  b.globalAlpha = 1; b.fillStyle = '#6f7278'; b.font = '10px system-ui, Segoe UI, sans-serif'; b.textAlign = 'center'
  for (const l of layout.labels) b.fillText(l.text, OX + l.x * S, PAD + 6 + l.y * S)
  ctx.drawImage(bg, 0, 0, W, H)

  const hist = el.querySelector('#fp-hist') as HTMLCanvasElement
  const CH = 76
  hist.width = W * dpr; hist.height = CH * dpr; hist.style.height = 'auto'; hist.style.aspectRatio = `${W} / ${CH}`
  const hx = hist.getContext('2d')!
  hx.scale(dpr, dpr)

  const $ = (id: string) => el.querySelector(`#${id}`) as HTMLElement
  const setBar = (id: string, v: number, max: number) => { $(id).style.width = `${Math.min(100, (v / max) * 100)}%`; $(`${id}n`).textContent = v.toFixed(2) }

  ;(window as unknown as { flyUpdate: (a: string | Uint8Array, s: PanelState) => void }).flyUpdate = (act, s) => {
    const r = typeof act === 'string' ? Uint8Array.from(atob(act), ch => ch.charCodeAt(0)) : act
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(bg, 0, 0, W, H)
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < N; i++) {
      const a = r[i] / 255
      if (a < 0.03) continue
      const role = layout.role[i], big = role >= 3
      ctx.fillStyle = COLORS[role]
      ctx.globalAlpha = Math.min(1, 0.25 + a)
      const rad = big ? 3 + 5 * a : 1 + 1.8 * a
      ctx.beginPath(); ctx.arc(X(i), Y(i), rad, 0, 7); ctx.fill()
      if (big) { ctx.globalAlpha = 0.15 * a; ctx.beginPath(); ctx.arc(X(i), Y(i), rad * 2, 0, 7); ctx.fill() }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
    // the sparse memory code: the few neurons whose learned synapses decide right now
    ctx.strokeStyle = COLORS[5]; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.9
    for (const i of s.code) { ctx.beginPath(); ctx.arc(X(i), Y(i), 3.2, 0, 7); ctx.stroke() }
    ctx.globalAlpha = 1

    $('fp-exp').textContent = s.experience.toLocaleString('de-DE')
    $('fp-apples').textContent = String(s.apples)
    $('fp-best').textContent = String(s.best)
    $('fp-avg').textContent = s.avg === null ? '–' : s.avg.toFixed(1)
    $('fp-live').className = s.playing ? 'live' : 'live off'
    $('fp-live').textContent = s.playing ? 'läuft' : 'pausiert'
    setBar('fp-aL', s.sees.appleL, 1.5); setBar('fp-aR', s.sees.appleR, 1.5)
    setBar('fp-lL', s.sees.loomL, 2); setBar('fp-lR', s.sees.loomR, 2)
    setBar('fp-gfL', s.gfL, 1); setBar('fp-gfR', s.gfR, 1)
    $('fp-steer').textContent = `${s.steer >= 0 ? '+' : ''}${s.steer.toFixed(3)}`
    $('fp-needle').style.left = `${50 + Math.max(-1, Math.min(1, s.steer / 0.12)) * 50}%`
    const badge = $('fp-badge')
    const look = s.turn < 0 ? ['← links', '#f0f0f0'] : s.turn > 0 ? ['rechts →', '#f0f0f0'] : ['↑ gerade', '#b5b7bb']
    const reasonColor: Record<string, string> = { lenken: COLORS[3], flucht: COLORS[4], schutz: COLORS[2], geradeaus: '#8a8d93', gelernt: COLORS[5], neugier: COLORS[0] }
    badge.firstChild!.textContent = look[0]
    badge.style.color = look[1]
    badge.style.borderColor = reasonColor[s.reason] ?? '#2a2c31'
    const reason = $('fp-reason')
    reason.textContent = s.reason ? { lenken: 'Verfolgung', flucht: 'Fluchtreflex', schutz: 'Reflex-Schutz', geradeaus: 'kein Signal', gelernt: 'Gelerntes', neugier: 'Neugier' }[s.reason] ?? s.reason : ''
    reason.style.color = reasonColor[s.reason] ?? '#8a8d93'
    $('fp-mode').textContent = `${s.learning ? 'lernt mit Dopamin' : s.q ? 'Lernen pausiert' : 'nur Instinkt'} · Reflex-Schutz ${s.schutz ? 'an' : 'aus'}`

    // body sense: per direction free (green, tail reachable), tight (amber), trap or blocked (red)
    $('fp-len').textContent = s.length ? `${s.length}` : '–'
    for (let a = 0; a < 3; a++) {
      const chip = $(`fp-b${a}`), f = s.body?.slice(4 * a, 4 * a + 4)
      const [label, c] = !f ? ['–', '#8a8d93'] : f[0] ? ['zu', COLORS[4]] : f[1] ? ['Falle', COLORS[4]] : f[3] ? ['frei', COLORS[3]] : f[2] ? ['eng', COLORS[2]] : ['frei', COLORS[3]]
      chip.textContent = `${['←', '↑', '→'][a]} ${label}`
      chip.style.color = c; chip.style.borderColor = c
    }

    // learned action values and dopamine
    const names = ['links', 'gerade', 'rechts']
    const pick = s.turn + 1
    for (let a = 0; a < 3; a++) {
      const row = $(`fp-q${a}`), v = s.q ? s.q[a] : 0, x = Math.max(-1, Math.min(1, v / 1.5))
      const fill = row.querySelector('.fill') as HTMLElement
      fill.style.left = `${50 + Math.min(0, x) * 50}%`; fill.style.width = `${Math.abs(x) * 50}%`
      fill.style.background = v >= 0 ? COLORS[5] : COLORS[4]
      row.querySelector('.num')!.textContent = s.q ? v.toFixed(2) : '–'
      row.className = a === pick ? 'qrow pick' : 'qrow'
    }
    $('fp-inst').textContent = !s.q ? (s.learning ? 'bereit' : 'nur Instinkt, kein Gedächtnis') : !s.learning ? 'Lernen pausiert – spielt mit dem Gelernten'
      : s.instinct === s.turn ? `Instinkt und Gelerntes einig: ${names[pick]}` : `Instinkt wollte ${names[s.instinct + 1]}, entschieden: ${names[pick]}`
    const dop = $('fp-dop'), dv = s.dopamine, dc = dv > 0.15 ? COLORS[3] : dv < -0.15 ? COLORS[4] : null
    $('fp-dopv').textContent = `${dv >= 0 ? '+' : ''}${dv.toFixed(2)}`
    $('fp-dopt').textContent = dv > 0.15 ? 'besser als erwartet' : dv < -0.15 ? 'schlechter als erwartet' : 'wie erwartet'
    dop.style.borderColor = dc ?? '#2a2c31'
    $('fp-dopv').style.color = dc ?? '#f0f0f0'
    $('fp-learninfo').textContent = s.learning ? 'Dopamin = Überraschung' : ''

    // learning curve: rolling mean of apples per game over the fly's whole life, this session highlighted
    const c = s.curve
    const lo = Math.max(0, Math.floor(Math.min(...c) - 1)), hi = Math.max(lo + 4, Math.ceil(Math.max(...c) + 1))
    const L = 22, R = W - 32, T = 6, B = CH - 6
    const px = (k: number) => L + (k / Math.max(1, c.length - 1)) * (R - L), py = (v: number) => B - ((v - lo) / (hi - lo)) * (B - T)
    hx.clearRect(0, 0, W, CH)
    hx.font = '10px ui-monospace, Consolas, monospace'; hx.lineWidth = 1
    for (const v of [lo, (lo + hi) / 2, hi]) {
      hx.strokeStyle = '#26282d'; hx.beginPath(); hx.moveTo(L, py(v)); hx.lineTo(R, py(v)); hx.stroke()
      hx.fillStyle = '#6f7278'; hx.textAlign = 'right'; hx.fillText(String(Math.round(v)), L - 5, py(v) + 3)
    }
    if (c.length > 1) {
      if (s.curveToday < c.length - 1) { hx.fillStyle = 'rgba(91,143,214,.08)'; hx.fillRect(px(s.curveToday), T - 4, R - px(s.curveToday), B - T + 8) }
      hx.lineWidth = 2; hx.strokeStyle = COLORS[5]; hx.lineJoin = 'round'
      hx.beginPath(); c.forEach((v, k) => (k ? hx.lineTo(px(k), py(v)) : hx.moveTo(px(k), py(v)))); hx.stroke()
      const last = c[c.length - 1]
      hx.fillStyle = COLORS[5]; hx.beginPath(); hx.arc(R, py(last), 3.5, 0, 7); hx.fill()
      hx.fillStyle = '#d8d8d8'; hx.textAlign = 'left'; hx.fillText(last.toFixed(1), R + 7, py(last) + 3)
    }
    $('fp-histinfo').textContent = c.length > 1 ? `Ø Äpfel über ${s.experience.toLocaleString('de-DE')} Spiele · blau = heute` : 'noch zu wenig Spiele'
  }
}
