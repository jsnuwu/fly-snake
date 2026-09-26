// How the fly plays Snake. Everything is seen from the snake's head (egocentric), like the fly sees its world:
//   apple to the left/right       -> LC10 neurons of the left/right eye (the circuit a male uses to chase a female)
//   wall or body close ahead/aside -> LC4/LPLC2 looming neurons of that side (the "something is coming at me" circuit)
// Each of these eye neurons looks at its own spot of the visual field (retinotopy), so the brain knows *where* the
// apple or the danger is, not only on which side. The instinct is read out from the descending neurons:
//   DNa01/DNa02 right minus left   -> turn right / left (steering)
//   DNp01 giant fiber fires        -> escape: turn away from that side
// With a Learner, dopamine-trained synapses (learn.ts) can overrule the instinct once they know better.
import type { Brain } from './brain.ts'
import { TURNS, type Learner, type Turn } from './learn.ts'

export type Dir = 0 | 1 | 2 | 3 // up, right, down, left
export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]
export const KEYS = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'] as const

export interface Board {
  w: number; h: number
  body: Set<number>              // cells occupied by the snake (y * w + x)
  head: { x: number; y: number }
  apple: { x: number; y: number } | null
  dir: Dir
  tail?: { x: number; y: number } | null // last body cell, if known
  length?: number                        // cells of the whole snake (head included)
}

export type Reason = 'lenken' | 'flucht' | 'geradeaus' | 'schutz' | 'gelernt' | 'neugier'

export interface Decision {
  dir: Dir
  turn: Turn
  instinct: Turn
  reason: Reason
  q: number[] | null             // learned value of left / straight / right
  body: number[] | null          // body sense (see bodySense)
  steer: number; gfL: number; gfR: number
  sees: { appleL: number; appleR: number; loomL: number; loomR: number }
}

const STEPS = 8
// calibrated with probe.ts: apple to one side steers ~0.08-0.09, apple straight ahead ~0.015 (-> go straight);
// the giant fiber saturates quickly, so only a wall right in front of a cell's reach looms strongly
const STEER_THRESHOLD = 0.03
const GF_THRESHOLD = 0.65
const DANGER = [2, 0.35, 0.12] // wall/body 0, 1 or 2 free cells away
const TUNE = 0.5               // width of an eye neuron's receptive field (radians)

const rel = (d: Dir, turn: number) => (((d + turn) % 4) + 4) % 4 as Dir

function blocked(b: Board, x: number, y: number) {
  return x < 0 || y < 0 || x >= b.w || y >= b.h || b.body.has(y * b.w + x)
}

/** free cells from the head along (dx, dy) before hitting a wall or the body */
function freeAlong(b: Board, dx: number, dy: number, max = 6) {
  let n = 0, x = b.head.x, y = b.head.y
  while (n < max) { x += dx; y += dy; if (blocked(b, x, y)) break; n++ }
  return n
}
const free = (b: Board, d: Dir) => freeAlong(b, DX[d], DY[d])

/** how much room is reachable after stepping into direction d (flood fill) */
function room(b: Board, d: Dir, cap = 120) {
  const sx = b.head.x + DX[d], sy = b.head.y + DY[d]
  if (blocked(b, sx, sy)) return 0
  const seen = new Set([sy * b.w + sx]), stack = [[sx, sy]]
  while (stack.length && seen.size < cap) {
    const [x, y] = stack.pop()!
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k], ny = y + DY[k], id = ny * b.w + nx
      if (!blocked(b, nx, ny) && !seen.has(id)) { seen.add(id); stack.push([nx, ny]) }
    }
  }
  return seen.size
}

/**
 * Body sense (20 inputs for the learning synapses): for each of left / straight / right whether the next cell is
 * blocked, whether the space behind it is smaller than the body (a trap) or than twice the body (tight), and whether
 * the tail can be reached from there (the tail moves away, so following it is safe); plus how long the body is and
 * in which direction the tail lies. Nothing here says what to do - the fly has to learn what these feelings mean.
 */
export function bodySense(b: Board): number[] {
  const len = b.length ?? b.body.size
  const d = b.dir, head = b.head.y * b.w + b.head.x
  const tailId = b.tail ? b.tail.y * b.w + b.tail.x : -1
  const out: number[] = []
  for (const t of TURNS) {
    const nd = rel(d, t), sx = b.head.x + DX[nd], sy = b.head.y + DY[nd]
    if (blocked(b, sx, sy)) { out.push(1, 1, 1, 0); continue }
    const cap = Math.min(b.w * b.h, 2 * len + 20)
    const seen = new Set([sy * b.w + sx]), stack = [[sx, sy]]
    let tail = false
    while (stack.length && seen.size < cap) {
      const [x, y] = stack.pop()!
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k], id = ny * b.w + nx
        if (id === tailId && nx >= 0 && nx < b.w) tail = true
        if (id !== head && !blocked(b, nx, ny) && !seen.has(id)) { seen.add(id); stack.push([nx, ny]) }
      }
    }
    out.push(0, seen.size < len ? 1 : 0, seen.size < 2 * len ? 1 : 0, tail ? 1 : 0)
  }
  out.push(len < 10 ? 1 : 0, len >= 10 && len < 20 ? 1 : 0, len >= 20 && len < 35 ? 1 : 0, len >= 35 ? 1 : 0)
  const tb = [0, 0, 0, 0] // tail ahead / right / behind / left
  if (b.tail) {
    const right = rel(d, 1), vx = b.tail.x - b.head.x, vy = b.tail.y - b.head.y
    const a = Math.atan2(vx * DX[right] + vy * DY[right], vx * DX[d] + vy * DY[d])
    tb[((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4] = 1
  }
  out.push(...tb)
  return out
}

// Every eye neuron gets a preferred direction (0 = straight ahead, + = right). The left eye covers the left and the
// front, the right eye the right and the front; the neurons are spread evenly over that range.
const fields = new WeakMap<Brain, Record<'tL' | 'tR' | 'lL' | 'lR', Float32Array>>()
function fieldsOf(brain: Brain) {
  let f = fields.get(brain)
  if (!f) {
    const spread = (list: number[], lo: number, hi: number) =>
      Float32Array.from(list, (_, k) => lo + (hi - lo) * ((k * 0.6180339887) % 1))
    const g = brain.groups
    f = {
      tL: spread(g.tL, -Math.PI, 0.5), tR: spread(g.tR, -0.5, Math.PI),
      lL: spread(g.lL, -Math.PI / 2 - 0.4, 0.4), lR: spread(g.lR, -0.4, Math.PI / 2 + 0.4),
    }
    fields.set(brain, f)
  }
  return f
}
const angle = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d }
const bump = (d: number) => Math.exp(-(d * d) / (2 * TUNE * TUNE))

