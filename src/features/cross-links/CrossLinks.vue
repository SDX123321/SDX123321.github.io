<script setup lang="ts">
/**
 * CrossLinks — 替代 React 的 features/cross-links/CrossLinks.jsx
 * 扫描正文关键词并注入跨学科知识点链接气泡。
 */
import { onMounted, onUnmounted } from 'vue'

interface KnowledgeLink {
  keyword: string
  subject: string
  url: string
  chapter: string
}

const KNOWLEDGE_MAP: KnowledgeLink[] = [
  { keyword: '大数定律', subject: '概率论', url: '/courses/probability/', chapter: 'Ch5' },
  { keyword: '贝叶斯', subject: '概率论', url: '/courses/probability/', chapter: 'Ch1' },
  { keyword: '离散型随机变量', subject: '概率论', url: '/courses/probability/', chapter: 'Ch2' },
  { keyword: '连续型随机变量', subject: '概率论', url: '/courses/probability/', chapter: 'Ch3' },
  { keyword: '生产者问题', subject: '操作系统', url: '/courses/os/', chapter: 'Ch2' },
  { keyword: '死锁', subject: '操作系统', url: '/courses/os/', chapter: 'Ch2' },
  { keyword: '页面置换', subject: '操作系统', url: '/courses/os/', chapter: 'Ch3' },
  { keyword: '动态规划', subject: '算法', url: '/courses/algorithm/', chapter: 'Ch3' },
  { keyword: '贪心算法', subject: '算法', url: '/courses/algorithm/', chapter: 'Ch4' },
  { keyword: '分治法', subject: '算法', url: '/courses/algorithm/', chapter: 'Ch2' },
  { keyword: 'DFT', subject: 'DSP', url: '/courses/dsp/', chapter: 'Ch3' },
  { keyword: 'FFT', subject: 'DSP', url: '/courses/dsp/', chapter: 'Ch3' },
  { keyword: '傅里叶变换', subject: 'DSP', url: '/courses/dsp/', chapter: 'Ch2' },
]

let tooltip: HTMLElement | null = null

function showTip(link: HTMLElement, item: KnowledgeLink) {
  removeTip()
  const rect = link.getBoundingClientRect()
  tooltip = document.createElement('div')
  tooltip.className = 'cl-tip'
  tooltip.style.cssText = `
    position:fixed;z-index:10000;
    left:${rect.left}px;top:${rect.bottom + 6}px;
    background:var(--card,#1e2235);border:1px solid var(--border,#2d3436);
    border-radius:10px;padding:10px 14px;font-size:.8rem;
    box-shadow:0 6px 24px rgba(0,0,0,.3);min-width:180px;pointer-events:none;
    animation:fadeInUp .2s ease;
  `
  tooltip.innerHTML = `
    <div style="font-weight:700;color:var(--accent,#6c8aff);margin-bottom:4px">${item.subject} → ${item.chapter}</div>
    <div style="color:var(--text)">知识点「${item.keyword}」</div>
    <div style="font-size:.72rem;color:var(--text3);margin-top:4px">点击跳转学习 →</div>
  `
  document.body.appendChild(tooltip)
  setTimeout(removeTip, 3000)
}

function removeTip() {
  tooltip?.remove()
  tooltip = null
}

onMounted(() => {
  const main = document.querySelector('.main, main')
  if (!main) return
  KNOWLEDGE_MAP.forEach((item) => {
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
    const nodes: Node[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode)
    nodes.forEach((node) => {
      const idx = (node.textContent || '').indexOf(item.keyword)
      if (idx < 0) return
      const parent = node.parentElement
      if (!parent || parent.closest('a,mark,code,pre,.cl-link')) return
      const a = document.createElement('a')
      a.className = 'cl-link'
      a.href = item.url
      a.setAttribute('data-keyword', item.keyword)
      a.style.cssText = `
        color:var(--accent,#6c8aff);text-decoration:none;
        border-bottom:1px dashed var(--accent,#6c8aff);cursor:pointer;
        position:relative;
      `
      try {
        const range = document.createRange()
        range.setStart(node, idx)
        range.setEnd(node, idx + item.keyword.length)
        range.surroundContents(a)
        a.addEventListener('mouseenter', () => showTip(a, item))
        a.addEventListener('mouseleave', removeTip)
        a.addEventListener('click', (e) => {
          e.preventDefault()
          window.location.href = item.url
        })
      } catch {
        /* node split across elements */
      }
    })
  })
})

onUnmounted(removeTip)
</script>
