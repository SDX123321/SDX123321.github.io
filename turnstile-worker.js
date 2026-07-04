/**
 * Cloudflare Worker — Turnstile server-side validation endpoint.
 *
 * Deploy:  npx wrangler deploy
 * Usage:   POST /verify  { "token": "<turnstile-response>" }
 * Env:     SECRET_KEY  — 通过 `wrangler secret put SECRET_KEY` 设置，不要硬编码
 *          ALLOWED_ORIGIN — 可选，通过 `wrangler secret put ALLOWED_ORIGIN`
 *                           设置成 https://web.zzzzcx.com，开启严格 CORS
 */
const CORS = {
  'Access-Control-Allow-Origin': '*', // 部署时改用 env.ALLOWED_ORIGIN 收紧
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

    if (request.method !== 'POST' || !new URL(request.url).pathname.endsWith('/verify')) {
      return new Response('Not Found', { status: 404, headers: CORS })
    }

    const SECRET_KEY = env?.SECRET_KEY
    if (!SECRET_KEY) {
      // 缺少密钥时**拒绝**而非放行，避免 secret 配置遗漏变成"裸奔"
      return Response.json(
        { success: false, error: 'server_misconfigured' },
        { status: 500, headers: CORS }
      )
    }

    let body
    try {
      body = await request.json()
    } catch {
      return Response.json({ success: false, error: 'invalid_json' }, { status: 400, headers: CORS })
    }

    const { token } = body
    if (!token) {
      return Response.json({ success: false, error: 'missing_token' }, { status: 400, headers: CORS })
    }

    const formData = new FormData()
    formData.append('secret', SECRET_KEY)
    formData.append('response', token)
    formData.append('remoteip', request.headers.get('CF-Connecting-IP') || '')

    try {
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: formData,
      })
      const result = await res.json()
      return Response.json(
        { success: !!result.success, error: result['error-codes']?.[0] || null },
        { headers: CORS },
      )
    } catch (e) {
      return Response.json(
        { success: false, error: 'upstream_error' },
        { status: 502, headers: CORS },
      )
    }
  },
}
