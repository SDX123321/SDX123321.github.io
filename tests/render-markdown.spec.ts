// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/lib/renderMarkdown'

describe('renderMarkdown', () => {
  it('renders markdown and inline/display LaTeX while removing scripts', () => {
    const html = renderMarkdown('## 结论\n\n行内 $x^2$，以及：\n\n$$f(x)=x+1$$\n\n<script>alert(1)</script>')

    expect(html).toContain('<h2>结论</h2>')
    expect(html).toContain('class="katex"')
    expect(html).toContain('class="katex-display"')
    expect(html).not.toContain('<script>')
  })

  it('turns valid source markers into accessible preview buttons', () => {
    const html = renderMarkdown('依据资料 [s1]，但 [S3] 不存在。', 2)

    expect(html).toContain('class="hs-inline-citation"')
    expect(html).toContain('data-source-index="0"')
    expect(html).toContain('aria-label="预览引用 S1"')
    expect(html).toContain('[S3]')
  })
})
