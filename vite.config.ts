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

/*
 * Credentials from `env.txt`, as an alternative to `.env`.
 *
 * Windows Explorer refuses to create a file whose name begins with a dot, which
 * makes `.env` awkward to produce without a terminal or a code editor. So a
 * plain `env.txt` is accepted with the same contents. `.env` still wins when
 * both exist, and env.txt is gitignored exactly like `.env` — it holds the same
 * secrets and must never be committed.
 */
function loadExplorerFriendlyEnv(): void {
  if (existsSync('.env') || !existsSync('env.txt')) return
  for (const line of readFileSync('env.txt', 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    const [, key, rawValue] = match
    if (!key.startsWith('VITE_')) continue
    const value = rawValue.trim().replace(/^['"]|['"]$/g, '')
    // An untouched template is not configuration. Treating it as one would put a
    // sign-in screen in front of a project that does not exist, with no way past
    // it; leaving it unset keeps the app local-first until real values arrive.
    if (!value || value.includes('your-project-ref') || value.includes('your-anon-key')) continue
    // Into process.env rather than `define`: Vite exposes prefixed process.env
    // vars through import.meta.env in BOTH dev and build, whereas a `define` for
    // import.meta.env is ignored by the dev server.
    process.env[key] = value
  }
}

loadExplorerFriendlyEnv()

// `--mode single` produces one self-contained dist/index.html (easy to host anywhere / open on a phone).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  define: { __SHARED_RECORD__: shared },
  build: { target: 'es2020', outDir: mode === 'single' ? 'dist-single' : 'dist' },
}))
