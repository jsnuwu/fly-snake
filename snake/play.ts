// The fly plays the real Google Snake (google.com/fbx?fbx=snake_arcade) in a visible Edge window.
//   node play.ts [--schutz] [--instinkt] [--games=10] [--headless]
// It reads the game canvas (what is where), lets the connectome decide, and presses the arrow keys.
// It keeps learning while it plays (dopamine, see learn.ts) and saves what it learned to gedaechtnis.json after
// every game. --instinkt plays with the pure connectome and leaves the memory alone.
import puppeteer, { type Page } from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claimMemory, loadBrain, loadMemory, saveMemory } from './files.ts'
import { decide, DX, DY, KEYS, type Board, type Decision, type Dir } from './fly.ts'
import { REWARD } from './learn.ts'
import { installPanel, learningCurve, panelLayout, type PanelState } from './panel.ts'

const args = process.argv.slice(2)
const schutz = args.includes('--schutz')
const headless = args.includes('--headless')
const debug = args.includes('--debug')
const instinctOnly = args.includes('--instinkt')
const maxGames = +(args.find(a => a.startsWith('--games='))?.split('=')[1] ?? Infinity)
const URL_SNAKE = 'https://www.google.com/fbx?fbx=snake_arcade'
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const POLL_MS = 20 // look at the board ~40x per second (the snake moves ~6 cells per second)

interface Seen { w: number; h: number; snake: number[]; head: number; apple: number; menu: boolean; score: number | null }

/** runs inside the page: classify every cell of the 17x15 board from the canvas pixels */
function readBoard(): Seen | null {
  const c = document.querySelector('canvas.cer0Bd') as HTMLCanvasElement | null
  if (!c) return null
  const W = 17, H = 15, s = c.width / 650, off = 28 * s, cell = 35 * s
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
  const px = (x: number, y: number) => { const i = ((y | 0) * c.width + (x | 0)) * 4; return [d[i], d[i + 1], d[i + 2]] }
  const isBlue = ([r, g, b]: number[]) => b > 170 && r < 120 && g < 170 && b - r > 80
  const isRed = ([r, g, b]: number[]) => r > 190 && g < 120 && b < 80
  const snake: number[] = []
  let apple = -1, head = -1, bestWhite = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = off + x * cell + cell / 2, cy = off + y * cell + cell / 2
    const id = y * W + x
    if (isBlue(px(cx, cy))) {
      snake.push(id)
      let white = 0
      for (let yy = -cell / 2; yy < cell / 2; yy += 3) for (let xx = -cell / 2; xx < cell / 2; xx += 3) {
        const [r, g, b] = px(cx + xx, cy + yy)
        if (r > 235 && g > 235 && b > 235) white++
      }
      if (white > bestWhite) { bestWhite = white; head = id }
    } else if (isRed(px(cx, cy)) || isRed(px(cx, cy + 4 * s))) apple = id
  }
  // the menu stays in the DOM while playing, so check that its "Spielen" button is really on top
  const menu = [...document.querySelectorAll('div')].some(e => {
    if (e.textContent?.trim() !== 'Spielen') return false
    const r = e.getBoundingClientRect()
    if (!r.width || !r.height) return false
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !!top && (e === top || e.contains(top)) && getComputedStyle(e).visibility !== 'hidden' && Number(getComputedStyle(e.closest('[style*=opacity]') ?? e).opacity) > 0.5
  })
  const scoreText = document.querySelector('.HIonyd')?.textContent ?? ''
  return { w: W, h: H, snake, head, apple, menu, score: /^\d+$/.test(scoreText.trim()) ? +scoreText : null }
}

/**
 * Start Edge like a normal program (own profile, no automation flags) and connect to it afterwards.
 * Letting puppeteer launch a visible window left it white and frozen on some machines.
 */
