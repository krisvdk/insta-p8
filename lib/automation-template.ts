import { getSupabaseServerClient } from "@/lib/supabase-server"

export type AutomationTemplate = {
  name: string
  trigger_source: "comment"
  trigger_type: "keyword" | "reply_all"
  trigger_value: string
  response_type: "pro"
  response_content: Record<string, unknown>
  is_active: boolean
}

function text(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : ""
}

function uniqueStrings(value: unknown, maximumItems: number, maximumLength: number): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => text(item, maximumLength)).filter(Boolean))).slice(0, maximumItems)
}

function httpsUrl(value: unknown): string | null {
  const normalized = text(value, 2048)
  if (!normalized) return null
  try {
    const url = new URL(normalized)
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

export function buildAutomationTemplate(value: any): { template: AutomationTemplate | null; error: string | null } {
  if (!value || value.enabled === false) return { template: null, error: null }

  // Keep compatibility with the dashboard's compact automation shape while
  // exposing the complete response configuration to external integrations.
  const trigger = value.trigger || {}
  const triggerType = trigger.type === "all_comments" || value.triggerType === "all_comments"
    ? "reply_all"
    : "keyword"
  const keywords = uniqueStrings(trigger.keywords ?? value.keywords, 10, 100).map((keyword) => keyword.toLowerCase())
  if (triggerType === "keyword" && keywords.length === 0) {
    return { template: null, error: "automation.trigger.keywords must contain at least one keyword" }
  }

  const response = value.response || value
  const replyMode = ["both", "dm_only", "public_only"].includes(response.replyMode)
    ? response.replyMode
    : "both"
  const message = text(response.message, 1000)
  const mediaUrl = httpsUrl(response.media?.url)
  const card = response.card
  const cardTitle = text(card?.title, 80)

  if (replyMode !== "public_only" && !message && !mediaUrl && !cardTitle) {
    return { template: null, error: "automation.response needs a message, media, or card" }
  }

  const content: Record<string, unknown> = {
    reply_mode: replyMode,
    check_follow: response.checkFollow === true,
  }
  if (message) content.message = message

  const publicReplies = uniqueStrings(
    response.publicReplies ?? (response.publicReply ? [response.publicReply] : []),
    10,
    300,
  )
  if (publicReplies.length) content.public_replies = publicReplies
  if (response.includeReplies === true) content.include_replies = true
  if (response.typingIndicator === true) content.typing_indicator = true

  const delaySeconds = Number(response.delaySeconds || 0)
  if (Number.isFinite(delaySeconds) && delaySeconds > 0) {
    content.delay_seconds = Math.min(Math.floor(delaySeconds), 300)
  }

  if (mediaUrl) {
    const mediaType = ["image", "video", "audio"].includes(response.media?.type)
      ? response.media.type
      : "image"
    content.media = { type: mediaType, url: mediaUrl }
  }

  if (cardTitle) {
    const buttons = Array.isArray(card?.buttons)
      ? card.buttons.slice(0, 3).flatMap((button: any) => {
        const title = text(button?.title, 20)
        if (!title) return []
        if (button.type === "web_url") {
          const url = httpsUrl(button.url)
          return url ? [{ type: "web_url", title, url }] : []
        }
        const payload = text(button?.payload, 1000)
        return payload ? [{ type: "postback", title, payload }] : []
      })
      : []
    content.card = {
      title: cardTitle,
      ...(text(card?.subtitle, 80) ? { subtitle: text(card.subtitle, 80) } : {}),
      ...(httpsUrl(card?.imageUrl) ? { image_url: httpsUrl(card.imageUrl) } : {}),
      ...(buttons.length ? { buttons } : {}),
    }
  }

  const quickReplies = Array.isArray(response.quickReplies)
    ? response.quickReplies.slice(0, 4).flatMap((quickReply: any) => {
      const title = text(typeof quickReply === "string" ? quickReply : quickReply?.title, 20)
      if (!title) return []
      return [{ title, ...(text(quickReply?.payload, 1000) ? { payload: text(quickReply.payload, 1000) } : {}) }]
    })
    : []
  if (quickReplies.length) content.quick_replies = quickReplies

  return {
    template: {
      name: text(value.name, 120) || (triggerType === "reply_all" ? "Reply to every comment" : `Reply to “${keywords[0]}”`),
      trigger_source: "comment",
      trigger_type: triggerType,
      trigger_value: triggerType === "reply_all" ? "ALL_COMMENTS" : keywords.join(", "),
      response_type: "pro",
      response_content: content,
      is_active: value.active !== false,
    },
    error: null,
  }
}

export async function createAutomationForMedia(
  userId: string,
  mediaId: string,
  template: AutomationTemplate,
): Promise<string> {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.from("automations").insert({
    user_id: userId,
    name: template.name,
    trigger_source: template.trigger_source,
    trigger_type: template.trigger_type,
    trigger_value: template.trigger_value,
    response_type: template.response_type,
    response_content: template.response_content,
    specific_media_id: mediaId,
    is_active: template.is_active,
  }).select("id").single()
  if (error || !data) throw new Error(error?.message || "Could not create automation")
  return String(data.id)
}
