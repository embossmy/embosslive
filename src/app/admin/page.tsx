"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  supabase,
  STATUS_LABEL,
  type EmbossEvent,
  type EventTemplate,
  type Order,
  type OrderStatus,
} from "@/lib/supabase";
import {
  fontClassFor,
  fontDisplayName,
  fontStyleFor,
  formatTime,
  parseColour,
} from "@/lib/utils";
import GoogleFontsLoader from "@/components/GoogleFontsLoader";

const FILTERS: ({ key: "all" } | { key: OrderStatus })[] = [
  { key: "all" },
  { key: "waiting" },
  { key: "engraving" },
  { key: "ready" },
  { key: "collected" },
  { key: "issue" },
];

const FILTER_LABEL: Record<string, string> = {
  all: "All",
  waiting: "Waiting",
  engraving: "Engraving",
  ready: "Ready",
  collected: "Collected",
  issue: "Issue",
};

const STATUS_BADGE: Record<OrderStatus, string> = {
  waiting:   "bg-amber-50 text-amber-700 border border-amber-200",
  engraving: "bg-blue-50 text-blue-700 border border-blue-200",
  ready:     "bg-emerald-50 text-emerald-700 border border-emerald-200",
  collected: "bg-stone-100 text-stone-600 border border-stone-200",
  issue:     "bg-red-50 text-red-700 border border-red-200",
  cancelled: "bg-stone-100 text-stone-400 border border-stone-200",
};

