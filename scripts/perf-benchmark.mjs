import { mkdir, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

const baseUrl = (process.env.PERF_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
// 压测端点默认使用需要鉴权的 /api/me，以及无鉴权的健康检查
const endpoints = (process.env.PERF_ENDPOINTS || '/api/me,/health/live')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean)

const stepDurationMs = Number(process.env.PERF_STEP_DURATION_MS || 3000)
const maxConcurrency = Number(process.env.PERF_MAX_CONCURRENCY || 500)
const concurrencySteps = [10, 20, 50, 100, 200, 300, 400, 500].filter(c => c <= maxConcurrency)
const maxErrorRate = 0.02

// 性能测试专用静态账号
const AUTH_USER = 'perf_benchmark_user'
const AUTH_PASS = 'perf_benchmark_pass'
let sessionCookie = ''

let apiKey = null

async function initApiKey() {
  try {
    const res = await fetch(`${baseUrl}/api/handshake`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      apiKey = data.apiKey
    }
  } catch (err) {
    console.error(`Failed to get API key for benchmark: ${err.message}`)
  }
}

async function performLogin() {
  await initApiKey()
  console.log(`🔐 正在尝试为测试准备鉴权凭证...`)
  
  // 1. 尝试注册账号
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers['X-API-Key'] = apiKey
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: AUTH_USER, password: AUTH_PASS })
    })
    
    if (regRes.status === 409) {
      console.log(`   ℹ 账号已存在，将直接进行登录...`)
    } else if (regRes.ok) {
      console.log(`   ✓ 成功创建压测专属账号: ${AUTH_USER}`)
    } else {
      const err = await regRes.text()
      console.log(`   ⚠️ 注册尝试返回状态 ${regRes.status}: ${err}`)
    }
  } catch (err) {
    console.log(`   ⚠️ 无法连接注册端点 (可能已注册或数据库已初始化): ${err.message}`)
  }

  // 2. 进行登录获取 Cookie
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers['X-API-Key'] = apiKey
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: AUTH_USER, password: AUTH_PASS })
    })

    if (!loginRes.ok) {
      const errText = await loginRes.text()
      throw new Error(`登录失败 HTTP ${loginRes.status}: ${errText}`)
    }

    // 从 Set-Cookie 提取 session cookie
    const setCookieHeaders = loginRes.headers.getSetCookie 
      ? loginRes.headers.getSetCookie() 
      : [loginRes.headers.get('set-cookie')].filter(Boolean)

    if (setCookieHeaders.length === 0) {
      throw new Error('响应中未找到 Set-Cookie 头')
    }

    // 寻找包含 exam_review_session 的 cookie
    for (const cookieStr of setCookieHeaders) {
      if (cookieStr.includes('exam_review_session=')) {
        // 提取 exam_review_session=xxxx 部分
        const match = cookieStr.match(/exam_review_session=[^;]+/)
        if (match) {
          sessionCookie = match[0]
          break
        }
      }
    }

    if (!sessionCookie) {
      throw new Error(`未匹配到 session cookie 'exam_review_session'`)
    }

    console.log(`   🔑 鉴权成功！获取到 Cookie 凭证: ${sessionCookie.substring(0, 30)}...`)
  } catch (err) {
    console.error(`💥 鉴权初始化流程失败: ${err.message}`)
    console.error(`⚠️ 测试将继续以【未鉴权状态】运行部分不需要身份的端点。`)
  }
}

async function performLogout() {
  if (!sessionCookie) return
  try {
    const headers = { 'Cookie': sessionCookie }
    if (apiKey) headers['X-API-Key'] = apiKey
    await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers
    })
    console.log(`\n🔓 已成功清理并登出压测会话。`)
  } catch (err) {
    // 静默失败
  }
}

