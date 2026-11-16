import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

// Raster fallbacks use the approved compact mark, not the large strand artwork.
const source = 'public/assets/brand/patrick/favicon.svg'
const original = await readFile(source)
const files = []
const pngs = new Map()
const save = async (path, bytes, dimensions) => {
  await writeFile(`public${path}`, bytes)
  files.push({ path, ...dimensions, sha256: createHash('sha256').update(bytes).digest('hex') })
}
for (const size of [16, 32, 48, 96, 192, 512]) {
  let image = sharp(original).resize(size, size)
  if (size >= 192) image = image.flatten({ background: '#e9eff2' })
  const bytes = await image.png().toBuffer()
  pngs.set(size, bytes)
  await save(`/favicon-${size}x${size}.png`, bytes, { width: size, height: size })
}
// ICO directory plus PNG frames, supported by modern ICO readers.
const sizes = [16, 32, 48]
const header = Buffer.alloc(6 + 16 * sizes.length)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16
  const bytes = pngs.get(size)
  header[entry] = header[entry + 1] = size
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(bytes.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += bytes.length
}
await save('/favicon.ico', Buffer.concat([header, ...sizes.map(size => pngs.get(size))]), { sizes })
await save('/favicon.svg', original, { width: 512, height: 512 })
await save('/apple-touch-icon.png', await readFile('public/assets/brand/patrick/apple-touch-icon.png'), { width: 180, height: 180 })
await writeFile('src/content/site-icons.json', JSON.stringify({
  source, sourceSha256: createHash('sha256').update(original).digest('hex'),
  generator: 'scripts/generate-site-icons.mjs',
  note: 'Site-owned format derivatives of the approved compact PF mark; original brand assets remain unchanged.',
  files,
}, null, 2) + '\n')
console.log(`Generated ${files.length} icon assets from the approved compact PF artwork.`)
