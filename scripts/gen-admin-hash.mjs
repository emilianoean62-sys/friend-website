// Generate PBKDF2 hash for a password using same algorithm as src/lib/auth.ts
import { webcrypto } from 'node:crypto'
const crypto = webcrypto

function b64u(buf) {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return Buffer.from(s, 'binary').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const km = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password),
    { name: 'PBKDF2' }, false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    km, 256
  )
  return `${b64u(salt.buffer)}.${b64u(bits)}`
}

const password = process.argv[2] || 'admin123'
const hash = await hashPassword(password)
console.log(`Password: ${password}`)
console.log(`Hash:     ${hash}`)
console.log()
console.log(`-- SQL:`)
console.log(`INSERT INTO users (email, username, password_hash, role) VALUES ('admin@aniverse.app', 'admin', '${hash}', 'ADMIN');`)
console.log(`INSERT INTO users (email, username, password_hash, role) VALUES ('demo@aniverse.app', 'demo', '${hash}', 'USER');`)
