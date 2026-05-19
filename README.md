# EMBOSS Live Personalization System

A production-ready web app for **EMBOSS** — live on-site laser engraving for event and wedding door gifts. Replaces the paper-based name workflow with a digital iPad form, live status tracking, a crew production dashboard, and a collection display.

> **Important:** This system **does not** control or automate the xTool F1 directly. The crew still copies the guest name and pastes it into xTool Studio. The app focuses on guest input, previews, queueing, status, and crew workflow.

---

## Features

- **Guest iPad Page** (`/event/[eventId]`) — premium personalization form with live preview, font + colour selection, queue number, and a status QR code.
- **Guest Status Page** (`/status/[orderId]`) — realtime status tracker (mobile-friendly).
- **Crew Dashboard** (`/admin`) — password-gated production board with filters, search, copy-name (auto sets engraving), status updates, edit name, cancel, etc.
- **Collection Display Screen** (`/collection/[eventId]`) — large-format display of orders ready to collect, auto-updating.
- **Event Setup** (`/admin/events`) — create/edit event templates including product image, fonts, colours, preview placement, max length, active/inactive.
- **Realtime** via Supabase channels.
- **Premium UI** — soft neutrals, serif/script display fonts, large iPad-friendly buttons.

## Tech Stack

- Next.js 14 (App Router) · TypeScript · Tailwind CSS
- Supabase (Postgres + Realtime)
- `qrcode` for QR generation

---

## 1. Local Setup

### Prerequisites
- Node.js 18.17+
- A Supabase project (free tier is fine)

### Install
```bash
npm install
```

### Environment variables
Copy `.env.local.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
ADMIN_PASSWORD=choose-a-strong-admin-password
CREW_PASSWORD=choose-a-different-crew-password
```

**Roles:**
- **Admin** — full access: dashboard + event/template management. Use for the owner / manager.
- **Crew** — production dashboard only. Cannot create/edit/delete events. Safe for part-time staff.

### Database
1. Open your Supabase project → **SQL Editor**.
2. Run `supabase/schema.sql` — creates tables, indexes, an `updated_at` trigger, enables Realtime, and applies permissive RLS for MVP.
3. (Optional) Run `supabase/seed.sql` to create one demo event with a template.

> The seed inserts a demo event called *Sarah & Daniel Wedding* with the default 3 fonts (Modern, Elegant Script, Classic Serif) and 3 colours.

### Run
```bash
npm run dev
```
Open http://localhost:3000.

- Visit `/admin` and sign in with `ADMIN_PASSWORD`.
- Create an event or use the seeded one — the dashboard shows links to the guest iPad and collection screen.

---

## 2. How the Pages Work

### Guest iPad — `/event/[eventId]`
- Loads the event + most recent template.
- Live preview overlays the guest name on the product image using `preview_name_x/y/size/colour` from the template.
- Sanitizes name (strips emojis, collapses spaces).
- Confirmation modal: *“Please check your name carefully. It will be engraved exactly as shown.”*
- Generates queue number `A001`, `A002`, … per event by counting existing orders + 1.
- After submit: shows queue number, QR (scans to `/status/[orderId]`) and a button to open status.

### Status — `/status/[orderId]`
- Subscribes to Supabase Realtime `UPDATE` for that order.
- Maps internal status → guest-friendly wording per spec.
- Shows progress steps when in normal flow.

### Crew Dashboard — `/admin`
- Password gate via `/api/admin/login` setting an HTTP-only cookie (`emboss_admin`).
- Event selector (active is auto-selected).
- Filters: All / Waiting / Engraving / Ready / Collected / Issue.
- Search by guest name or queue number.
- Buttons: **Copy Name** (copies + sets `engraving` if waiting), **Start**, **Ready** (sets `ready_at`), **Collected** (sets `collected_at`), **Issue**, **Edit Name** (records a note), **Cancel**.
- All changes write `order_activity` rows.

### Collection Display — `/collection/[eventId]`
- Subscribes to Realtime; lists orders with `status = ready` in big type.

### Event Setup — `/admin/events`
- Create / edit templates. Marking one event "active" deactivates the rest.

---

## 3. Database Schema

Defined in `supabase/schema.sql`:

- `events` — event metadata + `status` (active/inactive)
- `event_templates` — product image, available colours/fonts (jsonb), preview placement, max name length
- `orders` — queue number, guest name, font, colour, status, timestamps
- `order_activity` — audit log per order

Realtime is enabled for `orders` and `order_activity` via the `supabase_realtime` publication.

RLS is enabled and **open** for MVP (anon can read/write). Tighten before public deployment if needed.

---

## 4. Deployment

The simplest path is **Vercel**:

1. Push this repo to GitHub.
2. In Vercel, import the repo as a new project.
3. Add the three environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ADMIN_PASSWORD`).
4. Deploy. Vercel auto-detects Next.js.
5. (Recommended) In Supabase **Auth → URL Configuration** and **Database → Realtime**, ensure your production domain is allowed.

For other hosts (Netlify, Render, Fly): standard `next build` + `next start` works. Make sure env vars are set on the host.

### Domain checklist
- Set the production URL so QR codes resolve correctly. The QR is built from `window.location.origin` at submission time.
- iPads should bookmark `/event/[eventId]` in Safari (Add to Home Screen for fullscreen).
- The collection screen runs in any browser; full-screen for the cleanest look.

---

## 5. Operational Notes

- **Queue numbering** is per-event and based on a count of existing orders. This is fine for typical event throughput. If you anticipate two crew members submitting at the exact same millisecond on different iPads, swap to a Postgres sequence or a `RETURNING` insert with a server-side trigger.
- **Cancelled orders** still count toward the queue number. This is intentional — guests should keep their original number.
- **Editing a name** appends a note like `[14:32] Name edited from "Jhn" to "John"`.
- **Copy Name** uses the Clipboard API (HTTPS or `localhost` only — works on iPad Safari over HTTPS).

---

## 6. Project Layout

```
src/
  app/
    page.tsx                       # landing
    layout.tsx, globals.css
    event/[eventId]/page.tsx       # guest iPad
    status/[orderId]/page.tsx      # guest status (realtime)
    collection/[eventId]/page.tsx  # collection display (realtime)
    admin/
      layout.tsx                   # password gate
      LoginForm.tsx
      page.tsx                     # crew dashboard
      events/page.tsx              # event setup
    api/admin/login/route.ts       # admin password endpoint
  lib/
    supabase.ts                    # client + types + status maps
    utils.ts                       # sanitize, queue, fonts
supabase/
  schema.sql
  seed.sql
```

---

## 7. Roadmap (post-MVP ideas)

- Replace permissive RLS with proper auth roles for crew vs guest.
- Server-side queue number via Postgres sequence per event.
- Multi-line names / second-line subtitles.
- Photo upload of finished item attached to each order.
- Crew presence + per-action audit (`crew_name` is already in `order_activity`).
- Daily summary export (CSV).
