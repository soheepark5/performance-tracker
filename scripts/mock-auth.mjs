/**
 * A throwaway stand-in for Supabase auth, used only to check the sign-in screens
 * without a real project: `node scripts/mock-auth.mjs 4183`.
 *   POST /auth/v1/otp    -> 200, as if the code was emailed
 *   POST /auth/v1/verify -> 403, so the wrong-code path can be seen too
 */
import { createServer } from 'node:http'

const port = Number(process.argv[2] ?? 4183)

createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json',
  }
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end()

  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    console.log(req.method, req.url, body.slice(0, 120))
    if (req.url?.includes('/auth/v1/otp')) return res.writeHead(200, cors).end('{}')
    if (req.url?.includes('/auth/v1/verify')) {
      return res.writeHead(403, cors).end(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has expired or is invalid' }))
    }
    res.writeHead(200, cors).end('{}')
  })
}).listen(port, () => console.log(`mock auth on http://localhost:${port}`))
