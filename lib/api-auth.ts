import { createHash, timingSafeEqual } from "node:crypto"
import type { NextRequest } from "next/server"

function configuredApiKey(): string | null {
  return process.env.EXTERNAL_API_KEY || process.env.API_SECRET_KEY || null
}

export function isExternalApiConfigured(): boolean {
  return Boolean(configuredApiKey())
}

export function authenticateExternalApi(request: NextRequest): boolean {
  const configured = configuredApiKey()
  if (!configured) return false

  const authorization = request.headers.get("authorization")
  const candidate = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : request.headers.get("x-api-key")?.trim()
  if (!candidate) return false

  const expectedHash = createHash("sha256").update(configured).digest()
  const candidateHash = createHash("sha256").update(candidate).digest()
  return timingSafeEqual(expectedHash, candidateHash)
}
