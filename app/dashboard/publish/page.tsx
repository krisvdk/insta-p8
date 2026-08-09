"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Loader2,
  Send,
  UploadCloud,
  X,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import { getSupabaseBrowserClient } from "@/lib/supabase-client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { TagInput } from "@/components/ui/tag-input"

type MediaType = "IMAGE" | "REELS"
type DeliveryMode = "NOW" | "SCHEDULE"

type PublishResult =
  | { kind: "published"; mediaId: string; permalink: string | null }
  | { kind: "scheduled"; messageId: string; scheduledAt: string }

const MAX_CAPTION_LENGTH = 2200

function defaultScheduleTime() {
  const date = new Date(Date.now() + 10 * 60 * 1000)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return localDate.toISOString().slice(0, 16)
}

export default function PublishPage() {
  const { userId, username, isLoading: sessionLoading } = useInstagramSession()
  const inputRef = useRef<HTMLInputElement>(null)
  const [mediaType, setMediaType] = useState<MediaType>("IMAGE")
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("NOW")
  const [scheduledFor, setScheduledFor] = useState(defaultScheduleTime)
  const [addAutomation, setAddAutomation] = useState(false)
  const [automationKeywords, setAutomationKeywords] = useState<string[]>([])
  const [automationMessage, setAutomationMessage] = useState("")
  const [automationPublicReply, setAutomationPublicReply] = useState("Sent! Check your DMs 📩")
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [caption, setCaption] = useState("")
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [result, setResult] = useState<PublishResult | null>(null)

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }

    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const resetFile = () => {
    setFile(null)
    setResult(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  const selectType = (nextType: MediaType) => {
    if (nextType === mediaType) return
    setMediaType(nextType)
    resetFile()
  }

  const acceptFile = (candidate?: File) => {
    if (!candidate) return

    const validImage = candidate.type === "image/jpeg" || /\.jpe?g$/i.test(candidate.name)
    const validVideo = ["video/mp4", "video/quicktime"].includes(candidate.type) || /\.(mp4|mov)$/i.test(candidate.name)

    if (mediaType === "IMAGE" && !validImage) {
      toast.error("Instagram image posts must be JPG or JPEG files")
      return
    }
    if (mediaType === "REELS" && !validVideo) {
      toast.error("Reels must be MP4 or MOV files")
      return
    }

    setFile(candidate)
    setResult(null)
  }

  const submitPost = async () => {
    if (!file || !userId || status) return

    const publishAt = deliveryMode === "SCHEDULE" ? new Date(scheduledFor) : null
    if (publishAt && (!Number.isFinite(publishAt.getTime()) || publishAt.getTime() < Date.now() + 30_000)) {
      toast.error("Choose a time at least 30 seconds from now")
      return
    }
    if (deliveryMode === "SCHEDULE" && addAutomation && automationKeywords.length === 0) {
      toast.error("Add at least one automation keyword")
      return
    }
    if (deliveryMode === "SCHEDULE" && addAutomation && !automationMessage.trim()) {
      toast.error("Add the DM sent by the automation")
      return
    }

    const extension = mediaType === "IMAGE"
      ? "jpg"
      : file.name.toLowerCase().endsWith(".mov") ? "mov" : "mp4"
    const storagePath = `${userId}/manual/${Date.now()}-${crypto.randomUUID()}.${extension}`
    const supabase = getSupabaseBrowserClient()

    try {
      setResult(null)
      setStatus("Uploading media…")

      const { error: uploadError } = await supabase.storage
        .from("reels")
        .upload(storagePath, file, {
          contentType: file.type || (mediaType === "IMAGE" ? "image/jpeg" : "video/mp4"),
          cacheControl: "3600",
          upsert: false,
        })
      if (uploadError) throw new Error(uploadError.message)

      const { data: publicData } = supabase.storage.from("reels").getPublicUrl(storagePath)
      setStatus(deliveryMode === "NOW" ? "Instagram is processing and publishing…" : "Scheduling with QStash…")

      const response = await fetch(deliveryMode === "NOW" ? "/api/instagram/publish" : "/api/instagram/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType,
          mediaUrl: publicData.publicUrl,
          caption,
          publishAt: publishAt?.toISOString(),
          automation: deliveryMode === "SCHEDULE" && addAutomation ? {
            enabled: true,
            keywords: automationKeywords,
            message: automationMessage,
            publicReply: automationPublicReply,
          } : undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not publish to Instagram")

      if (deliveryMode === "NOW") {
        setResult({ kind: "published", mediaId: data.mediaId, permalink: data.permalink })
        toast.success(mediaType === "IMAGE" ? "Post published" : "Reel published")

        // Instagram has copied the media after media_publish succeeds, so the temporary
        // upload is no longer needed. A failed cleanup should not turn success into failure.
        await supabase.storage.from("reels").remove([storagePath])
      } else {
        setResult({ kind: "scheduled", messageId: data.messageId, scheduledAt: data.scheduledAt })
        toast.success(mediaType === "IMAGE" ? "Post scheduled" : "Reel scheduled")
      }
    } catch (error: any) {
      toast.error(error?.message || "Could not publish to Instagram")
      await supabase.storage.from("reels").remove([storagePath])
    } finally {
      setStatus(null)
    }
  }

  if (sessionLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 animate-in fade-in duration-500">
      <div className="max-w-6xl mx-auto">
        <div className="mb-7">
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">Content studio</p>
          <h1 className="font-serif-display text-4xl md:text-5xl text-foreground leading-none">Publish to Instagram</h1>
          <p className="text-sm text-muted-foreground mt-3">
            Upload a post or Reel and publish it now or schedule it for later to @{username || "your account"}.
          </p>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
          <Card className="p-5 md:p-7 bg-card border-border space-y-7">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-foreground">Format</label>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => selectType("IMAGE")}
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                    mediaType === "IMAGE"
                      ? "border-accent-yellow bg-accent-yellow/10"
                      : "border-border bg-muted/20 hover:bg-accent"
                  }`}
                >
                  <ImageIcon className={`w-5 h-5 ${mediaType === "IMAGE" ? "text-accent-yellow-foreground dark:text-accent-yellow" : "text-muted-foreground"}`} />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Image post</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">JPG or JPEG</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => selectType("REELS")}
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                    mediaType === "REELS"
                      ? "border-accent-yellow bg-accent-yellow/10"
                      : "border-border bg-muted/20 hover:bg-accent"
                  }`}
                >
                  <Film className={`w-5 h-5 ${mediaType === "REELS" ? "text-accent-yellow-foreground dark:text-accent-yellow" : "text-muted-foreground"}`} />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Reel</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">MP4 or MOV</p>
                  </div>
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-foreground">Delivery</label>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => { setDeliveryMode("NOW"); setResult(null) }}
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                    deliveryMode === "NOW"
                      ? "border-accent-yellow bg-accent-yellow/10"
                      : "border-border bg-muted/20 hover:bg-accent"
                  }`}
                >
                  <Send className={`w-5 h-5 ${deliveryMode === "NOW" ? "text-accent-yellow-foreground dark:text-accent-yellow" : "text-muted-foreground"}`} />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Publish now</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Send immediately</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => { setDeliveryMode("SCHEDULE"); setResult(null) }}
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                    deliveryMode === "SCHEDULE"
                      ? "border-accent-yellow bg-accent-yellow/10"
                      : "border-border bg-muted/20 hover:bg-accent"
                  }`}
                >
                  <CalendarClock className={`w-5 h-5 ${deliveryMode === "SCHEDULE" ? "text-accent-yellow-foreground dark:text-accent-yellow" : "text-muted-foreground"}`} />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Schedule</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Deliver with QStash</p>
                  </div>
                </button>
              </div>
              {deliveryMode === "SCHEDULE" && (
                <div className="mt-3 rounded-xl border border-border bg-muted/20 p-4">
                  <label htmlFor="scheduledFor" className="text-xs font-medium text-foreground">Publish date and time</label>
                  <input
                    id="scheduledFor"
                    type="datetime-local"
                    value={scheduledFor}
                    min={defaultScheduleTime()}
                    onChange={(event) => { setScheduledFor(event.target.value); setResult(null) }}
                    className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                  <p className="text-[11px] text-muted-foreground mt-2">Time is interpreted in your current device timezone.</p>
                </div>
              )}
            </div>

            {deliveryMode === "SCHEDULE" && (
              <div className={`rounded-2xl border p-4 md:p-5 transition-colors ${addAutomation ? "border-accent-yellow/50 bg-accent-yellow/5" : "border-border bg-muted/20"}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${addAutomation ? "bg-accent-yellow text-accent-yellow-foreground" : "bg-background border border-border text-muted-foreground"}`}>
                    <Zap className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">Add comment automation</p>
                    <p className="text-[11px] text-muted-foreground mt-1">It activates after publishing and targets only this post.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={addAutomation}
                    onClick={() => { setAddAutomation(!addAutomation); setResult(null) }}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${addAutomation ? "bg-accent-yellow" : "bg-muted-foreground/30"}`}
                  >
                    <span className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${addAutomation ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>

                {addAutomation && (
                  <div className="space-y-4 mt-5 pt-5 border-t border-border">
                    <div>
                      <label className="text-xs font-medium text-foreground">Comment keywords</label>
                      <p className="text-[11px] text-muted-foreground mt-1 mb-2">Type a keyword and press Enter, for example “spree”.</p>
                      <TagInput
                        value={automationKeywords}
                        onChange={(keywords) => { setAutomationKeywords(keywords); setResult(null) }}
                        placeholder="keyword, press Enter"
                        className="bg-background border-border"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label htmlFor="automationMessage" className="text-xs font-medium text-foreground">Private DM response</label>
                        <span className="font-mono-ui text-[10px] text-muted-foreground">{automationMessage.length}/1000</span>
                      </div>
                      <Textarea
                        id="automationMessage"
                        value={automationMessage}
                        onChange={(event) => { setAutomationMessage(event.target.value); setResult(null) }}
                        placeholder="Here is the link I promised…"
                        maxLength={1000}
                        className="min-h-28 bg-background resize-y"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label htmlFor="automationPublicReply" className="text-xs font-medium text-foreground">Public comment reply</label>
                        <span className="font-mono-ui text-[10px] text-muted-foreground">{automationPublicReply.length}/300</span>
                      </div>
                      <input
                        id="automationPublicReply"
                        value={automationPublicReply}
                        onChange={(event) => { setAutomationPublicReply(event.target.value); setResult(null) }}
                        maxLength={300}
                        className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-bold uppercase tracking-wider text-foreground">Media</label>
                {file && (
                  <button type="button" onClick={resetFile} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
                    <X className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={mediaType === "IMAGE" ? ".jpg,.jpeg,image/jpeg" : ".mp4,.mov,video/mp4,video/quicktime"}
                onChange={(event) => acceptFile(event.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragging(false)
                  acceptFile(event.dataTransfer.files?.[0])
                }}
                className={`w-full min-h-48 rounded-2xl border border-dashed flex flex-col items-center justify-center gap-3 p-6 transition-colors ${
                  dragging ? "border-accent-yellow bg-accent-yellow/10" : "border-border bg-muted/20 hover:bg-accent"
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-background border border-border flex items-center justify-center">
                  <UploadCloud className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">{file ? file.name : "Choose a file or drop it here"}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : mediaType === "IMAGE" ? "A high-quality JPEG works best" : "Vertical 9:16 video is recommended"}
                  </p>
                </div>
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label htmlFor="caption" className="text-xs font-bold uppercase tracking-wider text-foreground">Caption</label>
                <span className={`font-mono-ui text-[10px] ${caption.length > MAX_CAPTION_LENGTH ? "text-destructive" : "text-muted-foreground"}`}>
                  {caption.length}/{MAX_CAPTION_LENGTH}
                </span>
              </div>
              <Textarea
                id="caption"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="Write a caption…"
                className="min-h-36 resize-y"
                maxLength={MAX_CAPTION_LENGTH}
              />
            </div>

            <Button
              type="button"
              size="lg"
              onClick={submitPost}
              disabled={!file || !userId || !!status || caption.length > MAX_CAPTION_LENGTH || (deliveryMode === "SCHEDULE" && !scheduledFor)}
              className="w-full h-12 bg-accent-yellow text-accent-yellow-foreground hover:bg-accent-yellow/90"
            >
              {status ? <Loader2 className="w-4 h-4 animate-spin" /> : deliveryMode === "SCHEDULE" ? <CalendarClock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {status || (deliveryMode === "SCHEDULE" ? "Schedule post" : "Publish now")}
            </Button>

            {result && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {result.kind === "published" ? "Published successfully" : "Scheduled successfully"}
                  </p>
                  <p className="font-mono-ui text-[10px] text-muted-foreground mt-1 truncate">
                    {result.kind === "published"
                      ? `Media ID: ${result.mediaId}`
                      : `QStash ID: ${result.messageId}`}
                  </p>
                  {result.kind === "scheduled" && (
                    <p className="text-xs text-foreground mt-2">
                      {new Date(result.scheduledAt).toLocaleString()}
                    </p>
                  )}
                  {result.kind === "published" && result.permalink && (
                    <Link href={result.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-foreground underline underline-offset-4 mt-2">
                      View on Instagram <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden bg-card border-border lg:sticky lg:top-8">
            <div className="px-4 py-3 border-b border-border flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                {(username || "I").charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">{username || "Instagram preview"}</p>
                <p className="text-[10px] text-muted-foreground">Preview</p>
              </div>
            </div>
            <div className="aspect-square bg-black flex items-center justify-center overflow-hidden">
              {previewUrl ? (
                mediaType === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="Post preview" className="w-full h-full object-contain" />
                ) : (
                  <video src={previewUrl} controls muted className="w-full h-full object-contain" />
                )
              ) : (
                <div className="text-center px-6">
                  {mediaType === "IMAGE" ? <ImageIcon className="w-9 h-9 text-neutral-600 mx-auto" /> : <Film className="w-9 h-9 text-neutral-600 mx-auto" />}
                  <p className="text-xs text-neutral-500 mt-3">Your media preview appears here</p>
                </div>
              )}
            </div>
            <div className="p-4 min-h-24">
              <p className="text-xs text-foreground whitespace-pre-wrap break-words">
                {caption || <span className="text-muted-foreground">Your caption will appear here.</span>}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
