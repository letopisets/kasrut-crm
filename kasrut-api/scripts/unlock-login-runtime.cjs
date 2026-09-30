// Lifts the per-account login lock (src/lib/loginThrottle.ts) on one account,
// e.g. an owner locked out by someone guessing at their email. Runs with plain
// `node` inside the running PROD api container, requiring the COMPILED modules
// from dist (same approach as regeocode-runtime.cjs), so the key is derived
// exactly as the API derives it:
//
//   docker cp kasrut-api/scripts/unlock-login-runtime.cjs <api-container>:/app/kasrut-api/unlock-login-runtime.cjs
//   docker compose ... exec -T api node unlock-login-runtime.cjs crm owner@example.com
//
// Scopes: crm (CRM password step, and the /2fa/setup password re-check) and
// map (map password login) take the account email; crm-2fa (the CRM 2FA step:
// /2fa/verify, /2fa/verify-backup, /2fa/enable and /2fa/disable) takes the CRM
// user id. See docs/deployment/hetzner.md#login-lockout. Only Redis is cleared: failures the API
// counted in its in-process fallback store while Redis was down are carried
// into Redis on the next attempt, so if Redis was unavailable during the
// attack, restart the api container as well.
const B = './dist/kasrut-api/src'
const { loginThrottleKey, checkLocked } = require(B + '/lib/loginThrottle.js')
const { redis } = require(B + '/lib/redis.js')

const SCOPES = ['crm', 'crm-2fa', 'map']

function waitForRedis(timeoutMs) {
  if (redis.status === 'ready') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Redis not ready after ' + timeoutMs + ' ms')), timeoutMs)
    redis.once('ready', () => { clearTimeout(timer); resolve() })
  })
}

async function main() {
  const [scope, identifier] = process.argv.slice(2)
  if (!SCOPES.includes(scope) || !identifier) {
    console.error('usage: node unlock-login-runtime.cjs <' + SCOPES.join('|') + '> <email or CRM user id>')
    process.exit(2)
  }

  await waitForRedis(10000)
  const before = await checkLocked(scope, identifier)
  const removed = await redis.del(loginThrottleKey(scope, identifier))
  console.log(removed
    ? 'Cleared the ' + scope + ' failure count' + (before.locked ? ' (was locked for another ' + before.retryAfterSec + ' s).' : '.')
    : 'No ' + scope + ' failures recorded for that identifier.')
  await redis.quit()
}

main().catch(e => { console.error(e.message); process.exit(1) })
