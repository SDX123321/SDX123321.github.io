/**
 * Call the Turnstile Worker to verify a token server-side.
 * Falls back to client-only mode if the worker is unreachable.
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
    const data = await res.json()
    return !!data.success
  } catch {
    // Worker unreachable — accept token on client (degraded security)
    return !!token
  }
}
