import { type NextRequest, NextResponse } from "next/server"
import { readInstagramSessionUserId } from "@/lib/instagram-session-server"
import { parsePublishInput, validatePublishInput } from "@/lib/instagram-publishing"
import { buildAutomationTemplate } from "@/lib/automation-template"
import { scheduleInstagramMedia } from "@/lib/schedule-instagram"

export async function POST(request: NextRequest) {
  const userId = readInstagramSessionUserId(request)
  if (!userId) {
    return NextResponse.json({ error: "Please reconnect your Instagram account" }, { status: 401 })
  }

  const body = await request.json()
  const input = parsePublishInput(body)
  const validationError = validatePublishInput(input)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const automation = buildAutomationTemplate(body.automation)
  if (automation.error) {
    return NextResponse.json({ error: automation.error }, { status: 400 })
  }

  try {
    const result = await scheduleInstagramMedia({
      userId,
      input,
      publishAt: new Date(body.publishAt),
      automationTemplate: automation.template,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error("[schedule] QStash scheduling failed:", error)
    return NextResponse.json(
      { error: error?.message || "Could not schedule this post" },
      { status: 500 },
    )
  }
}
