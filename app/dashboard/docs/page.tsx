import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  Code2,
  KeyRound,
  LockKeyhole,
  MessagesSquare,
  ServerCog,
  ShieldCheck,
  Webhook,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

const SECTIONS = [
  ["quick-start", "Quick start"],
  ["admin-access", "Admin access"],
  ["api-auth", "API authentication"],
  ["publish", "Publish a Reel"],
  ["schedule", "Schedule a Reel"],
  ["automation", "Automation options"],
  ["status", "Jobs and status"],
  ["reference", "Reference"],
] as const

const ENVIRONMENT_VARIABLES = [
  ["ADMIN_CODE", "Required", "The private code entered on the Admin access screen."],
  ["ADMIN_SESSION_SECRET", "Recommended", "A separate random secret used to sign 30-day admin sessions."],
  ["EXTERNAL_API_KEY", "API", "Bearer key shared only between trusted servers."],
  ["EXTERNAL_API_INSTAGRAM_USER_ID", "API", "Default connected Instagram user ID for external requests."],
  ["APP_URL", "Scheduling", "Public HTTPS origin of this deployment, without a trailing slash."],
  ["QSTASH_TOKEN", "Scheduling", "QStash token used to enqueue scheduled publishing."],
  ["QSTASH_CURRENT_SIGNING_KEY", "Scheduling", "Verifies callbacks from QStash."],
  ["QSTASH_NEXT_SIGNING_KEY", "Scheduling", "Supports safe QStash key rotation."],
] as const

const STATUSES = [
  ["RECEIVED", "The request was accepted and recorded."],
  ["PROCESSING", "Instagram is processing an immediate publish."],
  ["SCHEDULED", "The Reel is waiting for its scheduled time."],
  ["CANCELLED", "The queued Reel was deleted before publication."],
  ["PUBLISHED", "The Reel and optional automation completed successfully."],
  ["PUBLISHED_WITH_WARNING", "The Reel published, but its automation could not be created."],
  ["FAILED", "Publishing failed. Read the error field for the reason."],
] as const

const publishExample = `curl -X POST "https://your-domain.com/api/v1/reels" \\
  -H "Authorization: Bearer $EXTERNAL_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: cms-reel-123" \\
  -d '{
    "videoUrl": "https://cdn.example.com/reels/demo.mp4",
    "caption": "A new Reel from our content system"
  }'`

const scheduleExample = `{
  "videoUrl": "https://cdn.example.com/reels/demo.mp4",
  "caption": "Comment GUIDE and I will send it to you.",
  "publishAt": "2026-09-01T16:30:00Z"
}`

const automationExample = `{
  "enabled": true,
  "name": "Send the Reel guide",
  "active": true,
  "trigger": {
    "type": "keyword",
    "keywords": ["guide", "send it", "link"]
  },
  "response": {
    "replyMode": "both",
    "message": "Here is the guide you asked for!",
    "publicReplies": [
      "Sent — check your DMs!",
      "It is waiting in your inbox."
    ],
    "checkFollow": false,
    "includeReplies": false,
    "delaySeconds": 2,
    "typingIndicator": true,
    "quickReplies": [
      { "title": "Open guide", "payload": "OPEN_GUIDE" }
    ]
  }
}`

const cardExample = `"card": {
  "title": "Your free guide",
  "subtitle": "Open it below",
  "imageUrl": "https://cdn.example.com/guide.jpg",
  "buttons": [
    {
      "type": "web_url",
      "title": "Open guide",
      "url": "https://example.com/guide"
    },
    {
      "type": "postback",
      "title": "Tell me more",
      "payload": "MORE_INFO"
    }
  ]
}`

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border bg-[#0b0b0c] p-4 text-[12px] leading-6 text-neutral-300 shadow-inner">
      <code>{children}</code>
    </pre>
  )
}

