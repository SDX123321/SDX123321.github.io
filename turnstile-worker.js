/**
 * Cloudflare Worker — Turnstile server-side validation endpoint.
 *
 * Deploy:  npx wrangler deploy
 * Usage:   POST /verify  { "token": "<turnstile-response>" }
 * Env:     SECRET_KEY (set via wrangler secret put SECRET_KEY)
 */

const SECRET_KEY = '0x4AAAAAADsVdWruaZL5aJ1Id-2j1uB9cVs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

    if (request.method !== 'POST' || !request.url.endsWith('/verify')) {
      return new Response('Not Found', { status: 404, headers: CORS })
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

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    })
    const result = await res.json()

    return Response.json(
      { success: result.success, error: result['error-codes']?.[0] || null },
      { headers: CORS },
    )
  },
}
