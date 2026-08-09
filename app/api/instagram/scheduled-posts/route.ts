import { type NextRequest, NextResponse } from "next/server"
import { readInstagramSessionUserId } from "@/lib/instagram-session-server"
import { getSupabaseServerClient } from "@/lib/supabase-server"

export async function GET(request: NextRequest) {
  try {
    const userId = readInstagramSessionUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Please reconnect your Instagram account" }, { status: 401 })
    }

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("scheduled_posts")
      .select(`
        id,
        media_type,
        media_url,
        caption,
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