export function decide(brain: Brain, b: Board, opts: { schutz: boolean; learner?: Learner; explore?: number }): Decision {
  const d = b.dir, left = rel(d, -1), right = rel(d, 1)
  const f = fieldsOf(brain)

  // --- what the eyes see ---
  // apple: every LC10 neuron of the eye that sees it responds half, the ones looking right at it respond fully
  let appleL = 0, appleR = 0, bearing = 0
  if (b.apple) {
    const vx = b.apple.x - b.head.x, vy = b.apple.y - b.head.y
    const fwd = vx * DX[d] + vy * DY[d], side = vx * DX[right] + vy * DY[right]
    bearing = Math.atan2(side, fwd) // > 0 = apple to the right
    const I = 1.5 * Math.max(0.35, Math.min(1, 1.2 - Math.hypot(vx, vy) / 20))
    if (bearing < 0.35) appleL = I
    if (bearing > -0.35) appleR = I
  }
  // danger: rays to the left, front-left, front, front-right and right
  const rays = [-2, -1, 0, 1, 2].map(k => {
    const dirX = k === 0 ? DX[d] : k < 0 ? (k === -2 ? DX[left] : DX[d] + DX[left]) : (k === 2 ? DX[right] : DX[d] + DX[right])
    const dirY = k === 0 ? DY[d] : k < 0 ? (k === -2 ? DY[left] : DY[d] + DY[left]) : (k === 2 ? DY[right] : DY[d] + DY[right])
    return { at: (k * Math.PI) / 4, danger: DANGER[freeAlong(b, dirX, dirY)] ?? 0 }
  })
  const dL = rays[0].danger, dF = rays[2].danger, dR = rays[4].danger
  const loomL = Math.max(dL, 0.8 * dF), loomR = Math.max(dR, 0.8 * dF)
  const loomAt = (az: number) => Math.max(...rays.map(r => r.danger * bump(angle(az, r.at))))

  brain.stim.fill(0)
  const g = brain.groups
  g.tL.forEach((i, k) => { brain.stim[i] = appleL * (0.5 + 0.5 * bump(angle(f.tL[k], bearing))) })
  g.tR.forEach((i, k) => { brain.stim[i] = appleR * (0.5 + 0.5 * bump(angle(f.tR[k], bearing))) })
  g.lL.forEach((i, k) => { brain.stim[i] = 0.5 * loomL + 0.5 * loomAt(f.lL[k]) })
  g.lR.forEach((i, k) => { brain.stim[i] = 0.5 * loomR + 0.5 * loomAt(f.lR[k]) })
  for (let s = 0; s < STEPS; s++) brain.step()

  // --- instinct: what the descending neurons say ---
  const steer = brain.act('DNa02_R') + brain.act('DNa01_R') - brain.act('DNa02_L') - brain.act('DNa01_L')
  const gfL = brain.act('DNp01_L'), gfR = brain.act('DNp01_R')
  let instinct: Turn = 0
  let reason: Reason = 'geradeaus'
  if (Math.max(gfL, gfR) > GF_THRESHOLD) { instinct = gfL > gfR ? 1 : -1; reason = 'flucht' }
  else if (Math.abs(steer) > STEER_THRESHOLD) { instinct = steer > 0 ? 1 : -1; reason = 'lenken' }
  let turn = instinct

  // --- learned: the action neurons know better once they have been trained ---
  let q: number[] | null = null
  let body: number[] | null = null
  if (opts.learner) {
    if (opts.learner.m) body = bodySense(b)
    q = opts.learner.observe(brain.r, instinct, body ?? [])
    const best = TURNS[q.indexOf(Math.max(...q))]
    if (best !== instinct) { turn = best; reason = 'gelernt' }
    if (opts.explore && Math.random() < opts.explore) {
      const t = TURNS[(Math.random() * 3) | 0]
      if (t !== turn) { turn = t; reason = 'neugier' }
    }
  }

  // optional reflex guard: never step straight into a wall or the body
  if (opts.schutz && free(b, rel(d, turn)) === 0) {
    const options = TURNS.map(t => ({ t, room: room(b, rel(d, t)) })).filter(o => o.room > 0)
    if (options.length) {
      options.sort((a, c) => c.room - a.room || Math.abs(a.t - turn) - Math.abs(c.t - turn))
      turn = options[0].t; reason = 'schutz'
    }
  }
  opts.learner?.commit(turn)
  return { dir: rel(d, turn), turn, instinct, reason, q, body, steer, gfL, gfR, sees: { appleL, appleR, loomL, loomR } }
}
