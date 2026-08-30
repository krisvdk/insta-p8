import { randomUUID } from "node:crypto"
import type { AutomationTemplate } from "@/lib/automation-template"
import type { InstagramPublishInput } from "@/lib/instagram-publishing"
import { validatePublishInput } from "@/lib/instagram-publishing"
import { ensureSchema } from "@/lib/supabase-migrate"
import { getSupabaseServerClient } from "@/lib/supabase-server"
import { enqueueScheduledPublish } from "@/lib/qstash"

export const MINIMUM_SCHEDULE_DELAY_MS = 30_000
export const MAXIMUM_SCHEDULE_DELAY_MS = 365 * 24 * 60 * 60 * 1000

export async function scheduleInstagramMedia(params: {
  userId: string
  input: InstagramPublishInput
  publishAt: Date
  automationTemplate?: AutomationTemplate | null
  allowExternalMedia?: boolean
  externalApiJobId?: string | null
}) {
  const validationError = validatePublishInput(params.input, { allowExternalMedia: params.allowExternalMedia })
  if (validationError) throw new Error(validationError)

  const delay = params.publishAt.getTime() - Date.now()
  if (!Number.isFinite(params.publishAt.getTime()) || delay < MINIMUM_SCHEDULE_DELAY_MS) {
    throw new Error("Choose a time at least 30 seconds from now")
  }
  if (delay > MAXIMUM_SCHEDULE_DELAY_MS) throw new Error("Posts can be scheduled up to one year ahead")

  await ensureSchema()
  const supabase = await getSupabaseServerClient()
  const scheduledPostId = randomUUID()
  const now = new Date().toISOString()
  const { error: insertError } = await supabase.from("scheduled_posts").insert({
    id: scheduledPostId,
    user_id: params.userId,
    media_type: params.input.mediaType,
    media_url: params.input.mediaUrl,
    media_items: params.input.mediaType === "CAROUSEL" ? params.input.mediaItems : null,
    caption: params.input.caption,
    automation_template: params.automationTemplate || null,
    allow_external_media: params.allowExternalMedia === true,
    external_api_job_id: params.externalApiJobId || null,
    scheduled_at: params.publishAt.toISOString(),
    status: "SCHEDULED",
    created_at: now,
    updated_at: now,
  })
  if (insertError) throw new Error(`Could not store scheduled post: ${insertError.message}`)

  try {
    const message = await enqueueScheduledPublish({
      scheduledPostId,
      notBefore: Math.floor(params.publishAt.getTime() / 1000),
    })
    await supabase.from("scheduled_posts")
      .update({ qstash_message_id: message.messageId, updated_at: new Date().toISOString() })
      .eq("id", scheduledPostId)
    return { scheduledPostId, messageId: message.messageId, scheduledAt: params.publishAt.toISOString() }
  } catch (error) {
    await supabase.from("scheduled_posts").delete().eq("id", scheduledPostId)
    throw error
  }
}
