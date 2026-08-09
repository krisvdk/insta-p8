-- Store an optional automation template with a scheduled post, then link the
-- automation created after Instagram returns the published media ID.
-- Safe to run more than once in the Supabase SQL editor.

ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS automation_template JSONB;

ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS automation_id UUID REFERENCES public.automations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_automation_id
  ON public.scheduled_posts(automation_id);
