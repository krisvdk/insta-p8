import type { NextRequest } from "next/server"

export function readInstagramSessionUserId(request: NextRequest): string | null {
  const raw = request.cookies.get("insta_session")?.value
  if (!raw) return null

  const values = [raw]
  try {
    values.push(decodeURIComponent(raw))
  } catch {
    // The cookie was already decoded.
  }

  for (const value of values) {
    try {
      const parsed = JSON.parse(value)
      if (parsed?.userId) return String(parsed.userId)
    } catch {
      // Try the next representation.
    }
  }

  return null
}
