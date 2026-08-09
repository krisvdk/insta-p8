-- QStash-backed one-time Instagram publishing jobs.
-- Safe to run more than once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('IMAGE', 'REELS', 'CAROUSEL')),
  media_url TEXT NOT NULL,
  media_items JSONB,
  caption TEXT,
  automation_template JSONB,
  automation_id UUID REFERENCES public.automations(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  qstash_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  attempts INTEGER NOT NULL DEFAULT 0,
  processing_started_at TIMESTAMPTZ,
  ig_container_id TEXT,
  ig_media_id TEXT,
  permalink TEXT,
  error_message TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user_status
  ON public.scheduled_posts(user_id, status);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_scheduled_at
  ON public.scheduled_posts(scheduled_at);

-- Only server-side routes use this table. The service role bypasses RLS;
-- browser/anon access remains denied because no public policies are created.
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;
