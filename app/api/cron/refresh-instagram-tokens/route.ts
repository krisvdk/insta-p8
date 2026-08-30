import { timingSafeEqual } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { refreshExpiringInstagramTokens } from "@/lib/instagram-token-refresh"

export const maxDuration = 300

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  const authorization = request.headers.get("authorization")
  if (!cronSecret || !authorization?.startsWith("Bearer ")) return false

  const received = Buffer.from(authorization.slice("Bearer ".length))
  const expected = Buffer.from(cronSecret)
  return received.length === expected.length && timingSafeEqual(received, expected)
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await refreshExpiringInstagramTokens()
    return NextResponse.json(
      { success: result.failed === 0, ...result },
      { status: result.failed === 0 ? 200 : 500 },
    )
  } catch (error) {
    console.error("[instagram-token-refresh] Scheduled refresh failed:", error)
    return NextResponse.json(
      { error: "Instagram token refresh job failed" },
      { status: 500 },
    )
  }
}
