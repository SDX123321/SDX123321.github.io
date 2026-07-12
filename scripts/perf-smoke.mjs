import { mkdir, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

const baseUrl = (process.env.PERF_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
const durationSeconds = Number(process.env.PERF_DURATION_SECONDS || 20)
const concurrency = Number(process.env.PERF_CONCURRENCY || 10)
const endpoints = (process.env.PERF_ENDPOINTS || '/health/live,/health/ready,/api/domains')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const latencies = []
const errors = []
let requests = 0
const deadline = Date.now() + durationSeconds * 1000

async function worker(workerId) {
  while (Date.now() < deadline) {
    const path = endpoints[(requests + workerId) % endpoints.length]
    const started = performance.now()
    try {
      const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(5000) })
      await response.arrayBuffer()
      if (!response.ok) errors.push(`${path}: HTTP ${response.status}`)
    } catch (error) {
      errors.push(`${path}: ${error.message}`)
    } finally {
      latencies.push(performance.now() - started)
      requests += 1
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)))
latencies.sort((a, b) => a - b)
const percentile = (value) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * value))] || 0
const result = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  durationSeconds,
  concurrency,
  endpoints,
  requests,
  errors: errors.length,
  errorRate: requests ? errors.length / requests : 1,
  requestsPerSecond: requests / durationSeconds,
  latencyMs: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: latencies.at(-1) || 0 },
  sampleErrors: errors.slice(0, 10),
}

await mkdir('.k6-results', { recursive: true })
await writeFile('.k6-results/perf-smoke.json', `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))
if (result.errorRate > Number(process.env.PERF_MAX_ERROR_RATE || 0.01)) process.exitCode = 1
