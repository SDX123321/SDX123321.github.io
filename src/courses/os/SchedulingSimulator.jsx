import { useState } from 'react'

const COLORS = ['#6c5ce7','#00cec9','#fdcb6e','#ff6b6b','#74b9ff','#a29bfe','#55efc4','#fab1a0']

function runFCFS(jobs) {
  let time = 0
  return jobs.map(j => {
    if (time < j.arrival) time = j.arrival
    const start = time, end = time + j.burst
    time = end
    return { ...j, start, end, turnaround: end - j.arrival, weighted: +((end - j.arrival) / j.burst).toFixed(2) }
  })
}

function runSJF(jobs) {
  let time = 0; const result = []; const remaining = [...jobs]
  while (remaining.length) {
    const available = remaining.filter(j => j.arrival <= time)
    if (!available.length) { time = Math.min(...remaining.map(j => j.arrival)); continue }
    available.sort((a, b) => a.burst - b.burst)
    const j = available[0]; const start = time, end = time + j.burst
    result.push({ ...j, start, end, turnaround: end - j.arrival, weighted: +((end - j.arrival) / j.burst).toFixed(2) })
    time = end; remaining.splice(remaining.indexOf(j), 1)
  }
  return result
}

function runHRRN(jobs) {
  let time = 0; const result = []; const remaining = [...jobs]
  while (remaining.length) {
    const available = remaining.filter(j => j.arrival <= time)
    if (!available.length) { time = Math.min(...remaining.map(j => j.arrival)); continue }
    available.forEach(j => { j._ratio = 1 + (time - j.arrival) / j.burst })
    available.sort((a, b) => b._ratio - a._ratio)
    const j = available[0]; const start = time, end = time + j.burst
    result.push({ ...j, start, end, turnaround: end - j.arrival, weighted: +((end - j.arrival) / j.burst).toFixed(2) })
    time = end; remaining.splice(remaining.indexOf(j), 1)
  }
  return result
}

function ResultTable({ title, results }) {
  const avgT = (results.reduce((s, r) => s + r.turnaround, 0) / results.length).toFixed(2)
  const avgW = (results.reduce((s, r) => s + r.weighted, 0) / results.length).toFixed(3)
  return (
    <div style={{ marginBottom: 24 }}>
      <h4 style={{ margin: '16px 0 8px', color: 'var(--accent2,#a78bfa)' }}>{title}</h4>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>任务</th><th>到达</th><th>运行</th><th>开始</th><th>完成</th><th>周转</th><th>带权周转</th></tr></thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i}><td>{r.name}</td><td>{r.arrival}</td><td>{r.burst}</td><td>{r.start}</td><td>{r.end}</td><td>{r.turnaround}</td><td>{r.weighted}</td></tr>
            ))}
            <tr style={{ fontWeight: 700, background: 'rgba(108,99,255,.08)' }}><td colSpan={5}>平均</td><td>{avgT}</td><td>{avgW}</td></tr>
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 8, padding: '8px 0' }}>
        {results.map((r, i) => (
          <span key={i}>
            {i > 0 && <span style={{ margin: '0 2px', color: 'var(--text3)' }}>→</span>}
            <span style={{ display: 'inline-block', background: COLORS[i % COLORS.length], color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: '.82rem', fontWeight: 600, minWidth: 40, textAlign: 'center' }} title={`${r.name}: ${r.start}-${r.end}`}>
              {r.name}({r.burst})
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function SchedulingSimulator() {
  const [jobs, setJobs] = useState([
    { name: 'JOB1', arrival: 0, burst: 120 },
    { name: 'JOB2', arrival: 50, burst: 50 },
    { name: 'JOB3', arrival: 60, burst: 10 },
    { name: 'JOB4', arrival: 110, burst: 20 },
  ])
  const [result, setResult] = useState(null)

  const addJob = () => setJobs([...jobs, { name: `JOB${jobs.length + 1}`, arrival: 0, burst: 10 }])
  const removeJob = (i) => setJobs(jobs.filter((_, idx) => idx !== i))
  const updateJob = (i, field, val) => {
    const next = [...jobs]; next[i] = { ...next[i], [field]: val }; setJobs(next)
  }

  const calculate = () => {
    const sorted = [...jobs].sort((a, b) => a.arrival - b.arrival)
    setResult({
      fcfs: runFCFS(sorted),
      sjf: runSJF(sorted),
      hrrn: runHRRN(sorted),
    })
  }

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, margin: '16px 0' }}>
      <h3 style={{ marginBottom: 12, color: 'var(--accent2,#a78bfa)' }}>📊 调度算法模拟器</h3>
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table>
          <thead><tr><th>任务名</th><th>到达时间</th><th>运行时间</th><th>操作</th></tr></thead>
          <tbody>
            {jobs.map((j, i) => (
              <tr key={i}>
                <td><input value={j.name} onChange={e => updateJob(i, 'name', e.target.value)} style={{ width: 70 }} /></td>
                <td><input type="number" value={j.arrival} min={0} onChange={e => updateJob(i, 'arrival', +e.target.value)} style={{ width: 60 }} /></td>
                <td><input type="number" value={j.burst} min={1} onChange={e => updateJob(i, 'burst', +e.target.value)} style={{ width: 60 }} /></td>
                <td><button onClick={() => removeJob(i)} style={{ background: 'var(--danger,#ef4444)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '.82rem' }}>删</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={addJob} style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', cursor: 'pointer', fontSize: '.85rem' }}>+ 添加任务</button>
        <button onClick={calculate} style={{ padding: '6px 20px', borderRadius: 8, border: 'none', background: 'var(--accent,#6c5ce7)', color: '#fff', cursor: 'pointer', fontSize: '.85rem', fontWeight: 600 }}>计算调度结果</button>
      </div>
      {result && (
        <div style={{ marginTop: 16 }}>
          <ResultTable title="FCFS 先来先服务" results={result.fcfs} />
          <ResultTable title="SJF 最短作业优先" results={result.sjf} />
          <ResultTable title="HRRN 最高响应比优先" results={result.hrrn} />
        </div>
      )}
    </div>
  )
}
