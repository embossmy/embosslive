import Link from "next/link";
import { getRole } from "@/lib/auth";

export default function EventsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = getRole();
  if (role !== "admin") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-8 md:p-10 max-w-md w-full text-center">
          <p className="text-[10px] tracking-[0.5em] text-mocha uppercase mb-3">EMBOSS</p>
          <h1 className="font-serif text-3xl mb-1">Admin only</h1>
          <div className="border-t border-sand/50 my-5" />
          <p className="text-mocha text-sm mb-6 leading-relaxed">
            Event setup is restricted to administrators. Please log in with the
            admin password.
          </p>
          <Link href="/admin" className="btn-primary inline-flex">
            ← Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}
