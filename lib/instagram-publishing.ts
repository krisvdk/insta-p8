import { getSupabaseServerClient } from "@/lib/supabase-server"

const GRAPH = "https://graph.instagram.com/v24.0"
export const MAX_CAPTION_LENGTH = 2200

export type InstagramPublishType = "IMAGE" | "REELS"

export type InstagramPublishInput = {
  mediaType: InstagramPublishType
  mediaUrl: string
  caption: string
}

type GraphResult = {
  id?: string
  status_code?: string
  status?: string
  permalink?: string
  media_type?: string
  media_product_type?: string
  timestamp?: string
  error?: { message?: string }
}

export type InstagramPublishResult = {
  mediaId: string
  containerId: string
  permalink: string | null
  mediaType: string
  timestamp: string
}

export function parsePublishInput(body: any): InstagramPublishInput {
  return {
    mediaType: body?.mediaType,
    mediaUrl: typeof body?.mediaUrl === "string" ? body.mediaUrl.trim() : "",
    caption: typeof body?.caption === "string" ? body.caption.trim() : "",
  }
}

export function validatePublishInput(input: InstagramPublishInput): string | null {
  if (input.mediaType !== "IMAGE" && input.mediaType !== "REELS") {
    return "Choose an image post or Reel"
  }
  if (!isAllowedStorageUrl(input.mediaUrl)) {
    return "Upload the media through insta-p8 before publishing"
  }
  if (input.caption.length > MAX_CAPTION_LENGTH) {
    return `Caption must be ${MAX_CAPTION_LENGTH} characters or fewer`
  }
  return null
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

export async function publishInstagramMedia(
  userId: string,
  input: InstagramPublishInput,
): Promise<InstagramPublishResult> {
  const validationError = validatePublishInput(input)
  if (validationError) throw new Error(validationError)

  const supabase = await getSupabaseServerClient()
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, access_token, business_account_id, token_expires_at")
    .eq("id", userId)
    .single()

  if (userError || !user?.access_token) throw new Error("Instagram is not connected")
  if (user.token_expires_at && new Date(user.token_expires_at).getTime() <= Date.now()) {
    throw new Error("Your Instagram session expired. Please reconnect it.")
  }

  const igUserId = String(user.business_account_id || user.id)
  const containerParams: Record<string, string> = input.caption ? { caption: input.caption } : {}

  if (input.mediaType === "IMAGE") {
    containerParams.image_url = input.mediaUrl
  } else {
    containerParams.media_type = "REELS"
    containerParams.video_url = input.mediaUrl
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

  return {
    mediaId: published.id,
    containerId: container.id,
    permalink: details.permalink || null,
    mediaType: details.media_product_type || details.media_type || input.mediaType,
    timestamp: details.timestamp || new Date().toISOString(),
  }
}

export async function removeStoredMedia(mediaUrl: string): Promise<void> {
  try {
    const marker = "/storage/v1/object/public/reels/"
    const pathname = new URL(mediaUrl).pathname
    const index = pathname.indexOf(marker)
    if (index < 0) return

    const storagePath = decodeURIComponent(pathname.slice(index + marker.length))
    if (!storagePath) return

    const supabase = await getSupabaseServerClient()
    await supabase.storage.from("reels").remove([storagePath])
  } catch (error) {
    console.warn("[publish] Could not remove temporary media:", error)
  }
}
