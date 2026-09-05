import { readFileSync, existsSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

/*
 * A published read-only copy.
 *
 * Drop an export (Data -> Backup -> Export file) in the project root as
 * `share-data.json` and the next build bakes it in: that build opens as a
 * read-only view of that record for anyone who has the link, with every
 * logging control gone and nothing written to their browser. Without the file
 * the build is the ordinary app.
 */
const sharedPath = 'share-data.json'
const shared = existsSync(sharedPath) ? readFileSync(sharedPath, 'utf8') : 'null'

// `--mode single` produces one self-contained dist/index.html (easy to host anywhere / open on a phone).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  define: { __SHARED_RECORD__: shared },
  build: { target: 'es2020', outDir: mode === 'single' ? 'dist-single' : 'dist' },
}))
