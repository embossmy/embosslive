-- Migration 008: Stock per colour, gift-received step, second engraving text.
-- Run in Supabase SQL editor. Idempotent.

-- Stock count for each colour is encoded in the existing available_colours
-- string via a "||N" suffix (e.g. "Walnut:#5D4037@img.jpg||50"). No new
-- column is needed for that.

-- ---- event_templates: gift step + second engraving text ----
alter table event_templates
  -- Whether the guest must confirm they have received their door gift
  -- before personalizing. When true, the guest sees a step asking
  -- "Do you have your door gift with you?" right after Start.
  add column if not exists gift_required boolean default false,

  -- Second engraving text (optional). Same controls as the first.
  add column if not exists name2_enabled        boolean default false,
  add column if not exists name2_label          text    default 'Second line',
  add column if not exists preview_name2_x        numeric default 50,
  add column if not exists preview_name2_y        numeric default 70,
  add column if not exists preview_name2_size     numeric default 36,
  add column if not exists preview_name2_colour   text    default '#3B2A1A',
  add column if not exists preview_name2_rotation numeric default 0,
  add column if not exists preview_name2_tilt_x   numeric default 0,
  add column if not exists preview_name2_tilt_y   numeric default 0,

  -- Optional list of gift items the guest may bring to be engraved
  -- (e.g. ["Luggage tag", "Passport holder"]). Used when gift_required
  -- is true and the event has more than one gift; the guest picks which
  -- one(s) they want engraved on the gift step.
  add column if not exists gift_items jsonb default '[]'::jsonb;

-- ---- orders: second name + gift dropoff status ----
alter table orders
  add column if not exists guest_name2   text,
  -- gift_received: null = not applicable / not yet checked,
  -- false = guest will hand gift to crew (pending dropoff),
  -- true  = gift confirmed received by crew (or guest already had it).
  add column if not exists gift_received boolean,
  -- Subset of event_templates.gift_items the guest chose to engrave.
  -- Empty/null when the event has 0 or 1 gift items configured.
  add column if not exists gift_items_selected jsonb default '[]'::jsonb,
  -- Subset of gift_items_selected that the crew has marked as received.
  -- Used for per-item tracking when the order has multiple gift items so
  -- crew can mark a partial dropoff (e.g. only the passport holder arrived).
  add column if not exists gift_items_received jsonb default '[]'::jsonb;
