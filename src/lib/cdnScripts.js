/**
 * Dynamic CDN script loader for math rendering libraries.
 * Loads KaTeX (probability, algorithm) and MathJax (DSP) on demand.
 */

const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css'
const KATEX_JS = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js'
const KATEX_AUTO = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js'
const MATHJAX_CONFIG = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js'

let katexLoaded = false
let mathjaxLoaded = false

export function loadKaTeX() {
  if (katexLoaded) return Promise.resolve()
  katexLoaded = true

  return new Promise((resolve) => {
    // Load CSS
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = KATEX_CSS
    document.head.appendChild(link)

    // Load KaTeX core
    const script1 = document.createElement('script')
    script1.src = KATEX_JS
    script1.onload = () => {
      // Load auto-render
      const script2 = document.createElement('script')
      script2.src = KATEX_AUTO
      script2.onload = resolve
      script2.onerror = resolve
      document.head.appendChild(script2)
    }
    script1.onerror = resolve
    document.head.appendChild(script1)
  })
}

export function loadMathJax() {
  if (mathjaxLoaded) return Promise.resolve()
  mathjaxLoaded = true

  return new Promise((resolve) => {
    // Configure MathJax before loading
    window.MathJax = {
      tex: {
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']],
      },
      svg: { fontCache: 'global' },
    }

    const script = document.createElement('script')
    script.src = MATHJAX_CONFIG
    script.async = true
    script.onload = resolve
    script.onerror = resolve
    document.head.appendChild(script)
  })
}

export function loadBusuanzi() {
  if (document.getElementById('busuanzi_script')) return
  const script = document.createElement('script')
  script.id = 'busuanzi_script'
  script.src = '//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js'
  script.async = true
  document.body.appendChild(script)
}