async function runTest(concurrency) {
  const latencies = []
  const errors = []
  let requests = 0
  const deadline = Date.now() + stepDurationMs

  async function worker(workerId) {
    while (Date.now() < deadline) {
      const path = endpoints[(requests + workerId) % endpoints.length]
      const started = performance.now()
      
      const reqHeaders = {}
      if (sessionCookie) {
        reqHeaders['Cookie'] = sessionCookie
      }
      if (apiKey && path.includes('/api/')) {
        reqHeaders['X-API-Key'] = apiKey
      }

      try {
        const response = await fetch(`${baseUrl}${path}`, { 
          headers: reqHeaders,
          signal: AbortSignal.timeout(2000) 
        })
        await response.arrayBuffer()
        if (!response.ok) {
          errors.push(`${path}: HTTP ${response.status}`)
        }
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
  const percentile = (v) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * v))] || 0
  const errorRate = requests ? errors.length / requests : 1
  const rps = requests / (stepDurationMs / 1000)

  return {
    concurrency,
    requests,
    errors: errors.length,
    errorRate,
    rps,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99)
  }
}

// 1. 初始化鉴权
await performLogin()

console.log(`==================================================`)
console.log(`🚀 开始探测 API 最大吞吐能力 (Benchmark)`)
console.log(`目标基准 URL: ${baseUrl}`)
console.log(`测试端点: ${endpoints.join(', ')}`)
console.log(`每个并发阶梯测试时长: ${stepDurationMs / 1000} 秒`)
console.log(`最大允许错误率: ${(maxErrorRate * 100).toFixed(1)}%`)
console.log(`带鉴权运行状态: ${sessionCookie ? '已开启' : '未开启'}`)
console.log(`==================================================\n`)

const results = []
let peakRps = 0
let peakConcurrency = 0
let exitReason = '达到最大并发测试阶梯'

for (const concurrency of concurrencySteps) {
  console.log(`🏃 正在以并发数: ${concurrency} 进行测试...`)
  try {
    const res = await runTest(concurrency)
    results.push(res)
    console.log(`   ⏱ 吞吐量: ${res.rps.toFixed(1)} RPS | 错误率: ${(res.errorRate * 100).toFixed(2)}% | 延迟: P50=${res.p50.toFixed(1)}ms, P95=${res.p95.toFixed(1)}ms`)

    if (res.errorRate > maxErrorRate) {
      exitReason = `错误率过高 (${(res.errorRate * 100).toFixed(2)}% > ${(maxErrorRate * 100).toFixed(1)}%)`
      console.log(`   ⚠️ 触发停止条件: ${exitReason}`)
      break
    }

    if (res.rps > peakRps) {
      peakRps = res.rps
      peakConcurrency = concurrency
    } else if (res.rps < peakRps * 0.85) {
      exitReason = `吞吐量开始下降 (当前 ${res.rps.toFixed(1)} RPS < 峰值 ${peakRps.toFixed(1)} RPS 的 85%)`
      console.log(`   🛑 触发停止条件: ${exitReason}`)
      break
    }
  } catch (err) {
    console.error(`💥 测试执行异常: ${err.message}`)
    exitReason = `测试执行异常: ${err.message}`
    break
  }
}

// 2. 清理鉴权
await performLogout()

const finalSummary = {
  testedAt: new Date().toISOString(),
  baseUrl,
  endpoints,
  peakRps,
  peakConcurrency,
  exitReason,
  details: results
}

await mkdir('.k6-results', { recursive: true })
await writeFile('.k6-results/perf-benchmark.json', `${JSON.stringify(finalSummary, null, 2)}\n`)

console.log(`\n==================================================`)
console.log(`📊 压测总结报告`)
console.log(`--------------------------------------------------`)
console.log(`🔥 探测最大吞吐量: ${peakRps.toFixed(1)} RPS`)
console.log(`🎯 最佳并发用户数: ${peakConcurrency} 并发`)
console.log(`🚪 退出探测原因: ${exitReason}`)
console.log(`--------------------------------------------------`)
console.log(`详细报告已保存至: .k6-results/perf-benchmark.json`)
console.log(`==================================================`)
