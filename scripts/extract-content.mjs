/**
 * Extract main content from course index.html files.
 * Outputs: src/content/<course>.html + src/data/<course>-nav.js
 */
import fs from 'fs'
import path from 'path'

const COURSES = ['probability', 'os', 'algorithm', 'dsp', 'marxism', 'calculus', 'maogai']
const SITE = process.cwd()
const SRC = path.join(SITE, 'src')
const COURSES_DIR = path.join(SITE, 'courses')

fs.mkdirSync(path.join(SRC, 'content'), { recursive: true })
fs.mkdirSync(path.join(SRC, 'data'), { recursive: true })

/**
 * Find matching closing tag by counting nesting depth.
 */
function extractBetween(html, startTag, endPatterns) {
  const startIdx = html.indexOf(startTag)
  if (startIdx < 0) return ''

  let depth = 0
  let i = startIdx
  const tag = startTag.match(/<(\w+)/)[1]

  while (i < html.length) {
    // Check for opening tag
    const openRe = new RegExp(`<${tag}(?:\\s|>)`, 'gi')
    openRe.lastIndex = i
    const openMatch = openRe.exec(html)

    // Check for closing tag
    const closeRe = new RegExp(`</${tag}>`, 'gi')
    closeRe.lastIndex = i
    const closeMatch = closeRe.exec(html)

    if (!closeMatch) break

    if (openMatch && openMatch.index < closeMatch.index) {
      depth++
      i = openMatch.index + openMatch[0].length
    } else {
      if (depth === 0) {
        // Found our matching close tag
        return html.substring(startIdx + startTag.length, closeMatch.index)
      }
      depth--
      i = closeMatch.index + closeMatch[0].length
    }
  }

  // Fallback: extract up to endPatterns
  for (const pat of endPatterns) {
    const idx = html.indexOf(pat, startIdx + startTag.length)
    if (idx > startIdx) {
      return html.substring(startIdx + startTag.length, idx)
    }
  }

  return ''
}

for (const course of COURSES) {
  const htmlPath = path.join(COURSES_DIR, course, 'index.html')
  if (!fs.existsSync(htmlPath)) {
    console.log(`${course}: SKIP (no index.html)`)
    continue
  }

  let html = fs.readFileSync(htmlPath, 'utf8')

  // ── Extract sidebar nav links ──
  const navLinks = []
  // Pattern 1: <a href="#id" onclick="navClick(this)">label</a>
  // Pattern 2: <a href="#id" data-keywords="...">label</a>
  // Pattern 3: <a href="#id">label</a>
  const navRe = /<a\s+href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = navRe.exec(html)) !== null) {
    const id = m[1]
    const inner = m[2]
    // Preserve HTML tags in label (e.g. <span class="tag tag-L">必考</span>)
    const plainLabel = inner.replace(/<[^>]+>/g, '').trim()
    const label = inner.trim()
    // Skip non-nav links (like "返回课程主页")
    if (plainLabel && id && !plainLabel.includes('返回') && plainLabel.length < 50) {
      // Avoid duplicates
      if (!navLinks.find(n => n.id === id)) {
        navLinks.push({ id, label, keywords: '' })
      }
    }
  }

  // ── Extract main content ──
  // Find <div class="main" ...> or <main>
  let content = ''
  const mainTagPatterns = [
    '<div class="main"',
    '<main',
    '<div class="content"',
  ]

  for (const tag of mainTagPatterns) {
    const idx = html.indexOf(tag)
    if (idx >= 0) {
      // Extract full opening tag
      const tagEnd = html.indexOf('>', idx)
      const fullTag = html.substring(idx, tagEnd + 1)

      content = extractBetween(html, fullTag, [
        '<div class="back-top"',
        '<!-- 访问统计 -->',
        '<div style="position:fixed;bottom:12px',
        '</body>',
      ])

      if (content.length > 100) break
    }
  }

  // Clean up
  content = content.replace(/<script[\s\S]*?<\/script>/gi, '')
  content = content.replace(/<!--[\s\S]*?-->/g, '')
  content = content.replace(/<style>@keyframes[\s\S]*?<\/style>/gi, '')
  content = content.replace(/<link\s+rel="stylesheet"[^>]*>/gi, '')
  content = content.replace(/<link\s+rel="manifest"[^>]*>/gi, '')
  content = content.replace(/<meta[^>]*>/gi, '')
  content = content.replace(/<div\s+id="migrateNotice"[\s\S]*?<\/div>\s*/gi, '')
  content = content.replace(/<div\s+id="subGuide"[\s\S]*?<\/div>\s*/gi, '')
  content = content.replace(/<div\s+class="sg-overlay"[\s\S]*?<\/div>\s*/gi, '')
  content = content.replace(/<noscript>[\s\S]*?<\/noscript>/gi, '')
  // Remove nav-toggle button
  content = content.replace(/<button\s+class="nav-toggle"[\s\S]*?<\/button>/gi, '')
  // Remove progress bar
  content = content.replace(/<div\s+class="progress-bar"[\s\S]*?<\/div>\s*/gi, '')
  // Remove back-top button
  content = content.replace(/<div\s+class="back-top"[\s\S]*?<\/div>\s*/gi, '')
  content = content.trim()

  // Write content
  const contentPath = path.join(SRC, 'content', `${course}.html`)
  fs.writeFileSync(contentPath, content, 'utf8')

  // Write nav data
  const navJs = `export const navLinks = ${JSON.stringify(navLinks, null, 2)}\n`
  fs.writeFileSync(path.join(SRC, 'data', `${course}-nav.js`), navJs, 'utf8')

  console.log(`${course}: ${content.length} chars, ${navLinks.length} nav links`)
}
