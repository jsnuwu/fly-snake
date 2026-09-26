// The page: draws the Snake board and the brain panel, and sends the buttons to the fly (worker.js).
import { installPanel } from './core/panel.js'

const STORE = 'flynet-memory'
const CELL = 36
const $ = id => document.getElementById(id)

const worker = new Worker('worker.js', { type: 'module' })
let running = false, speed = 'normal', memory = null
let prev = null, cur = null, apple = null, frameAt = 0, outcome = 'moved', lastApples = 0
let freshArmed = 0

// ---------- memory in the browser ----------
function loadStored() {
  try { return JSON.parse(localStorage.getItem(STORE) ?? 'null') } catch { return null }
}
function store(m) {
  try { localStorage.setItem(STORE, JSON.stringify(m)); return true } catch { return false }
}
const status = text => { $('status').textContent = text }

// ---------- messages from the fly ----------
worker.onmessage = ({ data: m }) => {
  if (m.type === 'ready') {
    installPanel({ ...m.layout, footer: 'läuft lokal im Browser' })
    $('run').disabled = false
    return
  }
  if (m.type === 'frame') {
    window.flyUpdate(m.act, m.state)
    const b = m.board
    const moved = cur && (b.snake[0][0] !== cur[0][0] || b.snake[0][1] !== cur[0][1])
    prev = moved && speed !== 'turbo' ? cur : b.snake
    cur = b.snake
    apple = b.apple
    outcome = b.outcome
    frameAt = performance.now()
    $('score').textContent = b.apples
    $('best').textContent = m.state.best
    $('games').textContent = b.games ? `Spiel ${b.games + 1}, Ø ${m.state.avg.toFixed(1)}` : ''
    showOverlay(b)
    lastApples = b.apples
    return
  }
  if (m.type === 'memory') {
    memory = m.memory
    const ok = store(memory)
    status(`${memory.games.toLocaleString('de-DE')} Spiele Erfahrung, ${ok ? 'gespeichert' : 'Speichern nicht möglich (privates Fenster?)'}`)
    if (m.download) download(memory)
    return
  }
  if (m.type === 'error') status(m.text)
}

function showOverlay(b) {
  const o = $('overlay')
  if ((b.outcome === 'crash' || b.outcome === 'hunger') && speed !== 'turbo') {
    o.innerHTML = `<div>${b.outcome === 'crash' ? 'Crash' : 'Im Kreis gelaufen'}<small>${b.apples} Äpfel</small></div>`
    o.hidden = false
  } else if (!running) {
    o.innerHTML = b.games || b.apples ? '<div>Pause</div>' : '<div>Start drücken<small>die Fliege spielt von selbst</small></div>'
    o.hidden = false
  } else o.hidden = true
}

