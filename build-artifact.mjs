// Turns the single-file build into a page the claude.ai Artifact host can wrap:
// no <!doctype>/<html>/<head>/<body> of our own, styles first, script last.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const src = readFileSync('dist-single/index.html', 'utf8')
const head = src.slice(src.indexOf('<head>') + 6, src.indexOf('</head>'))
const body = src.slice(src.indexOf('<body>') + 6, src.indexOf('</body>'))
const pick = (re, s) => (s.match(re) ?? []).join('')
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/g, head)
// Google Fonts is the one external stylesheet host the Artifact CSP admits.
const fonts = pick(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g, head)
const scripts = pick(/<script[^>]*>[\s\S]*?<\/script>/g, head + body)
const markup = body.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').trim()

mkdirSync('artifact', { recursive: true })
writeFileSync('artifact/capacity.html', `<title>Capacity</title>\n${fonts}\n${styles}\n${markup}\n${scripts}\n`)
console.log('artifact/capacity.html written')
