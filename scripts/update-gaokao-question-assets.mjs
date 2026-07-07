import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureSchema, pool, query } from '../server/db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const MANIFEST_PATH = path.join(ROOT_DIR, 'src/data/gaokao-question-assets.json')

const args = new Set(process.argv.slice(2))
const shouldWrite = args.has('--write')

function imageKey(image) {
  return [image.hash, image.url, image.mediaPath || '', image.page || ''].join('|')
}

function mergeImages(existingImages, newImages) {
  const merged = Array.isArray(existingImages) ? [...existingImages] : []
  const seen = new Set(merged.map(imageKey))
  for (const image of newImages || []) {
    const key = imageKey(image)
    if (seen.has(key)) continue
    merged.push(image)
    seen.add(key)
  }
  return merged
}

function mergeMetadata(metadata, manifestItem) {
  const current = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  const assets = current.assets && typeof current.assets === 'object' && !Array.isArray(current.assets)
    ? current.assets
    : {}
  return {
    ...current,
    assets: {
      ...assets,
      images: mergeImages(assets.images, manifestItem.images),
      imageUpdatedAt: new Date().toISOString(),
      imageSource: 'src/data/gaokao-question-assets.json',
    },
  }
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'))
  await ensureSchema()

  const stats = {
    manifestQuestions: manifest.questions?.length || 0,
    matched: 0,
    missing: 0,
    changed: 0,
    unchanged: 0,
  }

  for (const item of manifest.questions || []) {
    const { rows } = await query('SELECT metadata FROM gaokao_questions WHERE question_key = $1', [item.questionKey])
    if (rows.length === 0) {
      stats.missing += 1
      continue
    }
    stats.matched += 1
    const nextMetadata = mergeMetadata(rows[0].metadata, item)
    const oldImages = rows[0].metadata?.assets?.images || []
    const newImages = nextMetadata.assets.images || []
    if (newImages.length === oldImages.length) {
      stats.unchanged += 1
      continue
    }
    stats.changed += 1
    if (shouldWrite) {
      await query(
        'UPDATE gaokao_questions SET metadata = $2::jsonb, updated_at = now() WHERE question_key = $1',
        [item.questionKey, JSON.stringify(nextMetadata)],
      )
    }
  }

  console.log(JSON.stringify({ mode: shouldWrite ? 'write' : 'dry-run', ...stats }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
