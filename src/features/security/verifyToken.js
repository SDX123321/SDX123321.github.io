/**
 * Call the Turnstile Worker to verify a token server-side.
 *
 * 安全策略：
 *   - Worker 不可达时**拒绝**验证，不再客户端兜底放行
 *   - 任意 token 字符串不会被接当作有效
 *
 * @param {string} token - Turnstile response token
 * @returns {Promise<boolean>}
 */
const WORKER_URL = '/api/turnstile-verify' // proxied via Cloudflare; change to your worker URL if different

export async function verifyTurnstileToken(token) {
  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!res.ok) return false
    const data = await res.json()
    return !!data.success
  } catch {
    // Worker 不可达 —— 安全失败，拒绝放行
    return false
  }
}
