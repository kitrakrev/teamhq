'use client';

import { useState, useTransition } from 'react';

export type ScenarioKey = 'fastapi-go' | 'openai-bump' | 'react-nextjs';

export function ScenarioButton({
  projectId,
  scenarioKey,
  title,
  subtitle,
  emoji,
}: {
  projectId: string;
  scenarioKey: ScenarioKey;
  title: string;
  subtitle: string;
  emoji: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function trigger() {
    setError(null);
    startTransition(async () => {
      const r = await fetch('/api/run-scenario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, scenario: scenarioKey }),
      });
      if (!r.ok) {
        setError(`Failed (${r.status})`);
        return;
      }
      const data = (await r.json()) as { runId?: string; redirect?: string };
      if (data.redirect) {
        window.location.href = data.redirect;
      }
    });
  }

  return (
    <button
      type="button"
      onClick={trigger}
      disabled={isPending}
      className="text-left bg-white rounded-2xl shadow-sm shadow-gray-200/50 border border-gray-100 p-5 hover:border-gray-900 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
    >
      <div className="text-2xl">{emoji}</div>
      <div className="mt-3 text-base font-semibold text-gray-900">{title}</div>
      <div className="text-sm text-gray-500 mt-1">{subtitle}</div>
      <div className="mt-4 inline-flex items-center gap-2 text-sm text-gray-900 font-medium">
        {isPending ? 'Starting…' : 'Trigger run →'}
      </div>
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
    </button>
  );
}