// ---------- drawing the board ----------
const canvas = $('board')
const ctx = canvas.getContext('2d')
function resize() {
  const dpr = window.devicePixelRatio || 1
  canvas.width = 17 * CELL * dpr
  canvas.height = 15 * CELL * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
resize()
matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener?.('change', resize)

const center = ([x, y]) => [x * CELL + CELL / 2, y * CELL + CELL / 2]
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

function draw(now) {
  for (let y = 0; y < 15; y++) for (let x = 0; x < 17; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#a2d149' : '#aad751'
    ctx.fillRect(x * CELL, y * CELL, CELL, CELL)
  }
  if (apple) drawApple(center([apple.x, apple.y]))
  if (cur) {
    // glide from the previous cell to the current one between two moves
    const interval = { langsam: 260, normal: 130, schnell: 50 }[speed] ?? 0
    const t = !prev || prev === cur || !interval || outcome !== 'moved' && outcome !== 'apple' ? 1 : Math.min(1, (now - frameAt) / interval)
    const pts = cur.map(center)
    if (prev && prev !== cur && t < 1) {
      pts[0] = lerp(center(prev[0]), pts[0], t)
      if (cur.length === prev.length) pts[pts.length - 1] = lerp(center(prev[prev.length - 1]), pts[pts.length - 1], t)
    }
    drawSnake(pts, outcome === 'crash')
  }
  requestAnimationFrame(draw)
}

function drawSnake(pts, crashed) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  const path = () => { ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p) }
  path(); ctx.strokeStyle = '#2f55c0'; ctx.lineWidth = CELL * 0.8; ctx.stroke()
  path(); ctx.strokeStyle = crashed ? '#6b7fb8' : '#4e7cf6'; ctx.lineWidth = CELL * 0.68; ctx.stroke()
  const [hx, hy] = pts[0]
  const [nx, ny] = pts[1] ?? [hx - 1, hy]
  let dx = hx - nx, dy = hy - ny
  const len = Math.hypot(dx, dy) || 1
  dx /= len; dy /= len
  ctx.fillStyle = crashed ? '#6b7fb8' : '#4e7cf6'
  ctx.beginPath(); ctx.arc(hx, hy, CELL * 0.42, 0, 7); ctx.fill()
  for (const side of [-1, 1]) {
    const ex = hx + dx * CELL * 0.1 - dy * side * CELL * 0.2, ey = hy + dy * CELL * 0.1 + dx * side * CELL * 0.2
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, CELL * 0.13, 0, 7); ctx.fill()
    ctx.fillStyle = '#1b2440'
    if (crashed) { ctx.font = `bold ${CELL * 0.22}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('×', ex, ey + 1) }
    else { ctx.beginPath(); ctx.arc(ex + dx * CELL * 0.05, ey + dy * CELL * 0.05, CELL * 0.065, 0, 7); ctx.fill() }
  }
}

function drawApple([x, y]) {
  const r = CELL * 0.34
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(x + 2, y + r * 0.9, r * 0.8, r * 0.3, 0, 0, 7); ctx.fill()
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r)
  g.addColorStop(0, '#ff7a5c'); g.addColorStop(0.6, '#e7471d'); g.addColorStop(1, '#c2360f')
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + 1, r, 0, 7); ctx.fill()
  ctx.strokeStyle = '#6b4226'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x, y - r * 0.7); ctx.lineTo(x + 1, y - r * 1.15); ctx.stroke()
  ctx.fillStyle = '#6ab04c'; ctx.beginPath(); ctx.ellipse(x + r * 0.42, y - r * 1.05, r * 0.38, r * 0.18, -0.5, 0, 7); ctx.fill()
}
requestAnimationFrame(draw)

// ---------- buttons ----------
function setRunning(on) {
  running = on
  $('run').textContent = on ? 'Pause' : 'Start'
  $('run').classList.toggle('pause', on)
  worker.postMessage({ cmd: 'run', on })
}
$('run').onclick = () => setRunning(!running)
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !e.target.closest('button, input, summary') && !$('run').disabled) { e.preventDefault(); setRunning(!running) }
})

for (const b of $('speed').querySelectorAll('button')) {
  b.onclick = () => {
    speed = b.dataset.speed
    for (const o of $('speed').querySelectorAll('button')) o.classList.toggle('on', o === b)
    worker.postMessage({ cmd: 'speed', speed })
  }
}
$('learning').onchange = e => worker.postMessage({ cmd: 'learning', on: e.target.checked })
$('schutz').onchange = e => worker.postMessage({ cmd: 'schutz', on: e.target.checked })
$('trained').onclick = () => worker.postMessage({ cmd: 'trained' })

// "Neue Fliege" deletes what was learned, so it asks for a second click
$('fresh').onclick = () => {
  const b = $('fresh')
  if (Date.now() - freshArmed < 4000) {
    freshArmed = 0
    b.textContent = 'Neue Fliege'; b.classList.remove('danger')
    worker.postMessage({ cmd: 'fresh' })
    return
  }
  freshArmed = Date.now()
  b.textContent = 'Gedächtnis löschen?'; b.classList.add('danger')
  setTimeout(() => { if (freshArmed && Date.now() - freshArmed >= 4000) { b.textContent = 'Neue Fliege'; b.classList.remove('danger') } }, 4100)
}

$('export').onclick = () => worker.postMessage({ cmd: 'export' })
function download(m) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/json' }))
  a.download = `fliege-${m.games}-spiele.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
$('import').onclick = () => $('file').click()
$('file').onchange = async e => {
  const f = e.target.files[0]
  e.target.value = ''
  if (!f) return
  try { worker.postMessage({ cmd: 'load', memory: JSON.parse(await f.text()) }) } catch { status('Die Datei konnte nicht gelesen werden.') }
}

worker.postMessage({ cmd: 'init', memory: loadStored() })
