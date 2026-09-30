import { createHmac } from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function decodeBase32(secret: string): Buffer {
  const clean = secret.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase()
  let bits = ''

  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char)
    if (value === -1) throw new Error(`Invalid base32 character: ${char}`)
    bits += value.toString(2).padStart(5, '0')
  }

  const bytes: number[] = []
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(parseInt(bits.slice(offset, offset + 8), 2))
  }

  return Buffer.from(bytes)
}

const TOTP_PERIOD_MS = 30_000

/**
 * Resolves just after the next 30 s TOTP window starts. The API accepts each
 * code once per account (RFC 6238 section 5.2), so a second 2FA step for the
 * same account needs a code from a later window than the previous one.
 */
export async function waitForNextTotpWindow(marginMs = 500): Promise<void> {
  const wait = TOTP_PERIOD_MS - (Date.now() % TOTP_PERIOD_MS) + marginMs
  await new Promise(resolve => setTimeout(resolve, wait))
}

export function generateTotp(secret: string, timestamp = Date.now()): string {
  const key = decodeBase32(secret)
  const counter = Math.floor(timestamp / TOTP_PERIOD_MS)
  const buffer = Buffer.alloc(8)
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  buffer.writeUInt32BE(counter & 0xffffffff, 4)

  const hmac = createHmac('sha1', key).update(buffer).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1_000_000

  return code.toString().padStart(6, '0')
}
