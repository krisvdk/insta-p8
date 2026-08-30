const ADMIN_COOKIE = "insta_admin_session"
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30

export const adminCookieName = ADMIN_COOKIE
export const adminSessionMaxAge = SESSION_LIFETIME_SECONDS

function signingSecret(): string | null {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_CODE || null
}

function bytes(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer as ArrayBuffer
}

function toBase64Url(value: ArrayBuffer): string {
  let binary = ""
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function hmac(value: string): Promise<string | null> {
  const secret = signingSecret()
  if (!secret) return null
  const key = await crypto.subtle.importKey(
    "raw",
    bytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  return toBase64Url(await crypto.subtle.sign("HMAC", key, bytes(value)))
}

export async function createAdminSession(): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS
  const payload = `v1.${expiresAt}.${crypto.randomUUID()}`
  const signature = await hmac(payload)
  if (!signature) throw new Error("ADMIN_CODE is not configured")
  return `${payload}.${signature}`
}

export async function verifyAdminSession(token?: string | null): Promise<boolean> {
  if (!token) return false
  const parts = token.split(".")
  if (parts.length !== 4 || parts[0] !== "v1") return false
  const expiresAt = Number(parts[1])
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false

  const payload = parts.slice(0, 3).join(".")
  const expected = await hmac(payload)
  if (!expected || expected.length !== parts[3].length) return false

  let mismatch = 0
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ parts[3].charCodeAt(index)
  }
  return mismatch === 0
}

export async function adminCodeMatches(candidate: string): Promise<boolean> {
  const expected = process.env.ADMIN_CODE
  if (!expected || !candidate || expected.length !== candidate.length) return false
  const [candidateHash, expectedHash] = await Promise.all([hmac(candidate), hmac(expected)])
  if (!candidateHash || !expectedHash || candidateHash.length !== expectedHash.length) return false
  let mismatch = 0
  for (let index = 0; index < candidateHash.length; index += 1) {
    mismatch |= candidateHash.charCodeAt(index) ^ expectedHash.charCodeAt(index)
  }
  return mismatch === 0
}