export default function AdminDashboard() {
  const [events, setEvents] = useState<EmbossEvent[]>([]);
  const [eventId, setEventId] = useState<string>("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [template, setTemplate] = useState<EventTemplate | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Order | null>(null);
  const [editName, setEditName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "crew" | null>(null);
  const [lockedEventId, setLockedEventId] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [expandedActions, setExpandedActions] = useState<string | null>(null);
  const [highlightedRow, setHighlightedRow] = useState<string | null>(null);

  // Load current session
  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((j) => {
        setRole(j.role ?? null);
        setLockedEventId(j.eventId ?? null);
        setSessionLoaded(true);
      })
      .catch(() => setSessionLoaded(true));
  }, []);

  // Load events (filter to locked event for crew)
  useEffect(() => {
    if (!sessionLoaded) return;
    (async () => {
      const base = supabase.from("events").select("*");
      const { data } =
        role === "crew" && lockedEventId
          ? await base.eq("id", lockedEventId)
          : await base.order("created_at", { ascending: false });
      const evs = (data as EmbossEvent[]) ?? [];
      setEvents(evs);
      if (role === "crew" && lockedEventId) {
        setEventId(lockedEventId);
      } else {
        const active = evs.find((e) => e.status === "active") ?? evs[0];
        if (active) setEventId(active.id);
      }
    })();
  }, [role, lockedEventId, sessionLoaded]);

  // Load template for the selected event (for minutes_per_order)
  useEffect(() => {
    if (!eventId) {
      setTemplate(null);
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("event_templates")
        .select("*")
        .eq("event_id", eventId)
        .maybeSingle();
      if (!alive) return;
      setTemplate((data as EventTemplate) ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [eventId]);

  // Load + subscribe orders for selected event
  const prevOrdersRef = useRef<Order[]>([]);
  useEffect(() => {
    if (!eventId) return;
    let alive = true;
    async function load() {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (!alive) return;
      const newOrders = (data as Order[]) ?? [];
      
      // Detect status changes for highlight animation
      const prevMap = new Map(prevOrdersRef.current.map((o: Order) => [o.id, o.status]));
      for (const order of newOrders) {
        const prevStatus = prevMap.get(order.id);
        if (prevStatus && prevStatus !== order.status) {
          setHighlightedRow(order.id);
          setTimeout(() => setHighlightedRow(null), 600);
        }
      }
      
      prevOrdersRef.current = newOrders;
      setOrders(newOrders);
    }
    load();
    const channel = supabase
      .channel(`admin-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `event_id=eq.${eventId}` },
        () => load()
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter !== "all" && o.status !== filter) return false;
      if (!q) return true;
      return (
        o.guest_name.toLowerCase().includes(q) ||
        o.queue_number.toLowerCase().includes(q)
      );
    });
  }, [orders, filter, search]);

  // Active queue = waiting + engraving. Wait-time estimate = depth * minutes_per_order.
  const waitEstimate = useMemo(() => {
    const mpo = Number(template?.minutes_per_order ?? 0);
    if (!mpo) return null;
    const active = orders.filter(
      (o) => o.status === "waiting" || o.status === "engraving"
    ).length;
    const minutes = Math.max(0, Math.round(active * mpo));
    return { minutes, active };
  }, [orders, template]);

  const orderFonts = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) if (o.selected_font) set.add(o.selected_font);
    return Array.from(set);
  }, [orders]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [orders]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  async function logActivity(
    order: Order,
    action: string,
    newStatus?: OrderStatus
  ) {
    await supabase.from("order_activity").insert({
      order_id: order.id,
      action,
      old_status: order.status,
      new_status: newStatus ?? null,
    });
  }

  async function updateStatus(o: Order, newStatus: OrderStatus, action: string) {
    const patch: Record<string, any> = { status: newStatus };
    if (newStatus === "engraving" && !o.engraving_started_at)
      patch.engraving_started_at = new Date().toISOString();
    if (newStatus === "ready") patch.ready_at = new Date().toISOString();
    if (newStatus === "collected") patch.collected_at = new Date().toISOString();
    const { error } = await supabase.from("orders").update(patch).eq("id", o.id);
    if (error) {
      flash(`Error: ${error.message}`);
      return;
    }
    await logActivity(o, action, newStatus);
  }

  async function copyName(o: Order) {
    try {
      await navigator.clipboard.writeText(o.guest_name);
      flash(`Copied “${o.guest_name}”`);
    } catch {
      flash("Copy failed — select & copy manually");
    }
    await logActivity(o, "copy_name");
  }

  // Start = copy guest name to clipboard AND move order to "engraving".
  async function startEngraving(o: Order) {
    try {
      await navigator.clipboard.writeText(o.guest_name);
      flash(`Copied “${o.guest_name}” · started`);
    } catch {
      flash("Copy failed — name not copied, but order started");
    }
    if (o.status !== "engraving") {
      await updateStatus(o, "engraving", "start_engraving");
    }
  }

  async function saveEditName() {
    if (!editing) return;
    const trimmed = editName.trim();
    if (!trimmed) return;
    const oldName = editing.guest_name;
    const { error } = await supabase
      .from("orders")
      .update({
        guest_name: trimmed,
        notes: appendNote(editing.notes, `Name edited from "${oldName}" to "${trimmed}"`),
      })
      .eq("id", editing.id);
    if (error) {
      flash(`Error: ${error.message}`);
      return;
    }
    await logActivity(editing, `name_edited:${oldName}->${trimmed}`);
    setEditing(null);
    flash("Name updated");
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    window.location.href = "/admin";
  }

  return (
    <main className="min-h-screen p-4 md:p-6 pb-10">
      <GoogleFontsLoader fonts={orderFonts} />
      <header className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-sand/50">
        <div>
          <p className="text-[10px] tracking-[0.5em] text-mocha uppercase mb-1">
            EMBOSS · {role === "admin" ? "Admin" : "Crew"}
          </p>
          <h1 className="font-serif text-2xl md:text-3xl flex items-center gap-2.5 flex-wrap">
            Production Dashboard
            {role && (
              <span
                className={`text-[10px] font-sans font-semibold tracking-widest px-2.5 py-1 rounded-full ${
                  role === "admin"
                    ? "bg-ink text-ivory"
                    : "bg-champagne text-mocha border border-sand"
                }`}
              >
                {role.toUpperCase()}
              </span>
            )}
            {waitEstimate && (
              <span
                className="text-[11px] font-sans px-3 py-1 rounded-full bg-gold/10 text-mocha border border-gold/30"
                title={`${waitEstimate.active} order(s) in queue × ${Number(
                  template?.minutes_per_order ?? 0
                )} min each`}
              >
                ⏱ Est. wait ~{waitEstimate.minutes} min
              </span>
            )}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            className="input !py-2 !text-sm max-w-xs disabled:opacity-60 disabled:cursor-not-allowed"
            value={eventId}
            disabled={role === "crew"}
            onChange={(e) => setEventId(e.target.value)}
          >
            {events.length === 0 && <option value="">No events</option>}
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.event_name} {e.status === "active" ? "· active" : ""}
              </option>
            ))}
          </select>
          {role === "admin" && (
            <Link href="/admin/events" className="btn-secondary !py-2 !text-sm">
              Manage Events
            </Link>
          )}
          <button onClick={logout} className="btn-ghost !py-2 !text-sm">
            Sign Out
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip !py-1.5 !px-3 !text-xs ${filter === f.key ? "chip-active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {FILTER_LABEL[f.key]}
            <span className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              filter === f.key ? "bg-white/20" : "bg-sand/50 text-mocha"
            }`}>{counts[f.key] ?? 0}</span>
          </button>
        ))}
        <input
          className="input !py-2 !text-sm max-w-[200px] ml-auto"
          placeholder="Search name or #"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto card">
        <table className="w-full text-sm">
          <thead className="bg-ivory sticky top-0 z-10">
            <tr className="text-left text-mocha uppercase text-[10px] tracking-[0.07em] border-b border-sand/60">
              <th className="px-4 py-3 font-semibold">Queue</th>
              <th className="px-4 py-3 font-semibold">Guest</th>
              <th className="px-4 py-3 font-semibold">Font</th>
              <th className="px-4 py-3 font-semibold">Colour</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">Notes</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-16 text-mocha">
                  <p className="font-serif text-xl mb-1">No orders</p>
                  <p className="text-sm text-mocha/60">Matching orders will appear here.</p>
                </td>
              </tr>
            )}
            {filtered.map((o) => (
              <tr key={o.id} className={`border-t border-sand/30 hover:bg-champagne/10 transition-colors duration-100 ${highlightedRow === o.id ? 'animate-highlight' : ''}`}>
                <td className="px-4 py-3 font-serif text-xl tabular-nums">{o.queue_number}</td>
                <td className="px-4 py-3 font-semibold text-ink">{o.guest_name}</td>
                <td className="px-4 py-3">
                  {o.selected_font ? (
                    <span
                      className={`text-base leading-tight ${fontClassFor(o.selected_font)}`}
                      style={fontStyleFor(o.selected_font)}
                      title={fontDisplayName(o.selected_font)}
                    >
                      {fontDisplayName(o.selected_font)}
                    </span>
                  ) : (
                    <span className="text-mocha/40">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-mocha">{o.selected_colour ? parseColour(o.selected_colour).name : <span className="text-mocha/40">—</span>}</td>
                <td className="px-4 py-3">
                  <span
                    className={`badge ${
                      STATUS_BADGE[o.status as OrderStatus]
                    }`}
                  >
                    {STATUS_LABEL[o.status as OrderStatus]}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-mocha tabular-nums">{formatTime(o.created_at)}</td>
                <td className="px-4 py-3 max-w-[180px] truncate text-xs text-mocha" title={o.notes ?? ""}>
                  {o.notes ?? ""}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-end gap-2">
                    {/* Primary workflow actions */}
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      <ActionButton
                        label="Start"
                        active={o.status === "engraving"}
                        variant="blue"
                        onClick={() => startEngraving(o)}
                        title="Copy name to clipboard and start engraving"
                      />
                      <ActionButton
                        label="Ready"
                        active={o.status === "ready"}
                        variant="emerald"
                        onClick={() => updateStatus(o, "ready", "mark_ready")}
                      />
                      <ActionButton
                        label="Collected"
                        active={o.status === "collected"}
                        variant="stone"
                        onClick={() => updateStatus(o, "collected", "mark_collected")}
                      />
                      {/* More actions toggle */}
                      <button
                        className={`btn btn-xs ${expandedActions === o.id ? 'bg-champagne/50 border-champagne' : 'btn-secondary'}`}
                        onClick={() => setExpandedActions(expandedActions === o.id ? null : o.id)}
                        title="More actions"
                      >
                        {expandedActions === o.id ? 'Less' : 'More'}
                        <svg className={`w-3 h-3 ml-1 transition-transform ${expandedActions === o.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2 4l4 4 4-4" />
                        </svg>
                      </button>
                    </div>
                    
                    {/* Expanded secondary actions */}
                    {expandedActions === o.id && (
                      <div className="flex flex-wrap gap-1.5 justify-end animate-fade-in pt-1 border-t border-sand/40">
                        <button
                          className="btn btn-xs btn-secondary"
                          onClick={() => copyName(o)}
                          title="Copy name to clipboard"
                        >
                          Copy Name
                        </button>
                        <button
                          className="btn btn-xs bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                          onClick={() => updateStatus(o, "issue", "mark_issue")}
                        >
                          Mark Issue
                        </button>
                        <button
                          className="btn btn-xs btn-ghost"
                          onClick={() => {
                            setEditing(o);
                            setEditName(o.guest_name);
                          }}
                        >
                          Edit Name
                        </button>
                        {o.status !== "cancelled" && (
                          <button
                            className="btn btn-xs text-red-600 hover:bg-red-50"
                            onClick={() => {
                              if (confirm("Cancel this order?"))
                                updateStatus(o, "cancelled", "cancel");
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {eventId && (
        <p className="text-[11px] text-mocha/60 mt-4 flex flex-wrap gap-x-3 gap-y-1">
          <span>
            Collection:{" "}
            <Link className="underline hover:text-ink transition-colors" href={`/collection/${eventId}`}>
              /collection/{eventId}
            </Link>
          </span>
          <span>·</span>
          <span>
            Guest iPad:{" "}
            <Link className="underline hover:text-ink transition-colors" href={`/event/${eventId}`}>
              /event/{eventId}
            </Link>
          </span>
        </p>
      )}

      {editing && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="card max-w-md w-full p-8 shadow-card">
            <h2 className="font-serif text-2xl mb-1">Edit Name</h2>
            <p className="text-mocha text-sm mb-5">Queue <strong>{editing.queue_number}</strong></p>
            <div className="border-t border-sand/50 mb-5" />
            <label className="label">Guest Name</label>
            <input
              className="input text-lg"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
            />
            <div className="flex gap-3 mt-6">
              <button className="btn-secondary flex-1" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn-primary flex-1" onClick={saveEditName}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-ivory px-5 py-3 rounded-full shadow-card z-50 text-sm font-medium tracking-wide animate-fade-up">
          {toast}
        </div>
      )}
    </main>
  );
}

function appendNote(existing: string | null, line: string) {
  const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const entry = `[${ts}] ${line}`;
  return existing ? `${existing}\n${entry}` : entry;
}

interface ActionButtonProps {
  label: string;
  active: boolean;
  variant: "blue" | "emerald" | "stone";
  onClick: () => void;
  title?: string;
}

function ActionButton({ label, active, variant, onClick, title }: ActionButtonProps) {
  const variantStyles = {
    blue: active
      ? "bg-blue-200 text-blue-800 border border-blue-300 cursor-default"
      : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm",
    emerald: active
      ? "bg-emerald-200 text-emerald-800 border border-emerald-300 cursor-default"
      : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
    stone: active
      ? "bg-stone-300 text-stone-700 border border-stone-400 cursor-default"
      : "bg-stone-700 text-white hover:bg-stone-800 shadow-sm",
  };

  return (
    <button
      className={`btn btn-xs font-semibold transition-all duration-150 ${variantStyles[variant]}`}
      disabled={active}
      onClick={onClick}
      title={title}
    >
      {active ? (
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l2 2 4-4" />
          </svg>
          {label}
        </span>
      ) : (
        label
      )}
    </button>
  );
}