async function openVisible(exe: string) {
  const port = 9333
  const profile = join(tmpdir(), 'fly-snake-edge-profile')
  const proc = spawn(exe, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--new-window', '--window-size=1760,1000', '--window-position=40,20', '--autoplay-policy=no-user-gesture-required',
    // reading the canvas many times a second is cheap when the canvas is not on the GPU
    '--disable-accelerated-2d-canvas',
    URL_SNAKE,
  ], { stdio: 'ignore' })
  const quit = () => { proc.kill(); process.exit(0) }
  process.on('SIGINT', quit)
  process.on('SIGTERM', quit)
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break } catch { /* not up yet */ }
    await sleep(200)
  }
  return puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null })
}

async function main() {
  const executablePath = BROWSERS.find(p => existsSync(p))
  if (!executablePath) throw new Error('Kein Edge/Chrome gefunden.')
  const brain = loadBrain()
  const learner = instinctOnly ? undefined : loadMemory(brain.N)
  if (learner) claimMemory('play.ts')
  const browser = headless ? await puppeteer.launch({ executablePath, headless, defaultViewport: { width: 1740, height: 900 } }) : await openVisible(executablePath)
  // closing the window ends the program
  browser.on('disconnected', () => { console.log('Fenster geschlossen – Ende.'); process.exit(0) })
  const pages = await browser.pages()
  const page: Page = pages.find(p => p.url().includes('snake_arcade')) ?? pages[0] ?? await browser.newPage()
  if (!page.url().includes('snake_arcade')) await page.goto(URL_SNAKE, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction(() => [...document.querySelectorAll('div')].some(e => e.textContent?.trim() === 'Spielen'), { timeout: 30000 })
  await page.evaluate(installPanel, { ...panelLayout(brain), footer: 'Fenster schließen = Ende' })

  const scores: number[] = []
  let playing = false, dir: Dir = 1, lastHead = -1, apples = 0, lastLen = 0
  let rewarded = 0
  const trail: number[] = []
  let last: Decision = { dir: 1, turn: 0, instinct: 0, reason: 'geradeaus', q: null, body: null, steer: 0, gfL: 0, gfR: 0, sees: { appleL: 0, appleR: 0, loomL: 0, loomR: 0 } }
  const startGames = learner?.history.length ?? 0

  const panel = async () => {
    const q = Uint8Array.from(brain.r, v => Math.min(255, v * 255))
    let bin = ''
    for (let i = 0; i < q.length; i += 0x8000) bin += String.fromCharCode(...q.subarray(i, i + 0x8000))
    const state: PanelState = {
      apples, best: Math.max(playing ? apples : 0, ...scores),
      avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      playing, schutz, sees: last.sees, steer: last.steer, gfL: last.gfL, gfR: last.gfR, turn: last.turn, reason: last.reason,
      learning: !!learner, experience: learner?.games ?? scores.length, q: last.q, instinct: last.instinct,
      dopamine: learner?.dopamine ?? 0, code: learner?.active ?? [], body: last.body, length: lastLen,
      ...learningCurve(learner?.history ?? scores, learner ? startGames : 0),
    }
    await page.evaluate((a, s) => (window as unknown as { flyUpdate: (a: string, s: PanelState) => void }).flyUpdate(a, s), btoa(bin), state).catch(() => {})
  }

  await panel()
  let decisions = 0
  console.log(`Die Fliege spielt Google Snake${schutz ? ' (mit Reflex-Schutz)' : ''}. Beenden mit Strg+C.`)
  if (learner) console.log(`Gedächtnis: ${learner.games} Spiele Erfahrung${learner.games ? '' : ' (noch untrainiert – schneller geht es mit node train.ts)'}.`)
  for (;;) {
    const s = await page.evaluate(readBoard).catch(() => null)
    if (!s) { await sleep(100); continue }

    if (s.menu) {
      if (playing) {
        playing = false
        scores.push(s.score ?? apples)
        if (learner) {
          learner.end(REWARD.crash)
          learner.record(scores[scores.length - 1])
          saveMemory(learner)
        }
        console.log(`Spiel ${scores.length}: ${scores[scores.length - 1]} Äpfel (Rekord ${Math.max(...scores)}, Ø ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)})`)
        if (debug) await page.screenshot({ path: `debug-spiel-${scores.length}.png` })
        await panel()
        if (scores.length >= maxGames) break
        await sleep(2000)
      }
      await page.evaluate(() => ([...document.querySelectorAll('div')].find(e => e.textContent?.trim() === 'Spielen' && (e as HTMLElement).offsetParent) as HTMLElement | undefined)?.click())
      await sleep(700)
      await page.keyboard.press('ArrowRight')
      brain.reset()
      playing = true; dir = 1; lastHead = -1; apples = 0; lastLen = 0; rewarded = 0; trail.length = 0
      continue
    }
    if (!playing || s.head < 0 || s.head === lastHead) { await sleep(POLL_MS); continue }

    // the head entered a new cell: update heading from the movement, then decide the next move.
    // While the snake glides between cells the eyes can briefly look like they are one cell back,
    // so only accept one step forward or sideways - never backwards or jumps.
    if (lastHead >= 0) {
      const dx = (s.head % s.w) - (lastHead % s.w), dy = Math.floor(s.head / s.w) - Math.floor(lastHead / s.w)
      const k = [0, 1, 2, 3].find(i => DX[i] === dx && DY[i] === dy)
      if (k === undefined || k === (dir + 2) % 4) { await sleep(POLL_MS); continue }
      dir = k as Dir
    }
    if (s.snake.length > lastLen && lastLen > 0) apples += s.snake.length - lastLen > 0 ? 1 : 0
    lastLen = s.snake.length
    if (s.score !== null) apples = s.score
    // dopamine: every step costs a little, every apple is a reward
    if (learner && lastHead >= 0) {
      learner.give(REWARD.step)
      if (apples > rewarded) learner.give(REWARD.apple * (apples - rewarded))
    }
    rewarded = apples
    lastHead = s.head
    // the canvas only shows which cells are blue, so find the tail from where the head has been:
    // the oldest visited cell that is still part of the body (at the start: the left end of the line)
    trail.push(s.head)
    if (trail.length > 400) trail.shift()
    const occupied = new Set(s.snake), visited = new Set(trail)
    const start = s.snake.filter(c => !visited.has(c))
    const tailId = start.length ? start.reduce((a, c) => (c % s.w < a % s.w ? c : a)) : trail.find(c => occupied.has(c) && c !== s.head) ?? -1
    const board: Board = {
      w: s.w, h: s.h, dir,
      body: new Set(s.snake.filter(c => c !== s.head)),
      head: { x: s.head % s.w, y: Math.floor(s.head / s.w) },
      apple: s.apple >= 0 ? { x: s.apple % s.w, y: Math.floor(s.apple / s.w) } : null,
      tail: tailId >= 0 ? { x: tailId % s.w, y: Math.floor(tailId / s.w) } : null,
      length: s.snake.length,
    }
    const d = decide(brain, board, { schutz, learner })
    last = d
    if (debug) console.log(`head ${board.head.x},${board.head.y} dir ${dir} apple ${board.apple ? `${board.apple.x},${board.apple.y}` : '-'} len ${s.snake.length} score ${s.score} -> ${d.dir} (${d.reason}, steer ${d.steer.toFixed(3)}, gf ${d.gfL.toFixed(2)}/${d.gfR.toFixed(2)})`)
    if (d.dir !== dir) await page.keyboard.press(KEYS[d.dir])
    await panel()
    if (debug && ++decisions === 30) await page.screenshot({ path: 'debug-mitte.png' })
  }
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  console.log(`\n${scores.length} Spiele: Ø ${avg.toFixed(1)} Äpfel, Rekord ${Math.max(...scores)}`)
  await browser.close()
}

main().catch(e => { console.error(e); process.exit(1) })
