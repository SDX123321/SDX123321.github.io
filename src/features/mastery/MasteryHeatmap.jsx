import { useState, useEffect } from 'react'

const CHAPTERS = {
  probability: ['Ch1随机事件','Ch2随机变量','Ch3多维变量','Ch4数字特征','Ch5大数定律','Ch6抽样分布','Ch7参数估计','Ch8假设检验'],
  os: ['Ch1概述','Ch2处理器','Ch3存储','Ch4设备','Ch5文件'],
  algorithm: ['Ch1概述','Ch2分治','Ch3DP','Ch4贪心','Ch5回溯','Ch6分支限界','Ch7随机'],
  dsp: ['Ch1信号系统','Ch2采样重建','Ch3 DFT/FFT','Ch4 IIR','Ch5 FIR','Ch6实现'],
  calculus: ['ODE','多元微分','多元积分','复变函数'],
  marxism: ['Ch1唯物论','Ch2认识论','Ch3唯物史观','Ch4资本主义','Ch5帝国主义','Ch6社会主义'],
}

function getPageId() {
  const p = window.location.pathname
  for (const key of Object.keys(CHAPTERS)) {
    if (p.includes('/' + key)) return key
  }
  return null
}

function loadData() {
  try { return JSON.parse(localStorage.getItem('mastery_data') || '{}') } catch (e) { return {} }
}

export default function MasteryHeatmap() {
  const [data] = useState(loadData)
  const pageId = getPageId()

  // Try to render into #f-heatmap if it exists
  useEffect(() => {
    const el = document.getElementById('f-heatmap')
    if (!el) return
    let h = '<h4 style="margin-bottom:12px;color:var(--text)">📊 学习进度</h4>'
    Object.keys(CHAPTERS).forEach(sub => {
      const chapters = CHAPTERS[sub]
      const labels = { probability: '概率论', os: '操作系统', algorithm: '算法', dsp: 'DSP', calculus: '高数', marxism: '马克思' }
      const label = labels[sub] || sub
      h += '<div style="display:flex;align-items:center;gap:8px;margin:6px 0">' +
        '<div style="font-size:.75rem;color:var(--text3);width:60px;text-align:right">' + label + '</div>' +
        '<div style="display:flex;gap:3px">'
      chapters.forEach((ch, i) => {
        const d = data[sub] && data[sub][ch]
        let cls = 'f-hm-gray'
        if (d) {
          if (d.wrong > 0) cls = 'f-hm-red'
          else if (d.correct > 0) cls = 'f-hm-green'
          else if (d.visits > 0) cls = 'f-hm-light'
        }
        h += '<div class="f-hm-cell ' + cls + '" title="' + ch + (d ? ' (' + d.visits + '次)' : '') + '">' + (i + 1) + '</div>'
      })
      h += '</div></div>'
    })
    h += '<div style="display:flex;gap:12px;margin-top:12px;font-size:.75rem;color:var(--text3)">' +
      '<span><span style="display:inline-flex;width:16px;height:16px;border-radius:4px;background:#2d3436;align-items:center;justify-content:center;font-size:.5rem;color:#636e72;margin-right:4px">1</span> 未访问</span>' +
      '<span><span style="display:inline-flex;width:16px;height:16px;border-radius:4px;background:#2ecc71;opacity:.4;align-items:center;justify-content:center;font-size:.5rem;color:#fff;margin-right:4px">2</span> 已访问</span>' +
      '<span><span style="display:inline-flex;width:16px;height:16px;border-radius:4px;background:#2ecc71;align-items:center;justify-content:center;font-size:.5rem;color:#fff;margin-right:4px">3</span> 已掌握</span>' +
      '<span><span style="display:inline-flex;width:16px;height:16px;border-radius:4px;background:#ff6b6b;align-items:center;justify-content:center;font-size:.5rem;color:#fff;margin-right:4px">4</span> 薄弱</span></div>'
    el.innerHTML = h
  }, [data])

  if (pageId) return null // Don't render standalone on course pages
  return null
}
