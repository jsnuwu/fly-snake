// How do the steering and escape neurons respond to typical Snake situations?  node probe.ts
import { loadBrain } from './files.ts'

const brain = loadBrain()
const cases: [string, number, number, number, number][] = [
  // name, appleL, appleR, loomL, loomR
  ['nichts', 0, 0, 0, 0],
  ['Apfel geradeaus', 1.2, 1.2, 0, 0],
  ['Apfel links', 1.2, 0, 0, 0],
  ['Apfel rechts', 0, 1.2, 0, 0],
  ['Wand links (nah)', 0, 0, 2, 0],
  ['Wand rechts (nah)', 0, 0, 0, 2],
  ['Wand vorne (nah)', 0, 0, 1.6, 1.6],
  ['Wand links (mittel)', 0, 0, 1, 0],
  ['Wand links (fern)', 0, 0, 0.4, 0],
  ['Apfel links + Wand rechts', 1.2, 0, 0, 2],
]
for (const [name, aL, aR, lL, lR] of cases) {
  brain.reset()
  brain.stim.fill(0)
  for (const i of brain.groups.tL) brain.stim[i] = aL
  for (const i of brain.groups.tR) brain.stim[i] = aR
  for (const i of brain.groups.lL) brain.stim[i] = lL
  for (const i of brain.groups.lR) brain.stim[i] = lR
  for (let s = 0; s < 8; s++) brain.step()
  const steer = brain.act('DNa02_R') + brain.act('DNa01_R') - brain.act('DNa02_L') - brain.act('DNa01_L')
  console.log(`${name.padEnd(28)} steer ${steer.toFixed(4).padStart(8)}  GF L ${brain.act('DNp01_L').toFixed(2)} R ${brain.act('DNp01_R').toFixed(2)}`)
}
