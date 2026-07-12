import { describe, expect, it } from 'vitest'
import path from 'node:path'
import {
  DOMAIN_CLEANUP_SQL,
  classify,
  chunks,
  command,
  extractText,
  materialPaths,
  needsTextExtraction,
  parseArgs,
} from '../scripts/index-high-school-materials.mjs'

describe('high-school material indexer', () => {
  it('classifies grade, subject, region and answer type from Chinese paths', () => {
    expect(
      classify('776、苏教版试卷/江苏省高二试卷/2023-2024/南京数学期末答案.docx', '.docx'),
    ).toEqual({
      grade: 'grade-2',
      subject: 'math',
      year: 2024,
      region: '南京',
      kind: 'answer',
    })
  })

  it('keeps audio downloadable but out of text extraction', () => {
    expect(classify('江苏省高一试卷/英语听力.mp3', '.mp3')).toMatchObject({
      grade: 'grade-1',
      subject: 'english',
      kind: 'audio',
    })
  })

  it('prefers the file year and city over collection folder labels', () => {
    expect(
      classify('2026高考试卷/全国合集1990-2025/2010年高考化学试卷（北京）.doc', '.doc'),
    ).toMatchObject({ year: 2010, region: '北京' })
    expect(classify('江苏省高一试卷/2022-2023/南京市期末数学试卷.docx', '.docx')).toMatchObject({
      year: 2023,
      region: '南京',
    })
  })

  it('creates overlapping chunks without an empty tail', () => {
    const result = chunks('甲'.repeat(2200), 1000, 150)
    expect(result).toHaveLength(3)
    expect(result[0]).toHaveLength(1000)
    expect(result[1]).toHaveLength(1000)
    expect(result[2].length).toBeGreaterThan(0)
  })

  it('parses safe preview flags', () => {
    expect(parseArgs(['--dry-run', '--limit', '10'])).toMatchObject({ dryRun: true, limit: 10 })
    expect(parseArgs(['--file', 'C:\\materials\\paper.pdf'])).toMatchObject({
      file: 'C:\\materials\\paper.pdf',
    })
    expect(parseArgs(['--domain', 'university', '--course', 'calculus', '--subject', 'math'])).toMatchObject({
      domain: 'university', course: 'calculus', subject: 'math',
    })
  })

  it('treats university html as extractable content', async () => {
    const text = await extractText(path.resolve('src/content/calculus.html'), '.html', '')
    expect(text.length).toBeGreaterThan(100)
    expect(text).not.toContain('<section')
  })

  it('separates domain identity from the physical storage path', () => {
    expect(materialPaths('high-school', 'math/paper.pdf')).toEqual({
      identityPath: 'high-school/math/paper.pdf',
      storagePath: 'math/paper.pdf',
    })
  })

  it('limits stale-path cleanup to the current domain', () => {
    expect(DOMAIN_CLEANUP_SQL).toContain('m.domain_id=$2')
    expect(DOMAIN_CLEANUP_SQL).toContain('p.material_id=m.id')
  })

  it('does not re-extract settled files and only retries failed files on request', () => {
    expect(
      needsTextExtraction({
        ext: '.docx',
        catalogOnly: false,
        unchanged: true,
        retryFailed: true,
        status: 'indexed',
      }),
    ).toBe(false)
    expect(
      needsTextExtraction({
        ext: '.pdf',
        catalogOnly: false,
        unchanged: true,
        retryFailed: false,
        status: 'failed',
      }),
    ).toBe(false)
    expect(
      needsTextExtraction({
        ext: '.pdf',
        catalogOnly: false,
        unchanged: true,
        retryFailed: true,
        status: 'failed',
      }),
    ).toBe(true)
  })

  it('terminates a conversion command that exceeds its timeout', async () => {
    await expect(
      command(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 100 }),
    ).rejects.toThrow('timed out after 100ms')
  })
})
