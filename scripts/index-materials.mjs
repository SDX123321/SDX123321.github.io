import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { main } from './index-high-school-materials.mjs'

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
