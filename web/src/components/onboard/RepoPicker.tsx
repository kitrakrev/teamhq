'use client';

import { useState, useTransition } from 'react';
import { CheckIcon } from './Icons';

export type PickableRepo = {
  full_name: string;
  default_branch: string;
  description?: string | null;
  isFocus?: boolean;
};

export function RepoPicker({ repos, action }: { repos: PickableRepo[]; action: (formData: FormData) => Promise<void> }) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(repos.filter((r) => r.isFocus).map((r) => r.full_name)),
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(full: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(full)) next.delete(full);
      else next.add(full);
      return next;
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    for (const r of repos) {
      if (selected.has(r.full_name)) {
        fd.append('repo', `${r.full_name}::${r.default_branch}`);
      }
    }
    startTransition(async () => {
      try {
        await action(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {repos.map((r) => {
          const on = selected.has(r.full_name);
          return (
            <button
              type="button"
              key={r.full_name}
              onClick={() => toggle(r.full_name)}
              className={`relative text-left rounded-2xl border p-4 transition cursor-pointer
                ${on ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white hover:border-gray-900 hover:bg-gray-50'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-sm text-gray-900 truncate">{r.full_name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {r.default_branch}
                    {r.isFocus && <span className="ml-2 inline-block bg-gray-900 text-white rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide">FOCUS</span>}
                  </div>
                  {r.description && <div className="text-xs text-gray-500 mt-2 line-clamp-2">{r.description}</div>}
                </div>
                <span
                  className={`shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full border ${
                    on ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 bg-white text-transparent'
                  }`}
                  aria-hidden
                >
                  <CheckIcon className="h-3 w-3" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-gray-500">{selected.size} selected</div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={isPending || selected.size === 0}
          className="bg-gray-900 text-white rounded-xl px-6 py-3 hover:bg-gray-800 active:scale-[.98] transition disabled:opacity-40"
        >
          {isPending ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </form>
  );
}
