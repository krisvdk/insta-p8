import { type NextRequest, NextResponse } from "next/server"
import { readInstagramSessionUserId } from "@/lib/instagram-session-server"
import {
  parsePublishInput,
  publishInstagramMedia,
  validatePublishInput,
} from "@/lib/instagram-publishing"

export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const userId = readInstagramSessionUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Please reconnect your Instagram account" }, { status: 401 })
    }

    const input = parsePublishInput(await request.json())
    const validationError = validatePublishInput(input)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const result = await publishInstagramMedia(userId, input)
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error("[publish] Instagram publishing failed:", error)
    return NextResponse.json(
      { error: error?.message || "Could not publish to Instagram" },
      { status: 500 },
    )
  }
}
