// Runs the fly in the background of the page: brain, Snake game and dopamine learning.
// The page (app.js) only draws; it sends commands and gets a frame for every move (or ~25 per second in turbo).
import { Brain } from './core/brain.js'
import { SnakeGame, tick } from './core/game.js'
import { Learner } from './core/learn.js'
import { learningCurve, panelLayout } from './core/panel.js'

const DELAY = { langsam: 260, normal: 130, schnell: 50 } // ms per move; turbo = as fast as possible
const CRASH_PAUSE = 900
const TURBO_SAVE_EVERY = 5 // games

let brain, learner, game
let running = false, speed = 'normal', schutz = false, learning = true
let timer = 0, scores = [], sessionStart = 0, last = null, outcome = 'moved', unsaved = 0

const loadJSON = async url => (await fetch(url, { cache: 'no-cache' })).json()
const trained = async () => {
  try { return Learner.fromJSON(await loadJSON('data/fliege.json'), brain.N) } catch { return new Learner(brain.N) }
}

function use(l) {
  learner = l
  learner.frozen = !learning
  sessionStart = learner.history.length
  scores = []
  newGame()
  frame()
  save()
}

function newGame() {
  brain.reset()
  game = new SnakeGame()
  last = null
  outcome = 'moved'
}

function step() {
  const r = tick(brain, game, { schutz, learner, explore: speed === 'turbo' && learning ? 0.01 : 0 })
  last = r.decision
  outcome = r.outcome
  if (outcome !== 'crash' && outcome !== 'hunger') return false
  scores.push(game.apples)
  if (learning) learner.record(game.apples)
  unsaved++
  return true
}

function frame() {
  const act = new Uint8Array(brain.N)
  for (let i = 0; i < brain.N; i++) act[i] = Math.min(255, brain.r[i] * 255)
  const d = last
  const state = {
    apples: game.apples, best: Math.max(game.apples, ...scores),
    avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    playing: running, schutz,
    sees: d?.sees ?? { appleL: 0, appleR: 0, loomL: 0, loomR: 0 },
    steer: d?.steer ?? 0, gfL: d?.gfL ?? 0, gfR: d?.gfR ?? 0, turn: d?.turn ?? 0, reason: d?.reason ?? '',
    learning, experience: learner.games, q: d?.q ?? null, instinct: d?.instinct ?? 0, dopamine: learner.dopamine,
    code: learner.active, body: d?.body ?? null, length: game.snake.length,
    ...learningCurve(learner.history, sessionStart),
  }
  postMessage({
    type: 'frame', act, state, speed, running,
    board: { w: game.w, h: game.h, snake: game.snake, apple: game.apple, apples: game.apples, outcome, games: scores.length },
  }, [act.buffer])
}

function save(download = false) {
  unsaved = 0
  postMessage({ type: 'memory', memory: learner.toJSON(), download })
}

function loop() {
  if (!running) return
  let over = false
  if (speed === 'turbo') {
    const t0 = performance.now()
    while (performance.now() - t0 < 40) if (step()) { over = true; newGame() }
    frame()
    if (over && unsaved >= TURBO_SAVE_EVERY) save()
    timer = setTimeout(loop, 0)
    return
  }
  over = step()
  frame()
  if (over) {
    save()
    timer = setTimeout(() => { newGame(); frame(); loop() }, CRASH_PAUSE)
  } else timer = setTimeout(loop, DELAY[speed])
}

function setRunning(on) {
  running = on
  clearTimeout(timer)
  if (on) loop()
  else { if (unsaved) save(); frame() }
}

onmessage = async ({ data: m }) => {
  if (!game && m.cmd !== 'init') {
    // still loading: remember the settings, ignore the rest
    if (m.cmd === 'speed') speed = m.speed
    if (m.cmd === 'schutz') schutz = m.on
    if (m.cmd === 'learning') learning = m.on
    return
  }
  switch (m.cmd) {
    case 'init': {
      brain = new Brain(await loadJSON('data/network.json'))
      const l = m.memory?.n === brain.N ? Learner.fromJSON(m.memory, brain.N) : await trained()
      // the page enables Start on 'ready', so everything has to exist before that
      postMessage({ type: 'ready', layout: panelLayout(brain) })
      use(l)
      break
    }
    case 'run': setRunning(m.on); break
    case 'speed':
      speed = m.speed
      if (running) { clearTimeout(timer); if (outcome === 'crash' || outcome === 'hunger') newGame(); loop() } else frame()
      break
    case 'schutz': schutz = m.on; frame(); break
    case 'learning': learning = m.on; learner.frozen = !learning; frame(); break
    case 'fresh': use(new Learner(brain.N)); break
    case 'trained': use(await trained()); break
    case 'load':
      if (m.memory?.n !== brain.N || typeof m.memory.w !== 'string') postMessage({ type: 'error', text: 'Das ist kein Fliegen-Gedächtnis für dieses Gehirn.' })
      else use(Learner.fromJSON(m.memory, brain.N))
      break
    case 'export': save(true); break
  }
}
