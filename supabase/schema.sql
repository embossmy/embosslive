-- EMBOSS Live Personalization System schema
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- ============ TABLES ============
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  client_name text,
  event_date date,
  venue text,
  product_name text,
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists event_templates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  product_image_url text,
  available_colours jsonb,
  available_fonts jsonb,
  preview_name_x numeric default 50,
  preview_name_y numeric default 50,
  preview_name_size numeric default 32,
  preview_name_colour text default '#111111',
  max_name_length integer default 20,
  created_at timestamptz default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  queue_number text not null,
  guest_name text not null,
  selected_font text,
  selected_colour text,
  status text default 'waiting',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  engraving_started_at timestamptz,
  ready_at timestamptz,
  collected_at timestamptz
);

create index if not exists orders_event_idx on orders(event_id);
create index if not exists orders_status_idx on orders(status);

create table if not exists order_activity (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  action text not null,
  old_status text,
  new_status text,
  crew_name text,
  created_at timestamptz default now()
);

-- ============ updated_at trigger ============
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_orders_updated on orders;
create trigger trg_orders_updated before update on orders
for each row execute procedure set_updated_at();

-- ============ Realtime ============
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_activity;

-- ============ RLS (open for MVP; tighten later) ============
alter table events enable row level security;
alter table event_templates enable row level security;
alter table orders enable row level security;
alter table order_activity enable row level security;

drop policy if exists "public read events" on events;
create policy "public read events" on events for select using (true);

drop policy if exists "public read templates" on event_templates;
create policy "public read templates" on event_templates for select using (true);

drop policy if exists "public read orders" on orders;
create policy "public read orders" on orders for select using (true);

drop policy if exists "public insert orders" on orders;
create policy "public insert orders" on orders for insert with check (true);

drop policy if exists "public update orders" on orders;
create policy "public update orders" on orders for update using (true) with check (true);

drop policy if exists "public read activity" on order_activity;
create policy "public read activity" on order_activity for select using (true);

drop policy if exists "public insert activity" on order_activity;
create policy "public insert activity" on order_activity for insert with check (true);

drop policy if exists "public manage events" on events;
create policy "public manage events" on events for all using (true) with check (true);

drop policy if exists "public manage templates" on event_templates;
create policy "public manage templates" on event_templates for all using (true) with check (true);
