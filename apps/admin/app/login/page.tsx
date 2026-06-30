"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
          <section>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-400 text-sm font-bold text-emerald-950">
                QL
              </span>
              <div>
                <p className="text-sm font-semibold">Quickload Admin</p>
                <p className="text-xs text-slate-400">Production operations</p>
              </div>
            </div>
            <h1 className="mt-10 max-w-2xl text-4xl font-semibold tracking-normal text-white sm:text-5xl">
              Parcel operations without the noise.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
              Monitor payments, carrier progress, customer records, and support actions from one staff console.
            </p>
            <dl className="mt-10 grid max-w-xl gap-4 text-sm text-slate-300 sm:grid-cols-3">
              <div className="border-t border-slate-800 pt-4">
                <dt className="font-medium text-white">Live data</dt>
                <dd className="mt-1">Production Supabase</dd>
              </div>
              <div className="border-t border-slate-800 pt-4">
                <dt className="font-medium text-white">Protected</dt>
                <dd className="mt-1">Supabase Auth</dd>
              </div>
              <div className="border-t border-slate-800 pt-4">
                <dt className="font-medium text-white">Staff focus</dt>
                <dd className="mt-1">Exceptions first</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl bg-white p-6 text-slate-950 shadow-sm">
            <h2 className="text-xl font-semibold">Sign in</h2>
            <p className="mt-2 text-sm text-slate-600">Use the admin account from production Supabase Auth.</p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input
                  type="email"
                  className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Password
                <input
                  type="password"
                  className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <button type="submit" className="h-11 w-full rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus:ring-2 focus:ring-emerald-500">
                Sign in
              </button>
            </form>
            {error && (
              <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {error}
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
