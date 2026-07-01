import { useState } from 'react'

function runOPT(frames, seq) {
  const mem = []; let faults = 0; const log = []
  seq.forEach((page, i) => {
    if (mem.includes(page)) { log.push({ page, mem: [...mem], fault: false, repl: -1 }); return }
    faults++
    if (mem.length < frames) { mem.push(page); log.push({ page, mem: [...mem], fault: true, repl: mem.length - 1 }) }
    else {
      let farthest = -1, replaceIdx = 0
      mem.forEach((p, j) => { const next = seq.indexOf(p, i + 1); const dist = next === -1 ? Infinity : next; if (dist > farthest) { farthest = dist; replaceIdx = j } })
      mem[replaceIdx] = page
      log.push({ page, mem: [...mem], fault: true, repl: replaceIdx })
    }
  })
  return { log, faults }
}

function runFIFO(frames, seq) {
  const mem = []; const queue = []; let faults = 0; const log = []
  seq.forEach(page => {
    if (mem.includes(page)) { log.push({ page, mem: [...mem], fault: false, repl: -1 }); return }
    faults++
    if (mem.length < frames) { mem.push(page); queue.push(page); log.push({ page, mem: [...mem], fault: true, repl: mem.length - 1 }) }
    else { const out = queue.shift(); const idx = mem.indexOf(out); mem[idx] = page; queue.push(page); log.push({ page, mem: [...mem], fault: true, repl: idx }) }
  })
  return { log, faults }
}

function runLRU(frames, seq) {
  const mem = []; let faults = 0; const log = []
  seq.forEach(page => {
    if (mem.includes(page)) { mem.splice(mem.indexOf(page), 1); mem.push(page); log.push({ page, mem: [...mem], fault: false, repl: -1 }); return }
    faults++
    if (mem.length < frames) { mem.push(page); log.push({ page, mem: [...mem], fault: true, repl: mem.length - 1 }) }
    else { mem.shift(); mem.push(page); log.push({ page, mem: [...mem], fault: true, repl: mem.length - 1 }) }
  })
  return { log, faults }
}

function AlgoTable({ name, result, frames, seqLen }) {
  const rate = (result.faults / seqLen * 100).toFixed(1)
  return (
    <div style={{ marginBottom: 24 }}>
      <h4 style={{ margin: '16px 0 4px', color: 'var(--accent2,#a78bfa)' }}>{name}</h4>
      <p style={{ fontSize: '.88rem', color: 'var(--text2)' }}>缺页次数: <strong style={{ color: 'var(--red,#ef4444)' }}>{result.faults}</strong> / {seqLen}，缺页率: <strong>{rate}%</strong></p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>步骤</th>{Array.from({ length: frames }, (_, i) => <th key={i}>页框{i}</th>)}<th>访问页</th><th>结果</th></tr></thead>
          <tbody>
            {result.log.map((entry, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                {Array.from({ length: frames }, (_, j) => {
                  const val = entry.mem[j] !== undefined ? entry.mem[j] : '-'
                  const bg = entry.fault && j === entry.repl ? 'rgba(255,107,107,.15)' : ''
                  return <td key={j} style={{ background: bg, textAlign: 'center' }}>{val}</td>
                })}
                <td style={{ fontWeight: 600, textAlign: 'center' }}>{entry.page}</td>
                <td style={{ color: entry.fault ? 'var(--red,#ef4444)' : 'var(--green,#10b981)', textAlign: 'center' }}>{entry.fault ? '缺页' : '命中'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function PageReplacementSimulator() {
  const [frames, setFrames] = useState(3)
  const [seqStr, setSeqStr] = useState('4,3,2,1,4,3,5,4,3,2,1,5')
  const [result, setResult] = useState(null)

  const calculate = () => {
    const seq = seqStr.split(',').map(s => +s.trim()).filter(n => !isNaN(n))
    if (!frames || !seq.length) return
    setResult({ opt: runOPT(frames, seq), fifo: runFIFO(frames, seq), lru: runLRU(frames, seq), seqLen: seq.length })
  }

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, margin: '16px 0' }}>
      <h3 style={{ marginBottom: 12, color: 'var(--accent2,#a78bfa)' }}>📄 页面置换模拟器</h3>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ fontSize: '.88rem', color: 'var(--text2)' }}>
          页框数: <input type="number" value={frames} min={1} max={10} onChange={e => setFrames(+e.target.value)} style={{ width: 50, marginLeft: 4 }} />
        </label>
        <label style={{ fontSize: '.88rem', color: 'var(--text2)', flex: 1, minWidth: 200 }}>
          访问序列: <input value={seqStr} onChange={e => setSeqStr(e.target.value)} placeholder="逗号分隔" style={{ width: '100%', marginLeft: 4 }} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => { setFrames(3); setSeqStr('4,3,2,1,4,3,5,4,3,2,1,5') }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', cursor: 'pointer', fontSize: '.85rem' }}>示例数据</button>
        <button onClick={calculate} style={{ padding: '6px 20px', borderRadius: 8, border: 'none', background: 'var(--accent,#6c5ce7)', color: '#fff', cursor: 'pointer', fontSize: '.85rem', fontWeight: 600 }}>运行对比</button>
      </div>
      {result && (
        <div style={{ marginTop: 16 }}>
          <AlgoTable name="OPT 理想置换" result={result.opt} frames={frames} seqLen={result.seqLen} />
          <AlgoTable name="FIFO 先进先出" result={result.fifo} frames={frames} seqLen={result.seqLen} />
          <AlgoTable name="LRU 最近最少用" result={result.lru} frames={frames} seqLen={result.seqLen} />
        </div>
      )}
    </div>
  )
}
