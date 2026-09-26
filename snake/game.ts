// A Snake clone with the same 17x15 field as Google Snake - for training (train.ts) and for the web version.
import type { Brain } from './brain.ts'
import { decide, DX, DY, type Board, type Decision, type Dir } from './fly.ts'
import { REWARD, type Learner } from './learn.ts'

export const HUNGER = 300 // moves without an apple before a game counts as lost (going in circles)

export type Outcome = 'moved' | 'apple' | 'crash' | 'hunger'

export class SnakeGame {
  readonly w = 17
  readonly h = 15
  snake: [number, number][] = [[4, 7], [3, 7], [2, 7], [1, 7]]
  dir: Dir = 1
  apple = { x: 12, y: 7 }
  apples = 0
  hunger = 0

  board(): Board {
    const tail = this.snake[this.snake.length - 1]
    return {
      w: this.w, h: this.h, dir: this.dir, apple: this.apple,
      body: new Set(this.snake.map(([x, y]) => y * this.w + x)),
      head: { x: this.snake[0][0], y: this.snake[0][1] },
      tail: { x: tail[0], y: tail[1] }, length: this.snake.length,
    }
  }

  move(dir: Dir): Outcome {
    const nx = this.snake[0][0] + DX[dir], ny = this.snake[0][1] + DY[dir]
    const eats = nx === this.apple.x && ny === this.apple.y
    const body = eats ? this.snake : this.snake.slice(0, -1)
    if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h || body.some(([x, y]) => x === nx && y === ny)) return 'crash'
    this.snake = [[nx, ny], ...body]
    this.dir = dir
    if (eats) {
      this.apples++
      this.hunger = 0
      if (this.snake.length < this.w * this.h) this.apple = this.freeCell()
      return 'apple'
    }
    return ++this.hunger > HUNGER ? 'hunger' : 'moved'
  }

  private freeCell() {
    for (;;) {
      const a = { x: (Math.random() * this.w) | 0, y: (Math.random() * this.h) | 0 }
      if (!this.snake.some(([x, y]) => x === a.x && y === a.y)) return a
    }
  }
}

/** one move: the fly decides, the snake moves, dopamine learns from what happened */
export function tick(brain: Brain, game: SnakeGame, opts: { schutz: boolean; learner?: Learner; explore?: number }): { decision: Decision; outcome: Outcome } {
  const decision = decide(brain, game.board(), opts)
  const outcome = game.move(decision.dir)
  const l = opts.learner
  if (l) {
    if (outcome === 'crash' || outcome === 'hunger') l.end(REWARD.crash) // going in circles counts as losing
    else {
      l.give(REWARD.step)
      if (outcome === 'apple') l.give(REWARD.apple)
    }
  }
  return { decision, outcome }
}
