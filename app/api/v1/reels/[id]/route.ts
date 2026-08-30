import { type NextRequest, NextResponse } from "next/server"
import { authenticateExternalApi, isExternalApiConfigured } from "@/lib/api-auth"
import { getSupabaseServerClient } from "@/lib/supabase-server"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isExternalApiConfigured()) {
    return NextResponse.json({ success: false, error: "EXTERNAL_API_KEY is not configured" }, { status: 503 })
  }
  if (!authenticateExternalApi(request)) {
    return NextResponse.json({ success: false, error: "Invalid API key" }, { status: 401 })
  }

  const { id } = await context.params
  const supabase = await getSupabaseServerClient()
  const { data: job } = await supabase.from("external_api_jobs").select("*").eq("id", id).maybeSingle()
  if (!job) return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 })

  return NextResponse.json({
    success: true,
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
  })
}
