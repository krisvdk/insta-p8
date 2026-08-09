import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase-server"

export const maxDuration = 60

const GRAPH = "https://graph.instagram.com/v24.0"
const MAX_CAPTION_LENGTH = 2200

type PublishType = "IMAGE" | "REELS"

type GraphResult = {
  id?: string
  status_code?: string
  status?: string
  permalink?: string
  media_type?: string
  media_product_type?: string
  timestamp?: string
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
  }
}

function readSessionUserId(request: NextRequest): string | null {
  const raw = request.cookies.get("insta_session")?.value
  if (!raw) return null

  for (const value of [raw, (() => {
    try { return decodeURIComponent(raw) } catch { return raw }
  })()]) {
    try {
      const parsed = JSON.parse(value)
      if (parsed?.userId) return String(parsed.userId)
    } catch {
      // Try the decoded cookie value next.
    }
  }

  return null
}

function graphError(result: GraphResult, fallback: string) {
  return result.error?.message || result.status || fallback
}

async function graphPost(path: string, token: string, params: Record<string, string>): Promise<GraphResult> {
  const response = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
    cache: "no-store",
  })

  const result = await response.json() as GraphResult
  if (!response.ok || result.error) {
    throw new Error(graphError(result, "Instagram rejected the publishing request"))
  }
  return result
}

async function graphGet(path: string, token: string, fields: string): Promise<GraphResult> {
  const url = new URL(`${GRAPH}/${path}`)
  url.searchParams.set("fields", fields)

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  const result = await response.json() as GraphResult
  if (!response.ok || result.error) {
    throw new Error(graphError(result, "Instagram could not process the media"))
  }
  return result
}

function isAllowedStorageUrl(value: string): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return false

  try {
    const mediaUrl = new URL(value)
    const storageUrl = new URL(supabaseUrl)
    return mediaUrl.protocol === "https:" &&
      mediaUrl.origin === storageUrl.origin &&
      mediaUrl.pathname.startsWith("/storage/v1/object/public/reels/")
  } catch {
    return false
  }
}

async function waitForContainer(containerId: string, token: string): Promise<void> {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const result = await graphGet(containerId, token, "status_code,status")
    const status = result.status_code?.toUpperCase()

    if (status === "FINISHED") return
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(result.status || `Instagram container ${status.toLowerCase()}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  throw new Error("Instagram is still processing this media. Please try again in a moment.")
}

export async function POST(request: NextRequest) {
  try {
    const sessionUserId = readSessionUserId(request)
    if (!sessionUserId) {
      return NextResponse.json({ error: "Please reconnect your Instagram account" }, { status: 401 })
    }

    const body = await request.json()
    const mediaType = body.mediaType as PublishType
    const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl.trim() : ""
    const caption = typeof body.caption === "string" ? body.caption.trim() : ""

    if (mediaType !== "IMAGE" && mediaType !== "REELS") {
      return NextResponse.json({ error: "Choose an image post or Reel" }, { status: 400 })
    }
    if (!isAllowedStorageUrl(mediaUrl)) {
      return NextResponse.json({ error: "Upload the media through insta-p8 before publishing" }, { status: 400 })
    }
    if (caption.length > MAX_CAPTION_LENGTH) {
      return NextResponse.json({ error: `Caption must be ${MAX_CAPTION_LENGTH} characters or fewer` }, { status: 400 })
    }

    const supabase = await getSupabaseServerClient()
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, access_token, business_account_id, token_expires_at")
      .eq("id", sessionUserId)
      .single()

    if (userError || !user?.access_token) {
      return NextResponse.json({ error: "Instagram is not connected" }, { status: 401 })
    }
    if (user.token_expires_at && new Date(user.token_expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "Your Instagram session expired. Please reconnect it." }, { status: 401 })
    }

    const igUserId = String(user.business_account_id || user.id)
    const containerParams: Record<string, string> = caption ? { caption } : {}

    if (mediaType === "IMAGE") {
      containerParams.image_url = mediaUrl
    } else {
      containerParams.media_type = "REELS"
      containerParams.video_url = mediaUrl
      containerParams.share_to_feed = "true"
    }

    const container = await graphPost(`${igUserId}/media`, user.access_token, containerParams)
    if (!container.id) throw new Error("Instagram did not return a media container ID")

    await waitForContainer(container.id, user.access_token)

    const published = await graphPost(`${igUserId}/media_publish`, user.access_token, {
      creation_id: container.id,
    })
    if (!published.id) throw new Error("Instagram did not return a published media ID")

    let details: GraphResult = {}
    try {
      details = await graphGet(
        published.id,
        user.access_token,
        "id,permalink,media_type,media_product_type,timestamp",
      )
    } catch {
      // Publishing succeeded; permalink metadata can take a moment to appear.
    }

    return NextResponse.json({
      success: true,
      mediaId: published.id,
      containerId: container.id,
      permalink: details.permalink || null,
      mediaType: details.media_product_type || details.media_type || mediaType,
      timestamp: details.timestamp || new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("[publish] Instagram publishing failed:", error)
    return NextResponse.json(
      { error: error?.message || "Could not publish to Instagram" },
      { status: 500 },
    )
  }
}
