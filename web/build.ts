// Builds the browser version from the same code the desktop version uses:
//   node web/build.ts
// Strips the TypeScript types from snake/{brain,fly,learn,game,panel}.ts into web/core/*.js and copies the brain
// (network.json) and the trained fly (gedaechtnis.json) into web/data/. No bundler needed.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

process.removeAllListeners('warning') // stripTypeScriptTypes is still marked experimental

const src = new URL('../snake/', import.meta.url)
const web = new URL('./', import.meta.url)
mkdirSync(new URL('core/', web), { recursive: true })
mkdirSync(new URL('data/', web), { recursive: true })

for (const name of ['brain', 'fly', 'learn', 'game', 'panel']) {
  const ts = readFileSync(new URL(`${name}.ts`, src), 'utf8')
  const js = stripTypeScriptTypes(ts)
    .replace(/from '\.\/(\w+)\.ts'/g, "from './$1.js'")
    .replace(/^import\s*\{\s*\}\s*from\s*'[^']+'\s*;?\s*$/gm, '')
  writeFileSync(new URL(`core/${name}.js`, web), `// generated from snake/${name}.ts by web/build.ts - edit the .ts file instead\n${js}`)
  console.log(`core/${name}.js`)
}

copyFileSync(new URL('network.json', src), new URL('data/network.json', web))
console.log('data/network.json')
if (existsSync(new URL('gedaechtnis.json', src))) {
  copyFileSync(new URL('gedaechtnis.json', src), new URL('data/fliege.json', web))
  console.log('data/fliege.json (trainierte Fliege)')
}