function SectionTitle({ icon: Icon, eyebrow, title, description }: {
  icon: typeof BookOpen
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-4 mb-5">
      <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-accent-yellow/30 bg-accent-yellow/10 text-accent-yellow-foreground dark:text-accent-yellow">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="font-mono-ui text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-1 font-serif-display text-3xl text-foreground">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export default function DocumentationPage() {
  return (
    <div className="p-4 md:p-8 animate-in fade-in duration-500">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 border-b border-border pb-8">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge variant="outline" className="border-accent-yellow/30 bg-accent-yellow/10 text-foreground">API v1</Badge>
            <Badge variant="outline" className="text-muted-foreground">Private deployment</Badge>
          </div>
          <h1 className="font-serif-display text-5xl md:text-6xl leading-none text-foreground">Documentation</h1>
          <p className="mt-4 max-w-3xl text-sm md:text-base leading-7 text-muted-foreground">
            Everything needed to secure this workspace and publish or schedule Instagram Reels from another website—including automatic comment-to-DM flows.
          </p>
        </header>

        <div className="grid gap-8 xl:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden xl:block">
            <nav aria-label="Documentation sections" className="sticky top-8 space-y-1 border-l border-border pl-4">
              <p className="px-3 pb-2 font-mono-ui text-[9px] uppercase tracking-[0.22em] text-muted-foreground">On this page</p>
              {SECTIONS.map(([href, label]) => (
                <a key={href} href={`#${href}`} className="block rounded-md px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          <article className="min-w-0 space-y-14">
            <section id="quick-start" className="scroll-mt-8">
              <SectionTitle
                icon={CheckCircle2}
                eyebrow="Start here"
                title="Quick start"
                description="Complete these steps once. Your external site can then publish immediately or queue a Reel for later."
              />
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ["01", "Connect Instagram", "Sign in through this dashboard once with the Business or Creator account you want to publish to."],
                  ["02", "Apply the database schema", "Run the latest schema.sql in the Supabase SQL editor to add API job tracking."],
                  ["03", "Add private secrets", "Configure the admin code, session secret, API key, and default Instagram user ID."],
                  ["04", "Call from your server", "Send a POST request from the other website's backend—not from public browser JavaScript."],
                ].map(([number, title, body]) => (
                  <Card key={number} className="p-5 bg-card border-border">
                    <div className="flex gap-4">
                      <span className="font-mono-ui text-xs text-accent-yellow-foreground dark:text-accent-yellow">{number}</span>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>

            <section id="admin-access" className="scroll-mt-8">
              <SectionTitle
                icon={LockKeyhole}
                eyebrow="Private workspace"
                title="Admin access"
                description="Every browser page and dashboard API is protected by your private admin code. A successful unlock creates an HTTP-only, signed session lasting 30 days."
              />
              <Card className="p-5 md:p-6 bg-card border-border space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Generate both secrets</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Use different random values. Changing the session secret signs out every device.</p>
                  </div>
                  <CodeBlock>{`openssl rand -base64 48\nopenssl rand -hex 32`}</CodeBlock>
                </div>
                <CodeBlock>{`ADMIN_CODE=your-private-admin-code\nADMIN_SESSION_SECRET=your-separate-random-session-secret`}</CodeBlock>
                <div className="flex gap-3 rounded-xl border border-border bg-muted/40 p-4">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <p className="text-xs leading-5 text-muted-foreground">Meta webhooks, cron jobs, QStash callbacks, and the external API stay reachable through their own signature or API-key checks. They do not use the browser admin session.</p>
                </div>
              </Card>
            </section>

            <section id="api-auth" className="scroll-mt-8">
              <SectionTitle
                icon={KeyRound}
                eyebrow="Server to server"
                title="API authentication"
                description="Create the key yourself, store the same value on both servers, and send it as a Bearer token with every request."
              />
              <div className="space-y-4">
                <CodeBlock>{`openssl rand -hex 32\n\nEXTERNAL_API_KEY=paste-the-generated-value\nEXTERNAL_API_INSTAGRAM_USER_ID=17841400000000000`}</CodeBlock>
                <CodeBlock>{`Authorization: Bearer YOUR_EXTERNAL_API_KEY\nContent-Type: application/json\nIdempotency-Key: a-unique-id-from-your-cms`}</CodeBlock>
                <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <p className="text-xs leading-5 text-muted-foreground">Never place the external API key in frontend code, public environment variables, mobile apps, logs, or Git. Requests should originate from a trusted backend.</p>
                </div>
              </div>
            </section>

            <section id="publish" className="scroll-mt-8">
              <SectionTitle
                icon={Code2}
                eyebrow="POST /api/v1/reels"
                title="Publish a Reel now"
                description="Provide a public HTTPS video URL that Instagram can download. A successful immediate publish returns HTTP 201."
              />
              <CodeBlock>{publishExample}</CodeBlock>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  ["videoUrl", "Required", "Public HTTPS MP4 or MOV URL."],
                  ["caption", "Optional", "Up to 2,200 characters."],
                  ["userId", "Optional", "Overrides the configured default connected account."],
                ].map(([field, required, body]) => (
                  <Card key={field} className="p-4 bg-card border-border">
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-xs text-foreground">{field}</code>
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{required}</span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p>
                  </Card>
                ))}
              </div>
            </section>

            <section id="schedule" className="scroll-mt-8">
              <SectionTitle
                icon={Clock3}
                eyebrow="Delayed delivery"
                title="Schedule a Reel"
                description="Add publishAt as an ISO-8601 timestamp between 30 seconds and one year in the future. Accepted scheduled jobs return HTTP 202."
              />
              <CodeBlock>{scheduleExample}</CodeBlock>
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
                <ServerCog className="h-4 w-4 shrink-0" />
                Scheduling requires APP_URL and all three QStash credentials listed in the reference section. Upcoming items can be deleted from Scheduled posts; deletion cancels the QStash delivery first.
              </div>
            </section>

            <section id="automation" className="scroll-mt-8">
              <SectionTitle
                icon={MessagesSquare}
                eyebrow="Optional automation"
                title="Create the follow-up automatically"
                description="Attach automation to the same request. For scheduled Reels, it is created only after Instagram publishes successfully and is automatically limited to that Reel."
              />
              <div className="space-y-6">
                <CodeBlock>{`"automation": ${automationExample}`}</CodeBlock>
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/60 text-foreground">
                      <tr><th className="px-4 py-3 font-semibold">Option</th><th className="px-4 py-3 font-semibold">Accepted values</th><th className="hidden px-4 py-3 font-semibold md:table-cell">Purpose</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card text-muted-foreground">
                      {[
                        ["enabled", "true / false", "Turn automation creation on or off."],
                        ["active", "true / false", "Create it live or initially paused."],
                        ["trigger.type", "keyword / all_comments", "Choose keyword matching or every comment."],
                        ["trigger.keywords", "Up to 10 strings", "Required when trigger.type is keyword."],
                        ["response.replyMode", "both / dm_only / public_only", "Select public reply, private DM, or both."],
                        ["response.message", "Up to 1,000 characters", "Text sent privately to the commenter."],
                        ["response.publicReplies", "Up to 10 strings", "Rotating replies, up to 300 characters each."],
                        ["response.checkFollow", "true / false", "Require a follow before unlocking the private response."],
                        ["response.includeReplies", "true / false", "Also trigger on nested comment replies."],
                        ["response.delaySeconds", "0–300", "Wait before delivering the private response."],
                        ["response.typingIndicator", "true / false", "Show typing before the private response."],
                        ["response.quickReplies", "Up to 4", "Add guided quick-reply buttons."],
                        ["response.media", "image / video / audio", "Send hosted media with an optional text message."],
                        ["response.card", "Card object", "Send a rich card with up to three buttons."],
                      ].map(([option, values, purpose]) => (
                        <tr key={option}><td className="px-4 py-3 font-mono-ui text-[11px] text-foreground">{option}</td><td className="px-4 py-3">{values}</td><td className="hidden px-4 py-3 md:table-cell">{purpose}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Rich card example</h3>
                  <CodeBlock>{cardExample}</CodeBlock>
                </div>
              </div>
            </section>

            <section id="status" className="scroll-mt-8">
              <SectionTitle
                icon={Webhook}
                eyebrow="GET /api/v1/reels/{jobId}"
                title="Jobs and status"
                description="Every request returns a jobId. Poll the status endpoint from your server to follow scheduled work through publication."
              />
              <CodeBlock>{`curl "https://your-domain.com/api/v1/reels/JOB_ID" \\
  -H "Authorization: Bearer $EXTERNAL_API_KEY"`}</CodeBlock>
              <div className="mt-4 grid gap-2">
                {STATUSES.map(([status, body]) => (
                  <div key={status} className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3">
                    <code className="w-48 shrink-0 text-[11px] text-foreground">{status}</code>
                    <ArrowRight className="hidden h-3 w-3 shrink-0 text-muted-foreground sm:block" />
                    <p className="text-xs leading-5 text-muted-foreground">{body}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <h3 className="mb-3 text-sm font-semibold text-foreground">Idempotency prevents duplicates</h3>
                <p className="mb-3 text-xs leading-6 text-muted-foreground">Send the same Idempotency-Key when retrying one logical publish. The API returns the existing job instead of creating a second Reel. Use a stable content ID from your CMS.</p>
                <CodeBlock>{`Idempotency-Key: wordpress-post-8421\nIdempotency-Key: shopify-video-campaign-19`}</CodeBlock>
              </div>
            </section>

            <section id="reference" className="scroll-mt-8 pb-12">
              <SectionTitle
                icon={ServerCog}
                eyebrow="Configuration"
                title="Environment reference"
                description="Add these values to the production deployment. Keep every value server-side and redeploy after changing it."
              />
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/60 text-foreground"><tr><th className="px-4 py-3 font-semibold">Variable</th><th className="hidden px-4 py-3 font-semibold sm:table-cell">Used for</th><th className="px-4 py-3 font-semibold">Description</th></tr></thead>
                  <tbody className="divide-y divide-border bg-card text-muted-foreground">
                    {ENVIRONMENT_VARIABLES.map(([variable, use, description]) => (
                      <tr key={variable}><td className="px-4 py-3 font-mono-ui text-[10px] text-foreground sm:text-[11px]">{variable}</td><td className="hidden px-4 py-3 sm:table-cell">{use}</td><td className="px-4 py-3 leading-5">{description}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Card className="mt-6 p-5 bg-card border-border">
                <h3 className="text-sm font-semibold text-foreground">Common HTTP responses</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    ["201", "Published immediately"], ["202", "Scheduled successfully"],
                    ["400", "Invalid URL, timestamp, caption, or automation"], ["401", "Missing or invalid API key"],
                    ["404", "Connected account or job not found"], ["500", "Instagram, storage, or scheduling failure"],
                  ].map(([code, meaning]) => (
                    <div key={code} className="flex gap-3 text-xs"><code className="text-foreground">{code}</code><span className="text-muted-foreground">{meaning}</span></div>
                  ))}
                </div>
              </Card>
            </section>
          </article>
        </div>
      </div>
    </div>
  )
}
