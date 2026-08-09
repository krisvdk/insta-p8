import { randomUUID } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { readInstagramSessionUserId } from "@/lib/instagram-session-server"
import { parsePublishInput, validatePublishInput } from "@/lib/instagram-publishing"
import { ensureSchema } from "@/lib/supabase-migrate"
import { getSupabaseServerClient } from "@/lib/supabase-server"
import { enqueueScheduledPublish } from "@/lib/qstash"

const MINIMUM_DELAY_MS = 30_000
const MAXIMUM_DELAY_MS = 365 * 24 * 60 * 60 * 1000

function buildAutomationTemplate(value: any): { template: any | null; error: string | null } {
  if (!value?.enabled) return { template: null, error: null }

  const normalizedKeywords: string[] = Array.isArray(value.keywords)
    ? value.keywords
      .map((keyword: any) => String(keyword).trim().toLowerCase())
      .filter(Boolean)
    : []
  const keywords = Array.from(new Set<string>(normalizedKeywords)).slice(0, 10)
  const message = typeof value.message === "string" ? value.message.trim() : ""
  const publicReply = typeof value.publicReply === "string" ? value.publicReply.trim() : ""

  if (keywords.length === 0) return { template: null, error: "Add at least one automation keyword" }
  if (keywords.some((keyword) => keyword.length > 100)) return { template: null, error: "Automation keywords must be 100 characters or fewer" }
  if (!message) return { template: null, error: "Add the DM sent by the automation" }
  if (message.length > 1000) return { template: null, error: "Automation DM must be 1,000 characters or fewer" }
  if (publicReply.length > 300) return { template: null, error: "Public reply must be 300 characters or fewer" }

  return {
    template: {
      name: `Reply to "${keywords[0]}" on scheduled post`,
      trigger_source: "comment",
      trigger_type: "keyword",
      trigger_value: keywords.join(", "),
      response_type: "pro",
      response_content: {
        message,
        reply_mode: "both",
        public_replies: [publicReply || "Sent! Check your DMs 📩"],
        check_follow: false,
      },
    },
    error: null,
  }
}

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

  const scheduledAt = new Date(body.publishAt)
  const delay = scheduledAt.getTime() - Date.now()
  if (!Number.isFinite(scheduledAt.getTime()) || delay < MINIMUM_DELAY_MS) {
    return NextResponse.json({ error: "Choose a time at least 30 seconds from now" }, { status: 400 })
  }
  if (delay > MAXIMUM_DELAY_MS) {
    return NextResponse.json({ error: "Posts can be scheduled up to one year ahead" }, { status: 400 })
  }

  const automation = buildAutomationTemplate(body.automation)
  if (automation.error) {
    return NextResponse.json({ error: automation.error }, { status: 400 })
  }

  await ensureSchema()
  const supabase = await getSupabaseServerClient()
  const scheduledPostId = randomUUID()
  const now = new Date().toISOString()
  const { error: insertError } = await supabase.from("scheduled_posts").insert({
    id: scheduledPostId,
    user_id: userId,
    media_type: input.mediaType,
    media_url: input.mediaUrl,
    media_items: input.mediaType === "CAROUSEL" ? input.mediaItems : null,
    caption: input.caption,
    automation_template: automation.template,
    scheduled_at: scheduledAt.toISOString(),
    status: "SCHEDULED",
    created_at: now,
    updated_at: now,
  })

  if (insertError) {
    console.error("[schedule] Could not create scheduled post:", insertError)
    return NextResponse.json(
      { error: "Scheduled-post storage is not ready. Apply the latest schema.sql in Supabase." },
      { status: 500 },
    )
  }

  try {
    const message = await enqueueScheduledPublish({
      scheduledPostId,
      notBefore: Math.floor(scheduledAt.getTime() / 1000),
    })

    await supabase
      .from("scheduled_posts")
      .update({ qstash_message_id: message.messageId, updated_at: new Date().toISOString() })
      .eq("id", scheduledPostId)

    return NextResponse.json({
      success: true,
      scheduledPostId,
      messageId: message.messageId,
      scheduledAt: scheduledAt.toISOString(),
    })
  } catch (error: any) {
    await supabase.from("scheduled_posts").delete().eq("id", scheduledPostId)
    console.error("[schedule] QStash scheduling failed:", error)
    return NextResponse.json(
      { error: error?.message || "Could not schedule this post" },
      { status: 500 },
    )
  }
}
