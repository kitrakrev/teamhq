'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const PROMPT_SUGGESTIONS = [
  'Port the FastAPI inference service to Go for cost + p99 latency.',
  'Bump openai-python from 0.28 to 1.0 and migrate every call site.',
  'Migrate the React CRA frontend to Next.js App Router.',
  'Add streaming completions to the chat UI for paying customers.',
];

type Props = {
  projectId: string;
  hasRepos: boolean;
  orgSlug: string;
};

export function TriggerForm({ projectId, hasRepos, orgSlug }: Props) {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!hasRepos) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        Attach a repo to this project before triggering a run.
        <a
          href={`/orgs/${orgSlug}/onboard`}
          className="ml-2 underline-offset-2 underline hover:no-underline"
        >
          Connect a repo →
        </a>
      </div>
    );
  }

  function submit() {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError('Type the change you want shipped.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch('/api/run-scenario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, prompt: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string; hint?: string }).error ?? `error ${res.status}`);
        return;
      }
      const redirect = (data as { redirect?: string }).redirect ?? '/';
      router.push(redirect);
    });
  }

  return (
    <div className="space-y-3">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g. Port the FastAPI inference service to Go for cost + p99 latency."
        rows={4}
        disabled={pending}
        className="block w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-0 transition disabled:opacity-50"
      />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-500">Try:</span>
        {PROMPT_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setPrompt(s)}
            disabled={pending}
            className="rounded-full border border-gray-200 px-3 py-1 text-gray-600 hover:border-gray-400 hover:text-gray-900 transition disabled:opacity-50"
          >
            {s.length > 38 ? s.slice(0, 36) + '…' : s}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={pending || !prompt.trim()}
          className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 active:scale-[.98] disabled:opacity-50"
        >
          {pending ? 'Triggering…' : 'Trigger run'}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
