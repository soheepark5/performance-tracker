/**
 * Turns an export into a publishable read-only copy.
 *
 *   node scripts/make-share.mjs ~/Downloads/capacity-2026-09-05.json
 *
 * Copies the export to share-data.json (which the build bakes in) and then
 * builds into dist-share/. Deploy that folder and anyone with the link sees the
 * record, read-only, with no sign-in.
 *
 * Nothing is filtered on the way through: whatever is in the export — notes,
 * stress events, impulses — is what visitors read. Trim the file first if some
 * of it should stay private.
 */
import { copyFileSync, existsSync, rmSync, renameSync } from 'node:fs'
import { execSync } from 'node:child_process'

const src = process.argv[2]
if (!src || !existsSync(src)) {
  console.error('Usage: node scripts/make-share.mjs <path-to-export.json>')
  process.exit(1)
}

copyFileSync(src, 'share-data.json')
console.log('baking in', src)
try {
  execSync('npm run build', { stdio: 'inherit' })
  rmSync('dist-share', { recursive: true, force: true })
  renameSync('dist', 'dist-share')
  console.log('\nread-only copy built in dist-share/ — deploy that folder')
} finally {
  // never leave the shared record lying around to be baked into a normal build
  rmSync('share-data.json', { force: true })
}
