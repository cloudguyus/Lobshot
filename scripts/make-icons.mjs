import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const table = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  table[n] = c >>> 0
}

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const name = Buffer.from(type)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, crc])
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function set(data, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return
  const i = (y * size + x) * 4
  const a = color[3] / 255
  const inv = 1 - a
  data[i] = color[0] * a + data[i] * inv
  data[i + 1] = color[1] * a + data[i + 1] * inv
  data[i + 2] = color[2] * a + data[i + 2] * inv
  data[i + 3] = Math.min(255, data[i + 3] + color[3] * (1 - data[i + 3] / 255))
}

function fill(data, size, color) {
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = color[0]
    data[i * 4 + 1] = color[1]
    data[i * 4 + 2] = color[2]
    data[i * 4 + 3] = 255
  }
}

function circle(data, size, cx, cy, r, color) {
  const r2 = r * r
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      if (dx * dx + dy * dy <= r2) set(data, size, x, y, color)
    }
  }
}

function rotatedRect(data, size, cx, cy, hw, hh, angle, color) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const reach = Math.hypot(hw, hh) + 1
  for (let y = Math.floor(cy - reach); y <= Math.ceil(cy + reach); y++) {
    for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const lx = dx * c + dy * s
      const ly = -dx * s + dy * c
      if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) set(data, size, x, y, color)
    }
  }
}

function draw(size) {
  const data = Buffer.alloc(size * size * 4)
  const night = [27, 36, 56, 255]
  const cream = [244, 236, 223, 255]
  const brass = [226, 166, 59, 255]
  const clay = [224, 122, 69, 255]
  const wood = [107, 66, 44, 255]
  fill(data, size, night)
  const u = size / 64
  circle(data, size, 32 * u, 34 * u, 22 * u, cream)
  rotatedRect(data, size, 30 * u, 36 * u, 16 * u, 3.2 * u, -0.55, brass)
  circle(data, size, 44 * u, 22 * u, 4.2 * u, clay)
  rotatedRect(data, size, 26 * u, 44 * u, 8 * u, 2.4 * u, 0, wood)
  circle(data, size, 18 * u, 44 * u, 4 * u, wood)
  return png(size, data)
}

mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true })
writeFileSync(new URL('../public/icons/icon-192.png', import.meta.url), draw(192))
writeFileSync(new URL('../public/icons/icon-512.png', import.meta.url), draw(512))
writeFileSync(new URL('../public/icons/apple-touch-icon.png', import.meta.url), draw(180))
console.log('Wrote icons')
