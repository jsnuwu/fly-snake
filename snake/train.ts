// Train the fly offline on a local Snake clone (same 17x15 field as Google Snake) - much faster than the browser.
//   node train.ts [games=500] [--frisch] [--schutz] [--instinkt] [--pruefen]
// It continues from gedaechtnis.json (the fly's memory) and saves back to it, so play.ts plays with what was learned.
//   --frisch    start with a fresh, untrained fly
//   --instinkt  no learning at all (pure connectome), memory is not touched
//   --pruefen   play with the memory as it is: no curiosity, no learning, nothing saved
import { claimMemory, loadBrain, loadMemory, saveMemory } from './files.ts'
import { SnakeGame, tick } from './game.ts'
import { Learner } from './learn.ts'

const args = process.argv.slice(2)
const games = +(args.find(a => /^\d+$/.test(a)) ?? 500)
const schutz = args.includes('--schutz')
const instinctOnly = args.includes('--instinkt')
const check = args.includes('--pruefen')
const EXPLORE = 0.02 // chance of a random, curious move while training

const brain = loadBrain()
const learner = instinctOnly ? undefined : args.includes('--frisch') ? new Learner(brain.N) : loadMemory(brain.N)
if (learner && check) learner.frozen = true
if (learner && !check) claimMemory('train.ts')

function play(explore: number) {
  brain.reset()
  const game = new SnakeGame()
  for (;;) {
    const { outcome } = tick(brain, game, { schutz, learner, explore })
    if (outcome === 'crash' || outcome === 'hunger') return game.apples
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const start = learner?.games ?? 0
console.log(instinctOnly ? 'Nur Instinkt (kein Lernen):' : check ? `Prüfung mit ${start} Spielen Erfahrung (ohne Lernen):` : `Training ab Spiel ${start}${schutz ? ' (mit Reflex-Schutz)' : ''}:`)
let block: number[] = []
const t0 = Date.now()
for (let g = 1; g <= games; g++) {
  // curious at first, then more and more sure of itself
  const explore = learner && !check ? Math.max(0.01, EXPLORE * (1 - learner.games / 3000)) : 0
  const apples = play(explore)
  block.push(apples)
  if (learner && !check) learner.record(apples)
  if (block.length === 100 || g === games) {
    const total = start + g
    console.log(`  Spiele ${String(total - block.length + 1).padStart(5)}-${String(total).padEnd(5)}  Äpfel Ø ${mean(block).toFixed(1).padStart(5)}  bestes ${String(Math.max(...block)).padStart(3)}   (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
    block = []
    if (learner && !check) saveMemory(learner)
  }
}
