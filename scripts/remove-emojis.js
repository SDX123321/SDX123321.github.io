import fs from 'fs'

function replaceInFile(filepath, replacements) {
  if (!fs.existsSync(filepath)) return
  let content = fs.readFileSync(filepath, 'utf8')
  let original = content
  for (const [from, to] of replacements) {
    content = content.replaceAll(from, to)
  }
  if (content !== original) {
    fs.writeFileSync(filepath, content, 'utf8')
    console.log('Updated ' + filepath)
  }
}

;[
  'courses/calculus/index.html',
  'courses/marxism/index.html',
  'courses/marxism/v1.html',
  'courses/os/index.html',
].forEach((f) => {
  replaceInFile(f, [['☰', '']])
})

;['src/content/dsp.html', 'courses/dsp/index.html'].forEach((f) => {
  replaceInFile(f, [
    ['$ ✓', '$'],
    ['较小 ✓', '较小'],
    ['衰减到 0 ✓', '衰减到 0'],
    ['） ✓', '）'],
  ])
})
