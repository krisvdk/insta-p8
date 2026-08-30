import { type NextRequest, NextResponse } from "next/server"
import { readInstagramSessionUserId } from "@/lib/instagram-session-server"
import { ensureSchema } from "@/lib/supabase-migrate"
import { getSupabaseServerClient } from "@/lib/supabase-server"
import { cancelScheduledPublish } from "@/lib/qstash"
import { removeStoredMedia } from "@/lib/instagram-publishing"

export async function GET(request: NextRequest) {
  try {
    const userId = readInstagramSessionUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Please reconnect your Instagram account" }, { status: 401 })
    }

    await ensureSchema()
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("scheduled_posts")
      .select(`
        id,
        media_type,
        media_url,
        media_items,
        caption,
        automation_template,
        automation_id,
        external_api_job_id,
        scheduled_at,
        qstash_message_id,
        status,
        attempts,
        processing_started_at,
        ig_media_id,
        permalink,
        error_message,
        published_at,
        created_at,
        updated_at
      `)
      .eq("user_id", userId)
      .order("scheduled_at", { ascending: false })
      .limit(100)

    if (error) throw error
    return NextResponse.json({ data: data || [] })
  } catch (error: any) {
    console.error("[scheduled-posts] List failed:", error)
    return NextResponse.json(
      { error: error?.message || "Could not load scheduled posts" },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  const userId = readInstagramSessionUserId(request)
  if (!userId) {
    return NextResponse.json({ error: "Please reconnect your Instagram account" }, { status: 401 })
  }

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing scheduled-post ID" }, { status: 400 })

  const supabase = await getSupabaseServerClient()
  const { data: post, error: readError } = await supabase
    .from("scheduled_posts")
    .select("id, user_id, status, qstash_message_id, media_type, media_url, media_items, external_api_job_id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle()

  if (readError) return NextResponse.json({ error: "Could not load scheduled post" }, { status: 500 })
  if (!post) return NextResponse.json({ error: "Scheduled post not found" }, { status: 404 })
  if (post.status !== "SCHEDULED") {
    return NextResponse.json(
      { error: post.status === "PROCESSING" ? "This post is already publishing" : "Only upcoming posts can be deleted" },
      { status: 409 },
    )
  }

  const claimTime = new Date().toISOString()
  const { data: claimed } = await supabase
    .from("scheduled_posts")
    .update({ status: "CANCELING", updated_at: claimTime })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "SCHEDULED")
    .select("id")
    .maybeSingle()

  if (!claimed) {
    return NextResponse.json({ error: "This post has already started publishing" }, { status: 409 })
  }

  try {
    if (post.qstash_message_id) await cancelScheduledPublish(post.qstash_message_id)

    const { error: deleteError } = await supabase
      .from("scheduled_posts")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "CANCELING")
    if (deleteError) throw deleteError

    if (post.external_api_job_id) {
      await supabase.from("external_api_jobs").update({
        status: "CANCELLED",
        error_message: null,
        updated_at: new Date().toISOString(),
      }).eq("id", post.external_api_job_id)
    }

    await removeStoredMedia(
      post.media_type === "CAROUSEL" && Array.isArray(post.media_items)
        ? post.media_items.map((item: { mediaUrl: string }) => item.mediaUrl)
        : post.media_url,
    )
    return NextResponse.json({ success: true })
  } catch (error: any) {
    await supabase.from("scheduled_posts").update({
      status: "SCHEDULED",
      error_message: error?.message || "Could not cancel scheduled post",
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("status", "CANCELING")

    return NextResponse.json(
      { error: error?.message || "Could not cancel scheduled post" },
      { status: 500 },
    )
  }
}
