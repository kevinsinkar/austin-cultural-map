import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Private datasets: [alias, private file, public stand-in].
// The app imports the alias. Only `--mode presenter` (npm run present)
// resolves it to the private file; every other mode — including the
// GitHub Pages build — gets the stand-in, so private rows never reach a
// public bundle. Private files live in the git-ignored private/ folder.
// Add future private data (e.g. Homes Tour addresses) here.
const PRIVATE_DATA = [
  ['@private/outreach-events', './private/outreach_events.json', './data/outreach_events.public.json'],
]

const abs = (rel) => fileURLToPath(new URL(rel, import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const presenter = mode === 'presenter'
  const alias = {}
  for (const [name, privateFile, publicFile] of PRIVATE_DATA) {
    const usePrivate = presenter && existsSync(abs(privateFile))
    if (presenter && !usePrivate) {
      console.warn(`[presenter] ${privateFile} not found — using the empty public stand-in.`)
    }
    alias[name] = abs(usePrivate ? privateFile : publicFile)
  }
  return {
    plugins: [react()],
    base: '/austin-cultural-map/',
    resolve: { alias },
  }
})
