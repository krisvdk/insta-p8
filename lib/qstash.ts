import { createHash, createHmac, timingSafeEqual } from "node:crypto"

const QSTASH_PUBLISH_URL = "https://qstash.upstash.io/v2/publish"

type QStashClaims = {
  iss?: string
  sub?: string
  exp?: number
  nbf?: number
  body?: string
}

export function getScheduledPublishUrl(): string {
  const raw = process.env.APP_URL
  if (!raw) throw new Error("APP_URL is not configured")

  const appUrl = new URL(raw)
  if (appUrl.protocol !== "https:") throw new Error("APP_URL must use HTTPS")
  return `${appUrl.origin}/api/instagram/publish/scheduled`
}

export async function enqueueScheduledPublish(params: {
  scheduledPostId: string
  notBefore: number
}): Promise<{ messageId: string }> {
  const token = process.env.QSTASH_TOKEN
  if (!token) throw new Error("QSTASH_TOKEN is not configured")

  const destination = getScheduledPublishUrl()
  const response = await fetch(`${QSTASH_PUBLISH_URL}/${destination}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Upstash-Not-Before": String(params.notBefore),
      "Upstash-Retries": "3",
      "Upstash-Timeout": "300s",
      "Upstash-Label": "instagram-scheduled-post",
    },
    body: JSON.stringify({ scheduledPostId: params.scheduledPostId }),
    cache: "no-store",
  })

  const result = await response.json()
  if (!response.ok || !result.messageId) {
    throw new Error(result.error || result.message || "QStash could not schedule this post")
  }

  return { messageId: result.messageId }
}

export async function cancelScheduledPublish(messageId: string): Promise<void> {
  const token = process.env.QSTASH_TOKEN
  if (!token) throw new Error("QSTASH_TOKEN is not configured")
  if (!messageId) throw new Error("Scheduled message ID is missing")

  const response = await fetch(`${QSTASH_PUBLISH_URL.replace("/publish", "/messages")}/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })

  // A missing message has already left QStash. The database claim below still
  // prevents a delivery that was already in flight from publishing it.
  if (response.status === 404) return
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(result.error || result.message || "QStash could not cancel this scheduled post")
  }
}

function verifyWithKey(signature: string, signingKey: string, body: string, url: string): void {
  const parts = signature.split(".")
  if (parts.length !== 3) throw new Error("Invalid QStash signature")

  const [headerPart, payloadPart, signaturePart] = parts
  const expected = createHmac("sha256", signingKey)
    .update(`${headerPart}.${payloadPart}`)
    .digest()
  const received = Buffer.from(signaturePart, "base64url")

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new Error("Invalid QStash signature")
  }

  const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8"))
  const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as QStashClaims
  const now = Math.floor(Date.now() / 1000)

  if (header.alg !== "HS256" || claims.iss !== "Upstash") throw new Error("Invalid QStash token")
  if (claims.sub !== url) throw new Error("QStash destination does not match")
  if (!claims.exp || now > claims.exp) throw new Error("QStash token expired")
  if (!claims.nbf || now < claims.nbf) throw new Error("QStash token is not active")

  const bodyHash = createHash("sha256").update(body).digest("base64url")
  if (claims.body?.replace(/=+$/, "") !== bodyHash) throw new Error("QStash body hash does not match")
}

export function verifyQStashRequest(signature: string | null, body: string, url: string): boolean {
  if (!signature) return false

  const keys = [
    process.env.QSTASH_CURRENT_SIGNING_KEY,
    process.env.QSTASH_NEXT_SIGNING_KEY,
  ].filter((value): value is string => Boolean(value))

  for (const key of keys) {
    try {
      verifyWithKey(signature, key, body, url)
      return true
    } catch {
      // Try the next key to support seamless signing-key rotation.
    }
  }
  return false
}
