"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

type ScheduledPost = {
  id: string
  media_type: "IMAGE" | "REELS"
  media_url: string
  caption: string | null
  scheduled_at: string
  qstash_message_id: string | null
  status: "SCHEDULED" | "PROCESSING" | "PUBLISHED" | string
  attempts: number
  processing_started_at: string | null
  ig_media_id: string | null
  permalink: string | null
  error_message: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

type Filter = "ALL" | "UPCOMING" | "PUBLISHED" | "ATTENTION"

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "UPCOMING", label: "Upcoming" },
  { key: "PUBLISHED", label: "Published" },
  { key: "ATTENTION", label: "Needs attention" },
]

function formatDate(value: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function statusInfo(post: ScheduledPost) {
  if (post.status === "PUBLISHED") {
    return {
      label: "Published",
      icon: CheckCircle2,
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    }
  }
  if (post.status === "PROCESSING") {
    return {
      label: "Publishing",
      icon: Loader2,
      className: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    }
  }
  if (post.error_message) {
    return {
      label: "Needs attention",
      icon: AlertCircle,
      className: "border-destructive/30 bg-destructive/10 text-destructive",
    }
  }
  return {
    label: "Scheduled",
    icon: CalendarClock,
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  }
}

export default function ScheduledPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [filter, setFilter] = useState<Filter>("ALL")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPosts = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const response = await fetch("/api/instagram/scheduled-posts", { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not load scheduled posts")
      setPosts(result.data || [])
      setError(null)
    } catch (loadError: any) {
      setError(loadError?.message || "Could not load scheduled posts")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadPosts(true)
    const interval = window.setInterval(() => loadPosts(true), 15_000)
    return () => window.clearInterval(interval)
  }, [loadPosts])

  const counts = useMemo(() => ({
    ALL: posts.length,
    UPCOMING: posts.filter((post) => post.status === "SCHEDULED" || post.status === "PROCESSING").length,
    PUBLISHED: posts.filter((post) => post.status === "PUBLISHED").length,
    ATTENTION: posts.filter((post) => Boolean(post.error_message) && post.status !== "PUBLISHED").length,
  }), [posts])

  const visiblePosts = useMemo(() => posts.filter((post) => {
    if (filter === "UPCOMING") return post.status === "SCHEDULED" || post.status === "PROCESSING"
    if (filter === "PUBLISHED") return post.status === "PUBLISHED"
    if (filter === "ATTENTION") return Boolean(post.error_message) && post.status !== "PUBLISHED"
    return true
  }), [filter, posts])

  return (
    <div className="p-4 md:p-8 animate-in fade-in duration-500">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 mb-7">
          <div>
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">Content queue</p>
            <h1 className="font-serif-display text-4xl md:text-5xl text-foreground leading-none">Scheduled posts</h1>
            <p className="text-sm text-muted-foreground mt-3">Track everything waiting for QStash and already published.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => loadPosts()} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button asChild className="bg-accent-yellow text-accent-yellow-foreground hover:bg-accent-yellow/90">
              <Link href="/dashboard/publish"><Plus className="w-4 h-4" /> New post</Link>
            </Button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`shrink-0 inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs transition-colors ${
                filter === key
                  ? "border-foreground/20 bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              <span className={`font-mono-ui text-[9px] ${filter === key ? "text-background/70" : "text-muted-foreground"}`}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="min-h-72 flex items-center justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card className="p-10 text-center border-destructive/30 bg-destructive/5">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground">Could not load scheduled posts</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </Card>
        ) : visiblePosts.length === 0 ? (
          <Card className="p-12 text-center border-dashed bg-card/50">
            <CalendarClock className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <h2 className="font-serif-display text-2xl text-foreground">Nothing here yet</h2>
            <p className="text-sm text-muted-foreground mt-2 mb-5">
              {filter === "ALL" ? "Schedule your first Instagram post or Reel." : "No posts match this status."}
            </p>
            <Button asChild variant="outline"><Link href="/dashboard/publish">Create a post</Link></Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {visiblePosts.map((post) => {
              const status = statusInfo(post)
              const StatusIcon = status.icon
              return (
                <Card key={post.id} className="p-4 md:p-5 bg-card border-border">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="w-full sm:w-24 h-36 sm:h-24 shrink-0 rounded-xl overflow-hidden bg-neutral-950 flex items-center justify-center">
                      {post.status !== "PUBLISHED" && post.media_type === "IMAGE" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.media_url} alt="Scheduled post" className="w-full h-full object-cover" />
                      ) : post.status !== "PUBLISHED" && post.media_type === "REELS" ? (
                        <video src={post.media_url} muted preload="metadata" className="w-full h-full object-cover" />
                      ) : post.media_type === "REELS" ? (
                        <Film className="w-7 h-7 text-neutral-600" />
                      ) : (
                        <ImageIcon className="w-7 h-7 text-neutral-600" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${status.className}`}>
                          <StatusIcon className={`w-3 h-3 ${post.status === "PROCESSING" ? "animate-spin" : ""}`} />
                          {status.label}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">
                          {post.media_type === "REELS" ? <Film className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                          {post.media_type === "REELS" ? "Reel" : "Post"}
                        </span>
                      </div>

                      <p className="text-sm text-foreground mt-3 line-clamp-2 whitespace-pre-wrap">
                        {post.caption || <span className="text-muted-foreground italic">No caption</span>}
                      </p>

                      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-[11px] text-muted-foreground">
                        <span>Scheduled: <strong className="font-medium text-foreground">{formatDate(post.scheduled_at)}</strong></span>
                        {post.published_at && <span>Published: <strong className="font-medium text-foreground">{formatDate(post.published_at)}</strong></span>}
                        {post.attempts > 0 && <span>Attempts: <strong className="font-medium text-foreground">{post.attempts}</strong></span>}
                      </div>

                      {post.error_message && post.status !== "PUBLISHED" && (
                        <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                          {post.error_message}
                        </div>
                      )}
                    </div>

                    {post.permalink && (
                      <div className="sm:self-center">
                        <Button asChild variant="outline" size="sm">
                          <Link href={post.permalink} target="_blank" rel="noopener noreferrer">
                            View <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
