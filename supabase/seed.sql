-- Demo seed data for one event
-- Run after schema.sql

with new_event as (
  insert into events (event_name, client_name, event_date, venue, product_name, status)
  values ('Sarah & Daniel Wedding', 'Sarah Lim', current_date, 'The Glasshouse', 'Acacia Wood Coaster', 'active')
  returning id
)
insert into event_templates (
  event_id, product_image_url, available_colours, available_fonts,
  preview_name_x, preview_name_y, preview_name_size, preview_name_colour, max_name_length
)
select
  id,
  'https://images.unsplash.com/photo-1606293459241-2d2c4f1f7b9b?w=1200&q=80',
  '["Natural Oak","Walnut","Ebony"]'::jsonb,
  '["Modern","Elegant Script","Classic Serif"]'::jsonb,
  50, 55, 36, '#3B2A1A', 20
from new_event;
