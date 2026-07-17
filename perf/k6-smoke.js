import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  scenarios: {
    api_smoke: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 20),
      duration: __ENV.DURATION || '1m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
  },
}

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:8787'

export default function () {
  const responses = http.batch([
    ['GET', `${baseUrl}/health/live`],
    ['GET', `${baseUrl}/health/ready`],
    ['GET', `${baseUrl}/api/domains`],
  ])
  responses.forEach((response) => check(response, { 'status is 200': (value) => value.status === 200 }))
  sleep(0.2)
}
