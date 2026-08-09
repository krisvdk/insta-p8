import { type NextRequest, NextResponse } from "next/server"
import { publishInstagramMedia, removeStoredMedia } from "@/lib/instagram-publishing"
import { getScheduledPublishUrl, verifyQStashRequest } from "@/lib/qstash"
import { getSupabaseServerClient } from "@/lib/supabase-server"

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  let destination: string

  try {
    destination = getScheduledPublishUrl()
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Scheduler is not configured" }, { status: 500 })
  }

  if (!verifyQStashRequest(request.headers.get("upstash-signature"), rawBody, destination)) {
    return NextResponse.json({ error: "Invalid QStash signature" }, { status: 401 })
  }

  let scheduledPostId: string
  try {
    scheduledPostId = String(JSON.parse(rawBody).scheduledPostId || "")
  } catch {
    return NextResponse.json({ error: "Invalid scheduled-post payload" }, { status: 400 })
  }
  if (!scheduledPostId) {
    return NextResponse.json({ error: "Missing scheduled-post ID" }, { status: 400 })
  }

  const supabase = await getSupabaseServerClient()
  const { data: job, error: jobError } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("id", scheduledPostId)
    .single()

  if (jobError || !job) return NextResponse.json({ error: "Scheduled post not found" }, { status: 404 })
  if (job.status === "PUBLISHED") {
    return NextResponse.json({ success: true, duplicate: true, mediaId: job.ig_media_id })
  }
  if (new Date(job.scheduled_at).getTime() > Date.now() + 5_000) {
    return NextResponse.json({ error: "Scheduled time has not arrived" }, { status: 425 })
  }

  const processingStartedAt = job.processing_started_at
    ? new Date(job.processing_started_at).getTime()
    : 0
  if (job.status === "PROCESSING" && Date.now() - processingStartedAt < 2 * 60 * 1000) {
    return NextResponse.json({ error: "Scheduled post is already processing" }, { status: 409 })
  }

  const claimTime = new Date().toISOString()
  const { data: claimed } = await supabase
    .from("scheduled_posts")
    .update({
      status: "PROCESSING",
      processing_started_at: claimTime,
      attempts: Number(job.attempts || 0) + 1,
      error_message: null,
      updated_at: claimTime,
    })
    .eq("id", scheduledPostId)
    .eq("updated_at", job.updated_at)
    .select("id")
    .maybeSingle()

  if (!claimed) {
    return NextResponse.json({ error: "Scheduled post was claimed by another delivery" }, { status: 409 })
  }

  try {
    const result = await publishInstagramMedia(String(job.user_id), {
      mediaType: job.media_type,
      mediaUrl: job.media_url,
      caption: job.caption || "",
    })

    await supabase
      .from("scheduled_posts")
      .update({
        status: "PUBLISHED",
        ig_container_id: result.containerId,
        ig_media_id: result.mediaId,
        permalink: result.permalink,
        published_at: result.timestamp,
        updated_at: new Date().toISOString(),
      })
      .eq("id", scheduledPostId)

    await removeStoredMedia(job.media_url)
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    await supabase
      .from("scheduled_posts")
      .update({
        status: "SCHEDULED",
        processing_started_at: null,
        error_message: error?.message || "Instagram publishing failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", scheduledPostId)

    console.error("[schedule] Scheduled Instagram publishing failed:", error)
    return NextResponse.json(
      { error: error?.message || "Scheduled Instagram publishing failed" },
      { status: 500 },
    )
  }
}
