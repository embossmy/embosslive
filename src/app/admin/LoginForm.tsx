"use client";

import { useState } from "react";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (r.ok) {
      window.location.reload();
    } else {
      const j = await r.json().catch(() => ({}));
      setErr(j.error ?? "Login failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-8 md:p-10 max-w-md w-full">
      <p className="text-[10px] tracking-[0.5em] text-mocha uppercase mb-3">EMBOSS</p>
      <h1 className="font-serif text-3xl mb-1">Sign In</h1>
      <p className="text-mocha text-sm mb-6 leading-relaxed">
        Crew or admin password. Crew sees the production dashboard only;
        admins also manage events.
      </p>
      <div className="border-t border-sand/50 mb-6" />
      <label className="label">Password</label>
      <input
        type="password"
        className="input text-lg"
        value={password}
        autoFocus
        onChange={(e) => setPassword(e.target.value)}
      />
      {err && (
        <p className="flex items-center gap-2 text-red-600 text-sm mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <span className="shrink-0">⚠</span> {err}
        </p>
      )}
      <button className="btn-primary w-full mt-5 py-3.5 text-base" disabled={busy}>
        {busy ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}
