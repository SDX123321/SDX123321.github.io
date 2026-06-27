import { useState } from 'react'

function runFCFS(seq, start) {
  const path = [start, ...seq]; let dist = 0
  for (let i = 1; i < path.length; i++) dist += Math.abs(path[i] - path[i - 1])
  return { path, dist }
}

function runSSTF(seq, start) {
  const remaining = [...seq]; let pos = start; const path = [start]; let dist = 0
  while (remaining.length) {
    let minD = Infinity, minI = 0
    remaining.forEach((r, i) => { const d = Math.abs(r - pos); if (d < minD) { minD = d; minI = i } })
    dist += minD; pos = remaining[minI]; path.push(pos); remaining.splice(minI, 1)
  }
  return { path, dist }
}

function runSCAN(seq, start, maxTrack = 200) {
  const sorted = [...seq].sort((a, b) => a - b); const path = [start]; let dist = 0
  const left = sorted.filter(r => r < start).reverse()
  const right = sorted.filter(r => r >= start)
  let pos = start
  right.forEach(r => { dist += Math.abs(r - pos); pos = r; path.push(r) })
  if (left.length) { dist += Math.abs(maxTrack - pos); pos = maxTrack; path.push(maxTrack) }
  left.forEach(r => { dist += Math.abs(r - pos); pos = r; path.push(r) })
  return { path, dist }
}

function runLOOK(seq, start) {
  const sorted = [...seq].sort((a, b) => a - b); const path = [start]; let dist = 0
  const left = sorted.filter(r => r < start).reverse()
  const right = sorted.filter(r => r >= start)
  let pos = start
  right.forEach(r => { dist += Math.abs(r - pos); pos = r; path.push(r) })
  left.forEach(r => { dist += Math.abs(r - pos); pos = r; path.push(r) })
  return { path, dist }
}

function ResultRow({ name, result }) {
  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{name}</td>
      <td style={{ fontSize: '.82rem' }}>{result.path.join(' → ')}</td>
      <td style={{ fontWeight: 700, textAlign: 'center' }}>{result.dist}</td>
    </tr>
  )
}

export default function DiskScheduling() {
  const [start, setStart] = useState(53)
  const [seqStr, setSeqStr] = useState('98,183,37,122,14,124,65,67')
  const [result, setResult] = useState(null)

  const calculate = () => {
    const seq = seqStr.split(',').map(s => +s.trim()).filter(n => !isNaN(n))
    if (!seq.length) return
    setResult({
      fcfs: runFCFS(seq, start),
      sstf: runSSTF(seq, start),
      scan: runSCAN(seq, start),
      look: runLOOK(seq, start),
    })
  }

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, margin: '16px 0' }}>
      <h3 style={{ marginBottom: 12, color: 'var(--accent2,#a78bfa)' }}>💿 磁盘调度模拟器</h3>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ fontSize: '.88rem', color: 'var(--text2)' }}>起始磁道: <input type="number" value={start} min={0} onChange={e => setStart(+e.target.value)} style={{ width: 60, marginLeft: 4 }} /></label>
        <label style={{ fontSize: '.88rem', color: 'var(--text2)', flex: 1, minWidth: 200 }}>访问序列: <input value={seqStr} onChange={e => setSeqStr(e.target.value)} placeholder="逗号分隔" style={{ width: '100%', marginLeft: 4 }} /></label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => { setStart(53); setSeqStr('98,183,37,122,14,124,65,67') }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', cursor: 'pointer', fontSize: '.85rem' }}>示例数据</button>
        <button onClick={calculate} style={{ padding: '6px 20px', borderRadius: 8, border: 'none', background: 'var(--accent,#6c5ce7)', color: '#fff', cursor: 'pointer', fontSize: '.85rem', fontWeight: 600 }}>计算对比</button>
      </div>
      {result && (
        <div style={{ marginTop: 16, overflowX: 'auto' }}>
          <table>
            <thead><tr><th>算法</th><th>移动路径</th><th>总移动道数</th></tr></thead>
            <tbody>
              <ResultRow name="FCFS" result={result.fcfs} />
              <ResultRow name="SSTF" result={result.sstf} />
              <ResultRow name="SCAN" result={result.scan} />
              <ResultRow name="LOOK" result={result.look} />
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
