'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Repo = {
  id: string;
  repository: string;
  branch: string;
  status: string;
};

export function NiaPanel({ repos: initial }: { repos: Repo[] }) {
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[]>(initial);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function index(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const v = input.trim();
    if (!v) return;
    setBusy(true);
    try {
      const r = await fetch('/api/nia/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repository: v }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErr(data?.error ?? 'index failed');
        return;
      }
      setInput('');
      // Refresh list
      const list = await fetch('/api/nia/index').then((x) => x.json()).catch(() => null);
      if (list?.repos) setRepos(list.repos);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm shadow-gray-200/50 border border-gray-100 p-6">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center text-white font-semibold">
          Nia
        </div>
        <div className="flex-1">
          <div className="text-base font-semibold text-gray-900">World context · Nia</div>
          <p className="text-sm text-gray-500 mt-0.5">
            Index public GitHub repos, docs, or research papers. Used by the agent for upstream context.
          </p>
        </div>
      </div>

      <form onSubmit={index} className="mt-5 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="owner/repo (e.g. openai/openai-python)"
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy}
          className="bg-gray-900 text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-gray-800 active:scale-[.98] transition disabled:opacity-50"
        >
          {busy ? 'Indexing…' : 'Index'}
        </button>
      </form>

      {err && (
        <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      {repos.length > 0 && (
        <div className="mt-5">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">
            Indexed repos · {repos.length}
          </div>
          <ul className="space-y-1">
            {repos.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-100 bg-gray-50/50"
              >
                <span className="font-mono text-sm text-gray-900 truncate flex-1">{r.repository}</span>
                <span className="text-xs text-gray-500">@{r.branch}</span>
                <span
                  className={
                    r.status === 'indexed'
                      ? 'bg-green-50 text-green-700 ring-1 ring-green-200 rounded-full px-2 py-0.5 text-xs'
                      : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 rounded-full px-2 py-0.5 text-xs'
                  }
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
