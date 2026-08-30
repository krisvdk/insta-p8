import { randomUUID } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { authenticateExternalApi, isExternalApiConfigured } from "@/lib/api-auth"
import { buildAutomationTemplate, createAutomationForMedia } from "@/lib/automation-template"
import {
  isPublicHttpsUrl,
  MAX_CAPTION_LENGTH,
  publishInstagramMedia,
  type InstagramPublishInput,
} from "@/lib/instagram-publishing"
import { scheduleInstagramMedia } from "@/lib/schedule-instagram"
import { ensureSchema } from "@/lib/supabase-migrate"
import { getSupabaseServerClient } from "@/lib/supabase-server"

export const maxDuration = 300

function apiError(error: string, status: number, details?: unknown) {
  return NextResponse.json({ success: false, error, ...(details ? { details } : {}) }, { status })
}

function publicJob(job: any) {
  return {
    jobId: job.id,
    status: job.status,
    scheduledPostId: job.scheduled_post_id || null,
    mediaId: job.ig_media_id || null,
    permalink: job.permalink || null,
    automationId: job.automation_id || null,
    error: job.error_message || null,
    result: job.result || null,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  }
}

export async function POST(request: NextRequest) {
  if (!isExternalApiConfigured()) return apiError("EXTERNAL_API_KEY is not configured", 503)
  if (!authenticateExternalApi(request)) return apiError("Invalid API key", 401)

  const contentLength = Number(request.headers.get("content-length") || 0)
  if (contentLength > 128_000) return apiError("Request body is too large", 413)

  let body: any
  try {
    body = await request.json()
  } catch {
    return apiError("Body must be valid JSON", 400)
  }

  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : ""
  const caption = typeof body.caption === "string" ? body.caption.trim() : ""
  const userId = String(body.userId || process.env.EXTERNAL_API_INSTAGRAM_USER_ID || "").trim()
  const idempotencyKey = String(
    request.headers.get("idempotency-key") || body.externalId || randomUUID(),
  ).trim()

  if (!/^\d+$/.test(userId)) return apiError("Provide userId or configure EXTERNAL_API_INSTAGRAM_USER_ID", 400)
  if (!isPublicHttpsUrl(videoUrl)) return apiError("videoUrl must be a public HTTPS URL", 400)
  if (caption.length > MAX_CAPTION_LENGTH) return apiError(`caption must be ${MAX_CAPTION_LENGTH} characters or fewer`, 400)
  if (!idempotencyKey || idempotencyKey.length > 200) return apiError("Idempotency-Key must be 1–200 characters", 400)

  const automation = buildAutomationTemplate(body.automation)
  if (automation.error) return apiError(automation.error, 400)

  const publishAt = body.publishAt ? new Date(body.publishAt) : null
  if (publishAt && !Number.isFinite(publishAt.getTime())) return apiError("publishAt must be a valid ISO-8601 date", 400)

  await ensureSchema()
  const supabase = await getSupabaseServerClient()
  const { data: account } = await supabase.from("users").select("id, username").eq("id", userId).maybeSingle()
  if (!account) return apiError("Instagram account is not connected", 404)

  const jobId = randomUUID()
  const now = new Date().toISOString()
  const safeRequest = {
    videoUrl,
    caption,
    publishAt: publishAt?.toISOString() || null,
    automation: body.automation || null,
  }
  const { data: claimed, error: claimError } = await supabase.from("external_api_jobs").insert({
    id: jobId,
    idempotency_key: idempotencyKey,
    user_id: userId,
    request: safeRequest,
    status: "RECEIVED",
    created_at: now,
    updated_at: now,
  }).select("*").maybeSingle()

  if (claimError || !claimed) {
    const { data: existing } = await supabase.from("external_api_jobs")
      .select("*").eq("idempotency_key", idempotencyKey).maybeSingle()
    if (existing) return NextResponse.json({ success: true, duplicate: true, ...publicJob(existing) })
    return apiError("Could not create API job", 500, claimError?.message)
  }

  const input: InstagramPublishInput = { mediaType: "REELS", mediaUrl: videoUrl, mediaItems: [], caption }
  try {
    if (publishAt) {
      const scheduled = await scheduleInstagramMedia({
        userId,
        input,
        publishAt,
        automationTemplate: automation.template,
        allowExternalMedia: true,
        externalApiJobId: jobId,
      })
      const result = { delivery: "scheduled", ...scheduled }
      const { data: updated } = await supabase.from("external_api_jobs").update({
        status: "SCHEDULED",
        scheduled_post_id: scheduled.scheduledPostId,
        result,
        updated_at: new Date().toISOString(),
      }).eq("id", jobId).select("*").single()
      return NextResponse.json({ success: true, ...publicJob(updated) }, { status: 202 })
    }

    await supabase.from("external_api_jobs").update({ status: "PROCESSING", updated_at: new Date().toISOString() }).eq("id", jobId)
    const published = await publishInstagramMedia(userId, input, { allowExternalMedia: true })
    let automationId: string | null = null
    let automationError: string | null = null
    if (automation.template) {
      try {
        automationId = await createAutomationForMedia(userId, published.mediaId, automation.template)
      } catch (error: any) {
        automationError = error?.message || "Could not create automation"
      }
    }

    const result = { delivery: "published", ...published, automationId, automationError }
    const { data: updated } = await supabase.from("external_api_jobs").update({
      status: automationError ? "PUBLISHED_WITH_WARNING" : "PUBLISHED",
      ig_media_id: published.mediaId,
      permalink: published.permalink,
      automation_id: automationId,
      error_message: automationError,
      result,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId).select("*").single()
    return NextResponse.json({ success: true, ...publicJob(updated) }, { status: 201 })
  } catch (error: any) {
    const message = error?.message || "Could not process Reel"
    await supabase.from("external_api_jobs").update({
      status: "FAILED",
      error_message: message,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId)
    return apiError(message, 500, { jobId })
  }
}
