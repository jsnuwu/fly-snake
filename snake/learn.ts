// Dopamine learning on top of the fixed connectome, modelled on the fly's mushroom body.
//
// 1. Sparse memory code (Kenyon cells): of the 4,812 simulated neurons, only the ~100 that are most unusually active
//    right now take part in learning (in a real fly the APL neuron silences all but a few percent of the Kenyon cells).
//    Different situations light up different small groups, so what is learned for one situation does not wash out
//    what was learned for another.
// 2. Body sense: the fly also feels how long its body is, where the tail is and whether a move would lead into a
//    space that is too small for its body. It is not told what to do with this - it has to learn it.
// 3. Action neurons (mushroom-body output neurons): one each for turn left / go straight / turn right. Their activity is
//    the fly's guess of how good each action is.
// 4. Dopamine carries the surprise (reward prediction error): an apple is better than expected -> the synapses that were
//    active get stronger; a crash is worse than expected -> they get weaker. Synapses that were active a few steps
//    earlier still carry a fading trace, so a crash also teaches the moves that led into the trap.
// The wiring of the connectome itself never changes. Instinct (what the descending neurons want) counts as a head
// start, so a fresh fly plays like the pure connectome.
export const TURNS = [-1, 0, 1] as const
export type Turn = (typeof TURNS)[number]

const GAMMA = 0.9     // how far the fly looks ahead (future reward counts 90% per step)
const ETA = 0.2       // learning rate (normalized per activity pattern)
const LAMBDA = 0.5    // how long the trace of an active synapse lasts
const INSTINCT = 0.3  // head start for what the descending neurons want
const K = 100         // neurons in the sparse code
export const BODY_FEATURES = 20

export const REWARD = { apple: 1, crash: -1, step: -0.005 }

export class Learner {
  readonly n: number       // neurons
  readonly m: number       // body-sense inputs
  readonly w: Float32Array // 3 x (n + m + 1): neurons, body sense, bias
  private readonly trace: Float32Array
  private readonly d: number
  games = 0
  history: number[] = []   // apples per game over all sessions
  dopamine = 0             // last prediction error
  frozen = false           // play with what was learned, but learn nothing new
  active: number[] = []    // neurons in the current sparse code (for the panel)
  private mean: Float32Array
  private varr: Float32Array
  private seen = 0
  private phi: Float32Array | null = null
  private q: number[] = [0, 0, 0]
  private a = -1
  private reward = 0

  constructor(n: number, m = BODY_FEATURES) {
    this.n = n; this.m = m; this.d = n + m + 1
    this.w = new Float32Array(3 * this.d)
    this.trace = new Float32Array(3 * this.d)
    this.mean = new Float32Array(n)
    this.varr = new Float32Array(n).fill(0.01)
  }

  /** sparse code: the K neurons that are most active compared to how active they usually are */
  private encode(r: Float32Array, body: number[]): Float32Array {
    const { n, m, mean, varr } = this
    const phi = new Float32Array(this.d)
    const rate = Math.max(0.0005, 1 / ++this.seen)
    const z = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const dv = r[i] - mean[i]
      mean[i] += rate * dv
      varr[i] += rate * (dv * dv - varr[i])
      z[i] = dv / Math.sqrt(varr[i] + 1e-4)
    }
    const th = Float32Array.from(z).sort()[n - K]
    this.active = []
    for (let i = 0; i < n; i++) if (z[i] >= th) { phi[i] = 1; this.active.push(i) }
    for (let j = 0; j < m; j++) phi[n + j] = body[j] ?? 0
    phi[n + m] = 1
    return phi
  }

  /** value of each turn for the current brain state; learns from the previous step while at it */
  observe(r: Float32Array, instinct: Turn, body: number[] = []): number[] {
    const phi = this.encode(r, body), d = this.d
    const q = TURNS.map((t, a) => {
      let s = t === instinct ? INSTINCT : 0
      for (let i = 0, o = a * d; i < d; i++) if (phi[i]) s += this.w[o + i] * phi[i]
      return s
    })
    this.learn(this.reward + GAMMA * Math.max(...q))
    this.phi = phi; this.q = q; this.a = -1; this.reward = 0
    return q
  }

  /** the turn that was actually made (after reflexes) */
  commit(turn: Turn) { this.a = TURNS.indexOf(turn) }

  give(x: number) { this.reward += x }

  /** game over: the last move gets the final reward, nothing follows */
  end(x: number) {
    this.learn(this.reward + x)
    this.phi = null; this.a = -1; this.reward = 0
    this.trace.fill(0)
  }

  private learn(target: number) {
    const { phi, a, d, w, trace } = this
    if (!phi || a < 0) return
    const delta = target - this.q[a]
    this.dopamine = delta
    if (this.frozen) return
    let norm = 0
    for (let i = 0; i < d; i++) norm += phi[i] * phi[i]
    const k = (ETA * delta) / norm
    const decay = GAMMA * LAMBDA
    for (let j = 0; j < trace.length; j++) trace[j] *= decay
    for (let i = 0, o = a * d; i < d; i++) trace[o + i] += phi[i]
    for (let j = 0; j < trace.length; j++) w[j] += k * trace[j]
  }

  /** after a game: count it and remember the score */
  record(apples: number) {
    this.games++
    this.history.push(apples)
  }

  toJSON(): Memory {
    return {
      n: this.n, m: this.m, games: this.games, history: this.history, seen: this.seen,
      w: toB64(this.w), mean: toB64(this.mean), var: toB64(this.varr),
    }
  }

  /** a learner from saved memory, or a fresh one if the memory does not fit this brain */
  static fromJSON(data: Memory | null | undefined, n: number): Learner {
    if (!data || data.n !== n) return new Learner(n)
    const l = new Learner(n, data.m ?? 0)
    if (fromB64(data.w).length !== l.w.length) return new Learner(n)
    l.w.set(fromB64(data.w))
    if (data.mean && data.var) { l.mean = fromB64(data.mean); l.varr = fromB64(data.var); l.seen = data.seen ?? 0 }
    l.games = data.games
    l.history = data.history
    return l
  }
}

export interface Memory {
  n: number; m?: number; games: number; history: number[]; seen?: number
  w: string; mean?: string; var?: string // Float32Arrays as base64
}

function toB64(a: Float32Array) {
  const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromB64(s: string) {
  const b = atob(s), u = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i)
  return new Float32Array(u.buffer)
}
