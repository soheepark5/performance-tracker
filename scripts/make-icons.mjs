/**
 * Generates the home-screen icons from code — no binary assets to keep in sync
 * with the palette. Run `npm run icons` after changing the accent colour.
 *
 * The mark is the app's ◎: a green ring with a filled centre on the near-black
 * ground, drawn as a signed-distance field so the edges stay smooth at every size.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const BG = [0x07, 0x09, 0x08]
const FG = [0x35, 0xe0, 0x8b]

/* ------------------------------------------------------------------- png */

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, rgb) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  const raw = Buffer.alloc(size * (size * 3 + 1))
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1)
    raw[row] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = rgb(x, y)
      const i = row + 1 + x * 3
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------------------------------------------ mark */

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const clamp01 = (v) => Math.max(0, Math.min(1, v))
/** coverage of a shape whose signed distance is `d` (negative = inside) */
const cover = (d, aa) => clamp01(0.5 - d / aa)

/**
 * @param {number} size    pixel size
 * @param {number} scale   how much of the canvas the mark occupies (maskable icons
 *                         keep the mark inside the 80% safe zone)
 */
function icon(size, scale) {
  const c = size / 2
  const aa = size / 256 // one device pixel at the reference size
  const ringR = size * 0.30 * scale
  const ringW = size * 0.070 * scale
  const dotR = size * 0.105 * scale

  return encodePng(size, (x, y) => {
    const dx = x + 0.5 - c
    const dy = y + 0.5 - c
    const r = Math.hypot(dx, dy)
    // ring: distance to the circle's stroke; dot: distance to the filled centre
    const ring = Math.abs(r - ringR) - ringW / 2
    const dot = r - dotR
    const a = Math.max(cover(ring, aa * 1.5), cover(dot, aa * 1.5))
    return mix(BG, FG, a)
  })
}

mkdirSync('public', { recursive: true })
writeFileSync('public/icon-192.png', icon(192, 1))
writeFileSync('public/icon-512.png', icon(512, 1))
writeFileSync('public/icon-maskable-512.png', icon(512, 0.72))
writeFileSync('public/apple-touch-icon.png', icon(180, 1))
console.log('icons written to public/')
