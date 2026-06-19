/**
 * k6 smoke / load test for the kasrut API.
 *
 * Usage:
 *   k6 run k6/smoke.js                       # defaults to localhost
 *   API_URL=https://api.mykoshermap.com k6 run k6/smoke.js
 *
 * Passing thresholds: p95 < 500 ms, error rate < 1 %.
 */
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '30s', target: 20 }, // ramp up
    { duration: '1m',  target: 20 }, // steady
    { duration: '15s', target: 0  }, // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed:   ['rate<0.01'],
  },
}

const BASE = (__ENV.API_URL || 'http://localhost:8080').replace(/\/$/, '')

export default function () {
  const endpoints = [
    `${BASE}/health`,
    `${BASE}/api/map/restaurants?city=%D7%99%D7%A8%D7%95%D7%A9%D7%9C%D7%99%D7%9D`,
    `${BASE}/api/map/hechsherim`,
    `${BASE}/api/map/options`,
  ]

  const url = endpoints[Math.floor(Math.random() * endpoints.length)]
  const res = http.get(url, { timeout: '5s' })

  check(res, {
    'status 2xx': r => r.status >= 200 && r.status < 300,
  })

  sleep(1)
}
