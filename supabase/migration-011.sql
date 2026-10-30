-- Migration 011: Guest gift choice — let guests pick which gift they want (with photos)
-- before personalizing. Run in Supabase SQL editor. Idempotent.

alter table event_templates
  add column if not exists gift_choice_enabled boolean default false,
  -- Array of { name, image_url, description, stock } objects.
  add column if not exists gift_choices jsonb default '[]'::jsonb;

alter table orders
  add column if not exists chosen_gift text;
