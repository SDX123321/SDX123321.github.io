import { useState, useCallback } from 'react'

export default function BankerAlgorithm() {
  const [resCount, setResCount] = useState(1)
  const [procCount, setProcCount] = useState(3)
  const [alloc, setAlloc] = useState([[0],[0],[0]])
  const [maxm, setMaxm] = useState([[0],[0],[0]])
  const [avail, setAvail] = useState([0])
  const [request, setRequest] = useState([0])
  const [reqProc, setReqProc] = useState(0)
  const [result, setResult] = useState(null)

  const rebuild = useCallback((rc, pc) => {
    setAlloc(Array.from({ length: pc }, () => Array(rc).fill(0)))
    setMaxm(Array.from({ length: pc }, () => Array(rc).fill(0)))
    setAvail(Array(rc).fill(0))
    setRequest(Array(rc).fill(0))
  }, [])

  const loadExample = () => {
    setResCount(1); setProcCount(3)
    setAlloc([[25],[40],[45]]); setMaxm([[70],[60],[60]])
    setAvail([40]); setRequest([25]); setReqProc(0)
  }

  const run = () => {
    const rc = resCount, pc = procCount, pi = reqProc
    const need = alloc.map((a, i) => a.map((v, j) => maxm[i][j] - v))
    const work = [...avail]; const finish = Array(pc).fill(false)
    const alloc2 = alloc.map(a => [...a]); const need2 = need.map(n => [...n]); const avail2 = [...avail]

    // Check request <= need
    for (let j = 0; j < rc; j++) {
      if (request[j] > need[pi][j]) { setResult({ error: `请求超过最大需求！request[${j}]=${request[j]} > need[${j}]=${need[pi][j]}` }); return }
      if (request[j] > avail[j]) { setResult({ error: `资源不足，进程 P${pi} 必须等待。request[${j}]=${request[j]} > available[${j}]=${avail[j]}` }); return }
    }

    // Try allocation
    for (let j = 0; j < rc; j++) { alloc2[pi][j] += request[j]; need2[pi][j] -= request[j]; avail2[j] -= request[j] }
    const w = [...avail2]; const safeSeq = []; let found = true
    while (found) {
      found = false
      for (let i = 0; i < pc; i++) {
        if (finish[i]) continue
        let canRun = true
        for (let j = 0; j < rc; j++) { if (need2[i][j] > w[j]) { canRun = false; break } }
        if (canRun) { for (let j = 0; j < rc; j++) w[j] += alloc2[i][j]; finish[i] = true; safeSeq.push(`P${i}`); found = true }
      }
    }

    if (finish.every(Boolean)) {
      setResult({ safe: true, seq: safeSeq.join(' → '), remaining: avail2.join(', ') })
    } else {
      setResult({ safe: false, remaining: avail2.join(', ') })
    }
  }

  const updateCell = (setter, arr, i, j, val) => {
    const next = arr.map(r => [...r]); next[i][j] = val; setter(next)
  }

  const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, margin: '16px 0' }}>
      <h3 style={{ marginBottom: 12, color: 'var(--accent2,#a78bfa)' }}>🏦 银行家算法</h3>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ fontSize: '.88rem', color: 'var(--text2)' }}>资源种类: <input type="number" value={resCount} min={1} max={5} onChange={e => { const v = +e.target.value; setResCount(v); rebuild(v, procCount) }} style={{ width: 50 }} /></label>
        <label style={{ fontSize: '.88rem', color: 'var(--text2)' }}>进程数: <input type="number" value={procCount} min={1} max={10} onChange={e => { const v = +e.target.value; setProcCount(v); rebuild(resCount, v) }} style={{ width: 50 }} /></label>
        <button onClick={loadExample} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', cursor: 'pointer', fontSize: '.82rem' }}>示例数据</button>
      </div>
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table>
          <thead><tr><th>进程</th><th colSpan={resCount}>已分配</th><th colSpan={resCount}>最大需求</th><th colSpan={resCount}>剩余需求</th></tr>
            <tr><th></th>{Array.from({ length: 3 }, (_, k) => Array.from({ length: resCount }, (_, j) => <th key={`${k}-${j}`}>{labels[j]}</th>))}</tr></thead>
          <tbody>
            {Array.from({ length: procCount }, (_, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>P{i}</td>
                {Array.from({ length: resCount }, (_, j) => <td key={`a${j}`}><input type="number" value={alloc[i]?.[j] || 0} min={0} onChange={e => updateCell(setAlloc, alloc, i, j, +e.target.value)} style={{ width: 50 }} /></td>)}
                {Array.from({ length: resCount }, (_, j) => <td key={`m${j}`}><input type="number" value={maxm[i]?.[j] || 0} min={0} onChange={e => updateCell(setMaxm, maxm, i, j, +e.target.value)} style={{ width: 50 }} /></td>)}
                {Array.from({ length: resCount }, (_, j) => <td key={`n${j}`} style={{ color: 'var(--orange,#f59e0b)', textAlign: 'center' }}>{(maxm[i]?.[j] || 0) - (alloc[i]?.[j] || 0)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: '.88rem', color: 'var(--text2)' }}>可用资源:</span>
        {Array.from({ length: resCount }, (_, j) => <input key={j} type="number" value={avail[j] || 0} min={0} onChange={e => { const n = [...avail]; n[j] = +e.target.value; setAvail(n) }} style={{ width: 60 }} />)}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: '.88rem', color: 'var(--text2)' }}>请求进程:</span>
        <select value={reqProc} onChange={e => setReqProc(+e.target.value)} style={{ padding: '4px 8px', borderRadius: 6 }}>
          {Array.from({ length: procCount }, (_, i) => <option key={i} value={i}>P{i}</option>)}
        </select>
        <span style={{ fontSize: '.88rem', color: 'var(--text2)' }}>请求向量:</span>
        {Array.from({ length: resCount }, (_, j) => <input key={j} type="number" value={request[j] || 0} min={0} onChange={e => { const n = [...request]; n[j] = +e.target.value; setRequest(n) }} style={{ width: 60 }} />)}
      </div>
      <button onClick={run} style={{ padding: '6px 20px', borderRadius: 8, border: 'none', background: 'var(--accent,#6c5ce7)', color: '#fff', cursor: 'pointer', fontSize: '.85rem', fontWeight: 600 }}>检查安全性</button>
      {result && (
        <div style={{ marginTop: 16, padding: 14, borderRadius: 8, background: result.error ? 'rgba(239,68,68,.1)' : result.safe ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)', border: `1px solid ${result.error || !result.safe ? 'rgba(239,68,68,.3)' : 'rgba(16,185,129,.3)'}` }}>
          {result.error ? <p style={{ color: 'var(--red)', fontWeight: 600 }}>❌ {result.error}</p> : result.safe ? <>
            <p style={{ color: 'var(--green,#10b981)', fontWeight: 600 }}>✅ 安全状态</p>
            <p style={{ fontSize: '.9rem' }}>安全序列: <strong>{result.seq}</strong></p>
            <p style={{ fontSize: '.85rem', color: 'var(--text2)' }}>分配后剩余资源: [{result.remaining}]</p>
          </> : <p style={{ color: 'var(--red)', fontWeight: 600 }}>❌ 不安全状态，无法分配！</p>}
        </div>
      )}
    </div>
  )
}
