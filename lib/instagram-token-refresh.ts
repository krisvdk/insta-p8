import { getSupabaseAdmin } from "@/lib/supabase-admin"

const REFRESH_ENDPOINT = "https://graph.instagram.com/refresh_access_token"
const DEFAULT_EXPIRES_IN_SECONDS = 60 * 24 * 60 * 60

export const INSTAGRAM_TOKEN_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

type InstagramTokenRecord = {
  id: string | number
  access_token: string
  token_expires_at: string | null
}

type RefreshResponse = {
  access_token?: string
  expires_in?: number
  error?: {
    message?: string
    type?: string
    code?: number
  }
}

export type RefreshInstagramTokensResult = {
  checked: number
  refreshed: number
  failed: number
}

async function refreshLongLivedToken(accessToken: string): Promise<{
  accessToken: string
  expiresAt: string
}> {
  const url = new URL(REFRESH_ENDPOINT)
  url.searchParams.set("grant_type", "ig_refresh_token")
  url.searchParams.set("access_token", accessToken)

  const response = await fetch(url, { cache: "no-store" })
  const result = await response.json() as RefreshResponse

  if (!response.ok || result.error || !result.access_token) {
    throw new Error(result.error?.message || "Instagram rejected the token refresh")
  }

  const expiresIn = Number(result.expires_in) > 0
    ? Number(result.expires_in)
    : DEFAULT_EXPIRES_IN_SECONDS

  return {
    accessToken: result.access_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  }
}

async function findTokensDueForRefresh(cutoff: string): Promise<InstagramTokenRecord[]> {
  const supabase = getSupabaseAdmin()
  const pageSize = 500
  const records: InstagramTokenRecord[] = []

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("users")
      .select("id, access_token, token_expires_at")
      .or(`token_expires_at.is.null,token_expires_at.lte.${cutoff}`)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) throw new Error(`Could not load Instagram tokens: ${error.message}`)

    const page = (data || []) as InstagramTokenRecord[]
    records.push(...page)
    if (page.length < pageSize) return records
  }
}

async function refreshRecord(record: InstagramTokenRecord): Promise<boolean> {
  if (!record.access_token || record.access_token === "TEST_TOKEN_NOT_REAL") return false

  const refreshed = await refreshLongLivedToken(record.access_token)
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .update({
      access_token: refreshed.accessToken,
      token_expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", record.id)
    .eq("access_token", record.access_token)
    .select("id")
    .maybeSingle()

  if (error) throw new Error(`Could not save refreshed Instagram token: ${error.message}`)

  // A missing row means another invocation refreshed this account first.
  return Boolean(data)
}

export async function refreshExpiringInstagramTokens(
  now = new Date(),
): Promise<RefreshInstagramTokensResult> {
  const cutoff = new Date(now.getTime() + INSTAGRAM_TOKEN_REFRESH_WINDOW_MS).toISOString()
  const records = await findTokensDueForRefresh(cutoff)
  const result: RefreshInstagramTokensResult = {
    checked: records.length,
    refreshed: 0,
    failed: 0,
  }

  // Keep concurrency modest so a large account set does not burst Instagram's API.
  const concurrency = 5
  for (let index = 0; index < records.length; index += concurrency) {
    const batch = records.slice(index, index + concurrency)
    const outcomes = await Promise.allSettled(batch.map(refreshRecord))

    outcomes.forEach((outcome, batchIndex) => {
      const record = batch[batchIndex]
      if (outcome.status === "fulfilled") {
        if (outcome.value) result.refreshed += 1
        return
      }

      result.failed += 1
      console.error(`[instagram-token-refresh] Refresh failed for user ${record.id}:`, outcome.reason)
    })
  }

  return result
}
