"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase, type EmbossEvent, type Order } from "@/lib/supabase";
import Footer from "@/components/Footer";

export default function CollectionScreen() {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<EmbossEvent | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    (async () => {
      const { data: ev } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();
      setEvent(ev as EmbossEvent);
      await refresh();
    })();

    async function refresh() {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("event_id", eventId)
        .eq("status", "ready")
        .order("ready_at", { ascending: true });
      setOrders((data as Order[]) ?? []);
    }

    const channel = supabase
      .channel(`collection-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `event_id=eq.${eventId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  return (
    <main className="min-h-screen flex flex-col p-8 lg:p-14">
      <header className="text-center mb-10">
        <p className="text-[11px] tracking-[0.5em] text-mocha/70 uppercase mb-2">EMBOSS</p>
        <h1 className="font-serif text-5xl lg:text-6xl leading-tight">
          {event?.event_name ?? "Event"}
        </h1>
        <div className="flex items-center justify-center gap-3 mt-3">
          <div className="h-px flex-1 max-w-[80px] bg-gold/40" />
          <p className="font-serif text-2xl lg:text-3xl text-gold">
            Ready for Collection
          </p>
          <div className="h-px flex-1 max-w-[80px] bg-gold/40" />
        </div>
      </header>

      <section className="flex-1">
        {orders.length === 0 ? (
          <div className="card h-full min-h-[40vh] flex flex-col items-center justify-center p-16 gap-4">
            <div className="w-10 h-10 border-2 border-sand border-t-gold rounded-full animate-spin" />
            <p className="font-serif text-3xl lg:text-4xl text-mocha">
              Preparing your gifts…
            </p>
            <p className="text-sm text-mocha/60">Gifts will appear here when ready.</p>
          </div>
        ) : (
          <div
            className="grid gap-5 stagger-children"
            style={{
              gridTemplateColumns:
                "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
            }}
          >
            {orders.map((o) => (
              <div
                key={o.id}
                className="card flex flex-col items-center justify-center py-12 border-2 border-gold/30 bg-champagne/10 shadow-card animate-scale-in"
              >
                <p className="text-xs uppercase tracking-[0.25em] text-mocha/70 mb-1">
                  Queue
                </p>
                <p className="font-serif text-7xl lg:text-8xl my-2 text-ink leading-none">
                  {o.queue_number}
                </p>
                <div className="h-px w-16 bg-gold/40 my-3" />
                <p className="text-xl font-medium text-ink">{o.guest_name}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="text-center mt-10 border-t border-sand/40 pt-6">
        <p className="text-lg text-mocha/80">
          Please collect your personalized gift at the counter.
        </p>
      </footer>
      <Footer />
    </main>
  );
}
