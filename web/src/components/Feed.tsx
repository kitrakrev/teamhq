'use client';

import { useEffect, useState, useTransition } from 'react';
import { Card } from './Card';
import { Chrome } from './Chrome';
import { ViewAsToggle } from './ViewAsToggle';
import { RunComposer } from './RunComposer';
import { Glyph } from './Glyph';
import { PERSONAS, type Persona } from '@/lib/personas';
import type { Card as CardRow, Run } from '@/lib/insforge';

type Props = {
  initialRuns: Run[];
  initialCards: CardRow[];
  initialRunId: string | null;
  orgName: string;
  orgSlug: string;
  sessionEmail: string | null;
};

export function Feed({ initialRuns, initialCards, initialRunId, orgName, orgSlug, sessionEmail }: Props) {
  // Pick the persona that matches the signed-in email so view-as defaults to
  // the actual logged-in user. Falls back to sarah for the demo cookie path.
  const initialPersona = (PERSONAS.find(p => p.email === sessionEmail)?.key ?? 'sarah') as Persona['key'];
  const [viewerKey, setViewerKey] = useState<Persona['key']>(initialPersona);
  const [runs, setRuns] = useState<Run[]>(initialRuns);
  const [cards, setCards] = useState<CardRow[]>(initialCards);
  const [runId, setRunId] = useState<string | null>(initialRunId);
  const [, startTransition] = useTransition();

  const viewer = PERSONAS.find(p => p.key === viewerKey)!;
  const activeRun = runs.find(r => r.id === runId);

  useEffect(() => {
    if (!runId) return;
    const t = setInterval(async () => {
      const [c, r] = await Promise.all([
        fetch(`/api/runs/${runId}/cards`, { cache: 'no-store' }),
        fetch(`/api/runs`, { cache: 'no-store' }),
      ]);
      if (c.ok) {
        const d = await c.json();
        startTransition(() => setCards(d.cards ?? []));
      }
      if (r.ok) {
        const d = await r.json();
        startTransition(() => setRuns(d.runs ?? []));
      }
    }, 2000);
    return () => clearInterval(t);
  }, [runId]);

  return (
    <div className="min-h-screen relative">
      <Chrome
        orgName={orgName}
        orgSlug={orgSlug}
        runs={runs}
        runId={runId}
        setRunId={setRunId}
        viewer={viewer}
      />
      <ViewAsToggle current={viewerKey} onChange={setViewerKey} />

      <main className="relative max-w-[1080px] mx-auto px-6 py-10">
        {/* Run-header — feels like a magazine masthead */}
        {activeRun && <RunMasthead run={activeRun} cardCount={cards.length} />}

        {/* Feed body — two-column with timeline rail */}
        {cards.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="relative">
            {/* Continuous rail line behind the cards (under the dots) */}
            <div
              aria-hidden
              className="absolute left-[44px] top-0 bottom-0 w-px bg-[var(--ink-4)]"
            />
            <div className="relative">
              {cards.map((c, i) => (
                <Card key={c.id} card={c} viewer={viewer} index={i} />
              ))}
              <FeedFoot count={cards.length} />
            </div>
          </div>
        )}

        {/* Spacer so the sticky composer never overlaps the last card. */}
        {runId && <div className="h-44" aria-hidden />}
      </main>

      {/* Sticky chat composer — anyone in the org can drop a follow-up onto
          this run. New cards stream into every viewer's feed within 2 s.
          Pinned to viewport bottom so it stays reachable as the feed grows. */}
      {runId && (
        <div className="fixed inset-x-0 bottom-0 z-30 backdrop-blur-md bg-[var(--ink-0)]/90 hairline-t">
          <div className="max-w-[1080px] mx-auto px-6 py-4">
            <RunComposer runId={runId} viewer={viewer} />
          </div>
        </div>
      )}

      <footer className="hairline-t mt-16">
        <div className="max-w-[1080px] mx-auto px-6 py-6 flex items-center justify-between">
          <div className="font-display italic text-[var(--ink-8)] text-[13px]">
            TeamHQ · the org's decision surface · vol 1, no 1
          </div>
          <div className="flex items-center gap-4 text-[10.5px] smallcaps text-[var(--ink-7)]">
            <span>built on hyperspell</span>
            <span>·</span>
            <span>nia</span>
            <span>·</span>
            <span>tensorlake</span>
            <span>·</span>
            <span>insforge</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function RunMasthead({ run, cardCount }: { run: Run; cardCount: number }) {
  const started = run.started_at ? new Date(run.started_at) : null;
  const finished = run.finished_at ? new Date(run.finished_at) : null;
  const duration =
    started && finished ? `${Math.round((finished.getTime() - started.getTime()) / 1000)}s` : '—';

  return (
    <section className="mb-12">
      <div className="flex items-baseline gap-3 text-[var(--ink-8)] mb-3">
        <span className="smallcaps text-[var(--ink-7)]">scenario</span>
        <span className="font-mono text-[10.5px]">{run.id.slice(0, 8)}</span>
        <span className="text-[var(--ink-6)]">·</span>
        <StatusInk status={run.status} />
      </div>

      <h1 className="font-display text-[40px] leading-[1.05] text-[var(--ink-12)] tracking-tight mb-4 max-w-3xl">
        {run.trigger_source ?? 'Untitled run'}
      </h1>

      {/* Subhead grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 hairline-t hairline-b py-4">
        <Field label="repository" value={run.repo} mono />
        <Field label="trigger" value={run.trigger_type} />
        <Field label="duration" value={duration} mono />
        <Field label="cards emitted" value={String(cardCount)} mono />
      </div>
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="smallcaps text-[var(--ink-7)] mb-1">{label}</div>
      <div
        className={`text-[13.5px] text-[var(--ink-11)] ${mono ? 'font-mono' : 'font-display italic text-[15px]'} truncate`}
      >
        {value}
      </div>
    </div>
  );
}

function StatusInk({ status }: { status: string }) {
  const map: Record<string, string> = {
    starting: 'var(--paper)',
    completed: 'var(--ok)',
    failed: 'var(--err)',
    halted: 'var(--warn)',
  };
  const ink = map[status] ?? 'var(--ink-9)';
  return (
    <span className="flex items-center gap-1.5 smallcaps" style={{ color: ink }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: ink }} />
      {status}
    </span>
  );
}

function FeedFoot({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-[44px_1fr] gap-0">
      <div className="hairline-r" />
      <div className="py-6 pl-6 flex items-center gap-3">
        <Glyph.Dot size={6} className="text-[var(--ink-6)]" />
        <span className="smallcaps text-[var(--ink-7)]">end of run · {count} cards</span>
        <span className="ml-auto font-display italic text-[var(--ink-7)] text-[12px]">∎</span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="hairline px-8 py-14 text-center">
      <div className="font-display italic text-[var(--ink-9)] text-[18px] mb-3">
        nothing on the wire yet
      </div>
      <div className="text-[12.5px] text-[var(--ink-8)] mb-5">
        Trigger a scenario from the terminal to populate the feed.
      </div>
      <code className="inline-block font-mono text-[12px] px-3 py-1.5 bg-[var(--ink-1)] text-[var(--paper)] hairline">
        $ python -m agent fastapi-go
      </code>
    </div>
  );
}
