"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  supabase,
  STATUS_LABEL,
  STATUS_STEPS,
  type EmbossEvent,
  type EventTemplate,
  type Order,
  type OrderStatus,
} from "@/lib/supabase";
import Footer from "@/components/Footer";

export default function StatusPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [event, setEvent] = useState<EmbossEvent | null>(null);
  const [template, setTemplate] = useState<EventTemplate | null>(null);
  const [aheadCount, setAheadCount] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const prevStatusRef = useRef<OrderStatus | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();
      if (!active) return;
      if (error) {
        setErr(error.message);
        return;
      }
      const ord = data as Order;
      setOrder(ord);
      prevStatusRef.current = ord.status as OrderStatus;
      const [{ data: ev }, { data: tpl }] = await Promise.all([
        supabase.from("events").select("*").eq("id", ord.event_id).single(),
        supabase
          .from("event_templates")
          .select("*")
          .eq("event_id", ord.event_id)
          .maybeSingle(),
      ]);
      if (!active) return;
      setEvent(ev as EmbossEvent);
      setTemplate((tpl as EventTemplate) ?? null);
    }
    load();

    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        (payload) => setOrder(payload.new as Order)
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  // Subscribe to all orders in the event to keep the "ahead of me" count live.
  useEffect(() => {
    if (!order) return;
    let alive = true;
    const eventId = order.event_id;
    const myCreatedAt = order.created_at;

    async function refreshAhead() {
      // Count orders in the same event that are still in the active pipeline
      // (waiting or engraving) and were created before mine.
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .lt("created_at", myCreatedAt)
        .in("status", ["waiting", "engraving"]);
      if (!alive) return;
      setAheadCount(count ?? 0);
    }
    refreshAhead();

    const channel = supabase
      .channel(`event-orders-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `event_id=eq.${eventId}` },
        () => refreshAhead()
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [order?.event_id, order?.created_at]);

  // When the status flips to "ready", beep + vibrate + title flash.
  useEffect(() => {
    if (!order) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = order.status as OrderStatus;
    if (prev && prev !== "ready" && order.status === "ready") {
      playReadyChime();
      try {
        navigator.vibrate?.([200, 100, 200, 100, 400]);
      } catch {}
      flashTitle("🔔 Gift ready — collect now");
    }
  }, [order?.status]);

  if (err) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-10 max-w-md w-full text-center">
          <p className="text-3xl mb-3">⚠️</p>
          <h1 className="font-serif text-3xl mb-2">Order not found</h1>
          <p className="text-mocha text-sm leading-relaxed">{err}</p>
        </div>
      </main>
    );
  }
  if (!order) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-10 max-w-md w-full text-center">
          <div className="w-8 h-8 border-2 border-sand border-t-gold rounded-full animate-spin mx-auto mb-4" />
          <p className="font-serif text-2xl text-mocha">Loading…</p>
        </div>
      </main>
    );
  }

  const status = order.status as OrderStatus;
  const stepIdx = STATUS_STEPS.indexOf(status);
  const isProblem = status === "issue" || status === "cancelled";

  const totalSteps = STATUS_STEPS.length;
  const progress = isProblem
    ? 0
    : Math.max(0, Math.min(1, (stepIdx + 1) / totalSteps));

  return (
    <main className="min-h-screen p-5 flex flex-col">
      <div className="max-w-xl mx-auto w-full flex-1 pb-4">
        <header className="text-center mb-5 pt-2">
          <p className="text-[10px] tracking-[0.5em] text-mocha uppercase mb-1">EMBOSS</p>
          <h1 className="font-serif text-2xl md:text-3xl leading-tight">
            {event?.event_name ?? "Your Gift"}
          </h1>
        </header>

        {!isProblem && status !== "collected" && status !== "ready" && (
          <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-center mb-4 animate-fade-in">
            <p className="text-sm font-bold text-red-700">
              ⚠️ Please do not close this page.
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              It updates automatically when your gift is ready for collection.
            </p>
            <EnableSoundButton />
          </div>
        )}

        {/* Hero — name + queue */}
        <div className="card p-6 md:p-7 text-center mb-4 animate-fade-in">
          <p className="text-[10px] uppercase tracking-[0.3em] text-mocha mb-1">
            Engraving for
          </p>
          <p className="font-serif text-4xl md:text-5xl text-ink leading-tight mb-5">
            {order.guest_name}
          </p>
          <div className="bg-ivory rounded-2xl p-4 border border-sand/60">
            <p className="text-[10px] uppercase tracking-[0.3em] text-mocha">
              Queue Number
            </p>
            <p className="font-serif text-6xl md:text-7xl mt-1 leading-none py-1">
              {order.queue_number}
            </p>
          </div>
        </div>

        {/* Status + progress bar */}
        <div
          className={`card p-6 mb-4 animate-fade-in ${
            isProblem ? "bg-red-50 border-red-200" : ""
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-[0.3em] text-mocha">
              Current Status
            </p>
            {!isProblem && (
              <span className="text-[10px] bg-sand/40 text-mocha px-2 py-0.5 rounded-full tabular-nums">
                {Math.min(stepIdx + 1, totalSteps)} / {totalSteps}
              </span>
            )}
          </div>
          <p
            className={`font-serif text-2xl md:text-3xl mb-4 ${
              isProblem ? "text-red-700" : "text-ink"
            }`}
          >
            {STATUS_LABEL[status]}
          </p>
          {!isProblem && (
            <>
              <div className="w-full h-2.5 bg-sand/40 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-gold rounded-full transition-[width] duration-700 ease-out"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <ol className="grid grid-cols-4 gap-1 text-[10px] tracking-wide">
                {STATUS_STEPS.map((s, i) => (
                  <li
                    key={s}
                    className={`text-center truncate transition-colors ${
                      i < stepIdx
                        ? "text-gold/80 font-medium"
                        : i === stepIdx
                        ? "text-ink font-semibold"
                        : "text-mocha/40"
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>

        {!isProblem && status !== "collected" && status !== "ready" && (
          <EtaCard
            aheadCount={aheadCount}
            minutesPerOrder={Number(template?.minutes_per_order ?? 0)}
            status={status}
          />
        )}

        {status === "ready" && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-4 text-center mb-4">
            <p className="text-xl mb-0.5">✨</p>
            <p className="text-base font-semibold text-emerald-800">
              Your gift is ready!
            </p>
            <p className="text-sm text-emerald-700 mt-0.5">Please collect it at the counter now.</p>
          </div>
        )}

        {status === "collected" && (
          <div className="rounded-xl bg-stone-50 border border-stone-200 px-4 py-4 text-center mb-4">
            <p className="text-xl mb-0.5">🎁</p>
            <p className="text-sm font-semibold text-stone-700">Gift collected. Enjoy!</p>
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
}

function Center({ title, body }: { title: string; body?: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="card p-10 max-w-md w-full text-center">
        <h1 className="font-serif text-3xl mb-2">{title}</h1>
        {body && <p className="text-mocha text-sm leading-relaxed">{body}</p>}
      </div>
    </main>
  );
}

function EtaCard({
  aheadCount,
  minutesPerOrder,
  status,
}: {
  aheadCount: number | null;
  minutesPerOrder: number;
  status: OrderStatus;
}) {
  if (!minutesPerOrder || aheadCount === null) return null;
  // My remaining time = (orders ahead + this order) * minutesPerOrder.
  // If currently engraving, assume half is already done.
  const selfRemaining = status === "engraving" ? 0.5 : 1;
  const minutes = Math.max(
    0,
    Math.round((aheadCount + selfRemaining) * minutesPerOrder)
  );
  const position = aheadCount + 1;
  return (
    <div className="card p-5 mb-4 text-center animate-fade-up">
      <p className="text-[10px] uppercase tracking-[0.3em] text-mocha mb-1">
        Estimated Wait
      </p>
      <p className="font-serif text-4xl md:text-5xl leading-none py-1">
        ~{minutes} min
      </p>
      <p className="text-xs text-mocha mt-2">
        Position <strong className="text-ink">{position}</strong>
        {aheadCount > 0
          ? <span className="text-mocha/70"> · {aheadCount} order{aheadCount === 1 ? "" : "s"} ahead</span>
          : <span className="text-emerald-600 font-semibold"> · You're next!</span>}
      </p>
    </div>
  );
}

function EnableSoundButton() {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    // Consider sound "armed" if we've already primed the AudioContext.
    setArmed(!!(window as any).__embossAudioArmed);
  }, []);
  if (armed) return null;
  return (
    <button
      type="button"
      onClick={() => {
        primeAudio();
        setArmed(true);
      }}
      className="mt-2.5 text-[11px] text-mocha/70 underline underline-offset-2 hover:text-ink transition-colors duration-150"
    >
      🔔 Tap to enable sound alert when ready
    </button>
  );
}

// ---------- audio + title helpers ----------

function primeAudio() {
  try {
    const AC: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    (window as any).__embossAudioCtx = ctx;
    (window as any).__embossAudioArmed = true;
    // Play an inaudible blip to satisfy autoplay gesture requirement.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
  } catch {}
}

function playReadyChime() {
  try {
    let ctx: AudioContext | undefined = (window as any).__embossAudioCtx;
    if (!ctx) {
      const AC: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      (window as any).__embossAudioCtx = ctx;
    }
    // Two-note chime: G5 → C6.
    const now = ctx.currentTime;
    const tones: { freq: number; start: number; dur: number }[] = [
      { freq: 784, start: 0, dur: 0.25 },
      { freq: 1046, start: 0.18, dur: 0.45 },
    ];
    for (const t of tones) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = t.freq;
      osc.connect(g).connect(ctx.destination);
      const s = now + t.start;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.3, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + t.dur);
      osc.start(s);
      osc.stop(s + t.dur + 0.05);
    }
  } catch {}
}

function flashTitle(msg: string) {
  if (typeof document === "undefined") return;
  const original = document.title;
  let on = true;
  const handle = setInterval(() => {
    document.title = on ? msg : original;
    on = !on;
  }, 800);
  const stop = () => {
    clearInterval(handle);
    document.title = original;
    document.removeEventListener("visibilitychange", onVis);
  };
  const onVis = () => {
    if (document.visibilityState === "visible") stop();
  };
  document.addEventListener("visibilitychange", onVis);
  // Auto-stop after 60s in any case.
  setTimeout(stop, 60000);
}
