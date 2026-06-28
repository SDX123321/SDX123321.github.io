import { useEffect, useRef } from 'react'

const KNOWLEDGE_MAP = [
  { keyword: '贝叶斯', subject: '概率论', url: '/site/courses/probability/', chapter: 'Ch1' },
  { keyword: '全概率', subject: '概率论', url: '/site/courses/probability/', chapter: 'Ch1' },
  { keyword: '期望', subject: '概率论', url: '/site/courses/probability/', chapter: 'Ch4' },
  { keyword: '方差', subject: '概率论', url: '/site/courses/probability/', chapter: 'Ch4' },
  { keyword: '正态分布', subject: '概率论', url: '/site/courses/probability/', chapter: 'Ch2' },
  { keyword: 'FCFS', subject: '操作系统', url: '/site/courses/os/', chapter: '调度' },
  { keyword: 'SJF', subject: '操作系统', url: '/site/courses/os/', chapter: '调度' },
  { keyword: 'HRRN', subject: '操作系统', url: '/site/courses/os/', chapter: '调度' },
  { keyword: '银行家算法', subject: '操作系统', url: '/site/courses/os/', chapter: '死锁' },
  { keyword: 'OPT', subject: '操作系统', url: '/site/courses/os/', chapter: '页面置换' },
  { keyword: 'FIFO', subject: '操作系统', url: '/site/courses/os/', chapter: '页面置换' },
  { keyword: 'LRU', subject: '操作系统', url: '/site/courses/os/', chapter: '页面置换' },
  { keyword: 'PV', subject: '操作系统', url: '/site/courses/os/', chapter: '同步' },
  { keyword: '分治法', subject: '算法', url: '/site/courses/algorithm/', chapter: 'Ch2' },
  { keyword: '动态规划', subject: '算法', url: '/site/courses/algorithm/', chapter: 'Ch3' },
  { keyword: '贪心', subject: '算法', url: '/site/courses/algorithm/', chapter: 'Ch4' },
  { keyword: '回溯法', subject: '算法', url: '/site/courses/algorithm/', chapter: 'Ch5' },
  { keyword: '分支限界', subject: '算法', url: '/site/courses/algorithm/', chapter: 'Ch6' },
  { keyword: 'DFT', subject: 'DSP', url: '/site/courses/dsp/', chapter: 'Ch3' },
  { keyword: 'FFT', subject: 'DSP', url: '/site/courses/dsp/', chapter: 'Ch3' },
  { keyword: 'IIR', subject: 'DSP', url: '/site/courses/dsp/', chapter: 'Ch4' },
  { keyword: 'FIR', subject: 'DSP', url: '/site/courses/dsp/', chapter: 'Ch5' },
  { keyword: 'Z变换', subject: 'DSP', url: '/site/courses/dsp/', chapter: 'Ch1' },
  { keyword: 'DTFT', subject: 'DSP', url: '/site/courses/dsp/', chapter: 'Ch1' },
  { keyword: '线性相位', subject: 'DSP', url: '/site/courses/dsp/', chapter: 'Ch5' },
  { keyword: '矛盾', subject: '马克思', url: '/site/courses/marxism/', chapter: '唯物辩证法' },
  { keyword: '剩余价值', subject: '马克思', url: '/site/courses/marxism/', chapter: '资本主义' },
  { keyword: '唯物史观', subject: '马克思', url: '/site/courses/marxism/', chapter: '唯物史观' },
  { keyword: '实践', subject: '马克思', url: '/site/courses/marxism/', chapter: '认识论' },
  { keyword: '真理', subject: '马克思', url: '/site/courses/marxism/', chapter: '认识论' },
  { keyword: '格林公式', subject: '高数', url: '/site/courses/calculus/', chapter: '多元积分' },
  { keyword: '高斯公式', subject: '高数', url: '/site/courses/calculus/', chapter: '多元积分' },
  { keyword: '柯西积分', subject: '高数', url: '/site/courses/calculus/', chapter: '复变函数' },
  { keyword: '全微分', subject: '高数', url: '/site/courses/calculus/', chapter: '多元微分' },
]

export default function CrossLinks() {
  const done = useRef(false)
  const tooltipRef = useRef(null)

  useEffect(() => {
    if (done.current) return
    done.current = true

    const timer = setTimeout(() => {
      const container = document.querySelector('.course-content') || document.querySelector('.main') || document.querySelector('main')
      if (!container) return

      // Create tooltip
      const tip = document.createElement('div')
      tip.className = 'kl-tip'
      tip.style.cssText = 'display:none;position:fixed;padding:8px 14px;border-radius:8px;background:var(--card,#1e2235);border:1px solid var(--border);color:var(--text);font-size:.78rem;z-index:999;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:none;max-width:200px'
      document.body.appendChild(tip)
      tooltipRef.current = tip

      // Walk text nodes
      const walker = document.createTextWalker(container, NodeFilter.SHOW_TEXT)
      const textNodes = []
      while (walker.nextNode()) textNodes.push(walker.currentNode)

      textNodes.forEach(node => {
        if (!node.textContent || node.parentElement.closest('a, button, input, .kl-tip')) return
        for (const k of KNOWLEDGE_MAP) {
          const idx = node.textContent.indexOf(k.keyword)
          if (idx < 0) continue
          const range = document.createRange()
          range.setStart(node, idx)
          range.setEnd(node, idx + k.keyword.length)
          const link = document.createElement('a')
          link.href = k.url
          link.target = '_blank'
          link.textContent = k.keyword
          link.style.cssText = 'color:var(--accent,#6c5ce7);text-decoration:underline dotted;cursor:pointer;text-underline-offset:2px'
          link.addEventListener('mouseenter', (e) => {
            tip.textContent = '📚 ' + k.subject + ' · ' + k.chapter
            tip.style.display = 'block'
            tip.style.left = e.pageX + 12 + 'px'
            tip.style.top = e.pageY - 8 + 'px'
          })
          link.addEventListener('mousemove', (e) => {
            tip.style.left = e.pageX + 12 + 'px'
            tip.style.top = e.pageY - 8 + 'px'
          })
          link.addEventListener('mouseleave', () => { tip.style.display = 'none' })
          range.surroundContents(link)
          break
        }
      })
    }, 1000)

    return () => {
      clearTimeout(timer)
      tooltipRef.current?.remove()
    }
  }, [])

  return null
}
