import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({
  breaks: true,
  gfm: true,
})

let katexPromise: Promise<typeof import('katex')> | null = null

async function loadKatex() {
  katexPromise ??= import('katex')
  await import('katex/dist/katex.min.css')
  return (await katexPromise).default
}

const MATH_PATTERN = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\(.+?\\\)|(^|[^\\$])\$[^\n$]+?\$/

export async function renderMarkdown(source: string, citationCount = 0): Promise<string> {
  if (!source) return ''
  const katex = MATH_PATTERN.test(source) ? await loadKatex() : null
  const formulas: string[] = []
  const citations: string[] = []
  const stash = (formula: string, displayMode: boolean) => {
    const index = formulas.push(
      katex
        ? katex.renderToString(formula.trim(), {
            displayMode,
            throwOnError: false,
            strict: false,
            trust: false,
          })
        : formula.trim(),
    )
    return `MATHPLACEHOLDER${index - 1}END`
  }
  const protectedCitations = source.replace(/\[s(\d+)\]/gi, (label, number: string) => {
    const index = Number(number) - 1
    if (index < 0 || index >= citationCount) return label.toUpperCase()
    const placeholderIndex = citations.push(
      `<button type="button" class="hs-inline-citation" data-source-index="${index}" aria-label="预览引用 S${number}">[S${number}]</button>`,
    )
    return `CITATIONPLACEHOLDER${placeholderIndex - 1}END`
  })
  const protectedMath = protectedCitations
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, formula: string) => stash(formula, true))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, formula: string) => stash(formula, true))
    .replace(/\\\((.+?)\\\)/g, (_, formula: string) => stash(formula, false))
    .replace(
      /(^|[^\\$])\$([^\n$]+?)\$/g,
      (_, prefix: string, formula: string) => `${prefix}${stash(formula, false)}`,
    )
  let html = String(marked.parse(protectedMath))
  formulas.forEach((formula, index) => {
    html = html.replaceAll(`MATHPLACEHOLDER${index}END`, formula)
  })
  citations.forEach((citation, index) => {
    html = html.replaceAll(`CITATIONPLACEHOLDER${index}END`, citation)
  })
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['aria-hidden', 'data-source-index'],
  })
}
