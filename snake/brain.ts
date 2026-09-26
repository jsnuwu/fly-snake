// Rate-model simulation of the connectome sub-circuit (800 eye neurons, 4000 interneurons, 12 descending neurons).
// Runs in Node and in the browser; network.json is loaded by the caller.

export interface NeuronInfo { id: number; type: string; side: string; nt: string; cls: string; role: string; pos?: [number, number] }
export interface NetJSON { neurons: NeuronInfo[]; edges: [number, number, number][] }

const G = 2.0          // global synaptic gain
const DT_TAU = 0.5     // Euler step / membrane time constant

export class Brain {
  readonly N: number
  readonly M: number
  readonly neurons: NeuronInfo[]
  private readonly pre: Int32Array
  private readonly w: Float32Array
  private readonly rowStart: Int32Array
  private readonly acc: Float32Array
  private readonly v: Float32Array
  readonly r: Float32Array
  readonly stim: Float32Array
  readonly groups: Record<'tL' | 'tR' | 'lL' | 'lR' | 'hidden', number[]>
  readonly out: Record<string, number[]>

  constructor(net: NetJSON) {
    this.neurons = net.neurons
    const N = (this.N = net.neurons.length)
    const order = net.edges.map((_, i) => i).sort((a, b) => net.edges[a][1] - net.edges[b][1])
    this.M = order.length
    this.pre = new Int32Array(this.M)
    this.w = new Float32Array(this.M)
    this.rowStart = new Int32Array(N + 1)
    order.forEach((e, k) => {
      const [p, q, w] = net.edges[e]
      this.pre[k] = p; this.w[k] = w; this.rowStart[q + 1]++
    })
    for (let j = 0; j < N; j++) this.rowStart[j + 1] += this.rowStart[j]
    this.acc = new Float32Array(N)
    this.v = new Float32Array(N)
    this.r = new Float32Array(N)
    this.stim = new Float32Array(N)

    const where = (f: (n: NeuronInfo) => boolean) => net.neurons.flatMap((n, i) => (f(n) ? [i] : []))
    this.groups = {
      tL: where(n => n.role === 'in:target' && n.side === 'L'),
      tR: where(n => n.role === 'in:target' && n.side === 'R'),
      lL: where(n => n.role === 'in:loom' && n.side === 'L'),
      lR: where(n => n.role === 'in:loom' && n.side === 'R'),
      hidden: where(n => n.role === 'hidden'),
    }
    this.out = {}
    net.neurons.forEach((n, i) => {
      if (n.role.startsWith('out')) (this.out[`${n.type}_${n.side}`] ??= []).push(i)
    })
  }

  /** mean activity of a named descending-neuron type, e.g. "DNa02_R" */
  act(name: string): number {
    const l = this.out[name]
    if (!l) return 0
    let s = 0
    for (const i of l) s += this.r[i]
    return s / l.length
  }

  step(): void {
    const { N, rowStart, pre, w, r, v, acc, stim } = this
    for (let j = 0; j < N; j++) {
      let a = 0
      for (let k = rowStart[j], e = rowStart[j + 1]; k < e; k++) a += w[k] * r[pre[k]]
      acc[j] = a
    }
    for (let j = 0; j < N; j++) {
      const x = v[j] + DT_TAU * (-v[j] + G * acc[j] + stim[j])
      v[j] = x
      const t = Math.tanh(x)
      r[j] = t > 0 ? t : 0
    }
  }

  reset(): void {
    this.v.fill(0); this.r.fill(0); this.stim.fill(0)
  }
}
