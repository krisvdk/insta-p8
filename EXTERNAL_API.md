# External Reel API

This server-to-server API lets another site publish or schedule a Reel through InstaAuto. It can also create a comment automation bound to the newly published Reel.

## Security and setup

Configure these server-side environment variables and redeploy:

```env
ADMIN_CODE=a-private-code-used-to-open-the-site
ADMIN_SESSION_SECRET=a-different-random-secret-at-least-32-characters
EXTERNAL_API_KEY=a-long-random-api-key
EXTERNAL_API_INSTAGRAM_USER_ID=17841400000000000
```

Keep `EXTERNAL_API_KEY` on the other site's server. Do not call this API directly from public browser JavaScript because that would expose the key.

Before using the API, connect the target Instagram account once through InstaAuto. `EXTERNAL_API_INSTAGRAM_USER_ID` is the connected Instagram login ID stored by this app. A request may provide `userId` to select another connected account.

Apply the latest `schema.sql` in Supabase before the first request. It adds API job tracking and the fields used by externally scheduled Reels.

## Publish now

```bash
curl -X POST "https://your-domain.com/api/v1/reels" \
  -H "Authorization: Bearer $EXTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: reel-my-cms-123" \
  -d '{
    "videoUrl": "https://cdn.example.com/reels/demo.mp4",
    "caption": "A new Reel from our content system"
  }'
```

`videoUrl` must be a public HTTPS URL that Instagram can download. The `Idempotency-Key` is optional but strongly recommended. Repeating the same key returns the original job instead of publishing twice.

## Schedule

Add `publishAt` as an ISO-8601 timestamp. It must be between 30 seconds and one year in the future.

```json
{
  "videoUrl": "https://cdn.example.com/reels/demo.mp4",
  "caption": "Scheduled from our CMS",
  "publishAt": "2026-09-01T16:30:00Z"
}
```

Scheduling requires the existing QStash variables: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, and `APP_URL`.

## Add an automation

The same `automation` object works for immediate and scheduled Reels. For a scheduled Reel, the automation is created only after Instagram publishes the Reel successfully.

```json
{
  "videoUrl": "https://cdn.example.com/reels/demo.mp4",
  "caption": "Comment GUIDE and I will send it to you.",
  "publishAt": "2026-09-01T16:30:00Z",
  "automation": {
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
  }
}
```

Automation options:

- `trigger.type`: `keyword` or `all_comments`.
- `trigger.keywords`: up to 10 keywords; required for `keyword`.
- `response.replyMode`: `both`, `dm_only`, or `public_only`.
- `response.message`: DM text, up to 1,000 characters.
- `response.publicReplies`: up to 10 rotating public replies, 300 characters each.
- `response.checkFollow`: require the commenter to follow before unlocking the response.
- `response.includeReplies`: include replies to comments, not only top-level comments.
- `response.delaySeconds`: delivery delay from 0–300 seconds.
- `response.typingIndicator`: show a typing indicator before the DM.
- `response.quickReplies`: up to four quick-reply buttons.
- `response.media`: `{ "type": "image|video|audio", "url": "https://..." }`.
- `response.card`: a rich card with `title`, optional `subtitle`, `imageUrl`, and up to three `buttons`. A button is either `{ "type": "web_url", "title": "...", "url": "https://..." }` or `{ "type": "postback", "title": "...", "payload": "..." }`.
- `active`: set `false` to create the automation turned off.

For a simpler keyword automation, the dashboard-compatible shorthand is also accepted:

```json
{
  "automation": {
    "enabled": true,
    "keywords": ["guide"],
    "message": "Here is your guide!",
    "publicReply": "Sent — check your DMs!"
  }
}
```

## Check status

The create response includes `jobId`. Scheduled jobs return HTTP `202`; immediate successful publishes return HTTP `201`.

```bash
curl "https://your-domain.com/api/v1/reels/JOB_ID" \
  -H "Authorization: Bearer $EXTERNAL_API_KEY"
```

Possible states are `RECEIVED`, `PROCESSING`, `SCHEDULED`, `CANCELLED`, `PUBLISHED`, `PUBLISHED_WITH_WARNING`, and `FAILED`. `PUBLISHED_WITH_WARNING` means the Reel published but its optional automation could not be created. Deleting an upcoming item from the Scheduled page cancels its QStash message and changes an associated external API job to `CANCELLED`.

## Response example

```json
{
  "success": true,
  "jobId": "7f3ab475-4f84-47d0-b927-10324e3cd987",
  "status": "PUBLISHED",
  "scheduledPostId": null,
  "mediaId": "18000000000000000",
  "permalink": "https://www.instagram.com/reel/example/",
  "automationId": "a04f45bc-e61d-4b34-a926-9ccafc42fc23",
  "error": null
}
```
