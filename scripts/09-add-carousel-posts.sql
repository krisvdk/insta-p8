-- Add carousel support to existing scheduled_posts tables.
-- Safe to run more than once in the Supabase SQL editor.

ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS media_items JSONB;

ALTER TABLE public.scheduled_posts
  DROP CONSTRAINT IF EXISTS scheduled_posts_media_type_check;

ALTER TABLE public.scheduled_posts
  ADD CONSTRAINT scheduled_posts_media_type_check
  CHECK (media_type IN ('IMAGE', 'REELS', 'CAROUSEL'));
