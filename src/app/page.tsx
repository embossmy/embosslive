import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 md:p-8">
      <div className="card max-w-2xl w-full p-8 md:p-12 text-center">
        <p className="text-[10px] tracking-[0.5em] text-mocha uppercase mb-3">EMBOSS</p>
        <h1 className="font-serif text-4xl md:text-5xl mb-2 leading-tight">
          Live Personalization System
        </h1>
        <p className="text-mocha text-sm md:text-base mb-8 max-w-sm mx-auto">
          Premium on-site laser engraving for weddings and corporate events.
        </p>

        <div className="border-t border-sand/50 mb-8" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
          <Link
            href="/admin"
            className="group card p-5 hover:shadow-soft hover:border-gold/40 transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <h3 className="font-serif text-2xl mb-1">Crew Dashboard</h3>
              <p className="text-sm text-mocha">Manage incoming orders</p>
            </div>
            <span className="mt-4 text-xs text-mocha/50 group-hover:text-gold transition-colors duration-200">
              Open →
            </span>
          </Link>
          <Link
            href="/admin/events"
            className="group card p-5 hover:shadow-soft hover:border-gold/40 transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <h3 className="font-serif text-2xl mb-1">Event Setup</h3>
              <p className="text-sm text-mocha">Create &amp; edit event templates</p>
            </div>
            <span className="mt-4 text-xs text-mocha/50 group-hover:text-gold transition-colors duration-200">
              Open →
            </span>
          </Link>
        </div>

        <p className="text-[11px] text-mocha/60 mt-8 space-x-1">
          Guest iPad:{" "}
          <code className="bg-champagne/50 px-1.5 py-0.5 rounded text-mocha font-mono text-[10px]">
            /event/[eventId]
          </code>
          {" · "}Collection:{" "}
          <code className="bg-champagne/50 px-1.5 py-0.5 rounded text-mocha font-mono text-[10px]">
            /collection/[eventId]
          </code>
        </p>
      </div>
    </main>
  );
}
