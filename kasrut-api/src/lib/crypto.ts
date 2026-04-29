import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES   = 12  // 96-bit IV — recommended for GCM
const TAG_BYTES  = 16

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY ?? ''
  if (hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Encrypts plaintext with AES-256-GCM.
 * Output format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encrypt(plaintext: string): string {
  const key    = getKey()
  const iv     = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

/**
 * Decrypts a value produced by encrypt().
 * Returns null if decryption fails (wrong key, tampered data).
 */
export function decrypt(encoded: string): string | null {
  try {
    const parts = encoded.split(':')
    if (parts.length !== 3) return null
    const [ivB64, tagB64, encB64] = parts
    const key     = getKey()
    const iv      = Buffer.from(ivB64,  'base64')
    const tag     = Buffer.from(tagB64, 'base64')
    const enc     = Buffer.from(encB64, 'base64')
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(enc).toString('utf8') + decipher.final('utf8')
  } catch { return null }
}

/** Returns true if the string looks like an encrypted blob (not a plaintext TOTP secret). */
export function isEncrypted(value: string): boolean {
  return value.split(':').length === 3
}
