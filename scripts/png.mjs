import { deflateSync, inflateSync } from "node:zlib"

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/**
 * Minimal PNG writer. `channels` is 1 for greyscale, 3 for RGB; `pixels` is a
 * flat byte array in that order, row-major.
 */
export function encodePng(width, height, channels, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = channels === 1 ? 0 : 2
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    for (let x = 0; x < stride; x++) {
      raw[y * (stride + 1) + 1 + x] = pixels[y * stride + x]
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

/**
 * Minimal PNG reader, the writer's inverse and only as general as the painters
 * need: 8 bits a channel, greyscale or RGB or either with alpha, no interlace.
 * Pixels come back as RGBA whatever went in, because that is the shape a canvas
 * hands back and the Scenario builder reads one layout rather than two.
 *
 * It exists so a Field can be read without a browser. Everything the pixels
 * mean stays in `src/scenario/build.ts`; this only gets the bytes out.
 */
export function decodePng(buffer) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) throw new Error("not a PNG")
  }
  let width = 0
  let height = 0
  let depth = 0
  let colour = 0
  const parts = []
  for (let at = 8; at + 8 <= buffer.length;) {
    const length = buffer.readUInt32BE(at)
    const type = buffer.toString("ascii", at + 4, at + 8)
    const body = buffer.subarray(at + 8, at + 8 + length)
    if (type === "IHDR") {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      depth = body[8]
      colour = body[9]
      if (depth !== 8) throw new Error(`PNG is ${depth} bits a channel; 8 is all this reads`)
      if (body[12] !== 0) throw new Error("interlaced PNG")
    } else if (type === "IDAT") parts.push(Buffer.from(body))
    else if (type === "IEND") break
    at += 12 + length
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colour]
  if (!channels) throw new Error(`PNG colour type ${colour} is not one this reads`)

  const raw = inflateSync(Buffer.concat(parts))
  const stride = width * channels
  const out = new Uint8ClampedArray(width * height * 4)
  let previous = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
    // Undo the per-row filter. The four cases are the format's, not ours.
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0
      const b = previous[x]
      const c = x >= channels ? previous[x - channels] : 0
      if (filter === 1) line[x] = (line[x] + a) & 0xff
      else if (filter === 2) line[x] = (line[x] + b) & 0xff
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 0xff
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
      }
    }
    for (let x = 0; x < width; x++) {
      const from = x * channels
      const to = (y * width + x) * 4
      const grey = channels <= 2
      out[to] = line[from]
      out[to + 1] = grey ? line[from] : line[from + 1]
      out[to + 2] = grey ? line[from] : line[from + 2]
      out[to + 3] = channels === 2 ? line[from + 1] : channels === 4 ? line[from + 3] : 255
    }
    previous = line
  }
  return { width, height, data: out }
}
