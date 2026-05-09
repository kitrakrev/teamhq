'use client';

import { useEffect, useState, useTransition } from 'react';
import { Card } from './Card';
import { ViewAsToggle } from './ViewAsToggle';
import { PERSONAS, type Persona } from '@/lib/personas';
import type { Card as CardRow, Run } from '@/lib/insforge';

type Props = {
  initialRuns: Run[];
  initialCards: CardRow[];
  initialRunId: string | null;
};

export function Feed({ initialRuns, initialCards, initialRunId }: Props) {
  const [viewerKey, setViewerKey] = useState<Persona['key']>('sarah');
  const [runs, setRuns] = useState<Run[]>(initialRuns);
  const [cards, setCards] = useState<CardRow[]>(initialCards);
  const [runId, setRunId] = useState<string | null>(initialRunId);
  const [, startTransition] = useTransition();

  const viewer = PERSONAS.find(p => p.key === viewerKey)!;

  // Poll every 2s — InsForge realtime WS can replace this in V2 polish.
  useEffect(() => {
    if (!runId) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/runs/${runId}/cards`, { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        startTransition(() => setCards(d.cards ?? []));
      }
      const r = await fetch(`/api/runs`, { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        startTransition(() => setRuns(d.runs ?? []));
      }
    }, 2000);
    return () => clearInterval(t);
  }, [runId]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-tight">TeamHQ</h1>
          <span className="text-sm text-slate-500">/ Acme Eng / migrations</span>
          <div className="ml-auto flex items-center gap-2">
            <select
              value={runId ?? ''}
              onChange={e => setRunId(e.target.value || null)}
              className="text-sm border border-slate-200 rounded px-2 py-1 bg-white"
            >
              {runs.map(r => (
                <option key={r.id} value={r.id}>
                  {r.trigger_source?.slice(0, 50) ?? r.id.slice(0, 8)} — {r.status}
                </option>
              ))}
            </select>
          </div>
        </div>
        <ViewAsToggle current={viewerKey} onChange={setViewerKey} />
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-3">
        {cards.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            No cards yet for this run. Trigger an agent run from the terminal:
            <pre className="inline-block mx-2 px-2 py-1 bg-slate-900 text-slate-100 rounded text-xs">python -m agent fastapi-go</pre>
          </div>
        ) : (
          cards.map(c => <Card key={c.id} card={c} viewer={viewer} />)
        )}
      </main>
    </div>
  );
}
