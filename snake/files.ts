// Node side: loading the brain and the fly's memory from disk.
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { Brain } from './brain.ts'
import { Learner } from './learn.ts'

export const loadBrain = () => new Brain(JSON.parse(readFileSync(new URL('./network.json', import.meta.url), 'utf8')))

const MEMORY = new URL('./gedaechtnis.json', import.meta.url)
const LOCK = new URL('./gedaechtnis.lock', import.meta.url)

export function loadMemory(n: number): Learner {
  return Learner.fromJSON(existsSync(MEMORY) ? JSON.parse(readFileSync(MEMORY, 'utf8')) : null, n)
}

export function saveMemory(learner: Learner) {
  const tmp = new URL(MEMORY.href + '.tmp')
  writeFileSync(tmp, JSON.stringify(learner))
  renameSync(tmp, MEMORY)
}

/** only one program may learn into the memory at a time, otherwise one would overwrite what the other learned */
export function claimMemory(program: string) {
  if (existsSync(LOCK)) {
    const [pid, other] = readFileSync(LOCK, 'utf8').split(' ')
    let alive = false
    try { process.kill(+pid, 0); alive = true } catch { /* that program is gone */ }
    if (alive) {
      console.error(`Die Fliege lernt gerade schon in ${other}. Beende das erst, sonst überschreiben sich die beiden gegenseitig.`)
      process.exit(1)
    }
  }
  writeFileSync(LOCK, `${process.pid} ${program}`)
  process.on('exit', () => { try { unlinkSync(LOCK) } catch { /* already gone */ } })
}
