'use client';

import { useState } from 'react';
import type { Persona } from '@/lib/personas';

type Props = {
  runId: string;
  viewer: Persona;
};

export function RunComposer({ runId, viewer }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/runs/${runId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error ?? `error ${res.status}`);
        return;
      }
      setText('');
      // The 2-second poll in Feed will pick the new card up.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-3">
      <div
        className="w-7 h-7 grid place-items-center text-[10px] font-mono shrink-0 mt-1"
        style={{
          color: viewer.ink,
          background: `color-mix(in srgb, ${viewer.ink} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${viewer.ink} 35%, transparent)`,
        }}
      >
        {viewer.initials}
      </div>
      <div className="flex-1 min-w-0">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={`Talk to the agent as ${viewer.name} (${viewer.team}) · ⌘+Enter to send`}
          rows={2}
          disabled={busy}
          className="block w-full bg-[var(--ink-1)] hairline px-3 py-2 text-[13px] text-[var(--ink-12)] placeholder:text-[var(--ink-7)] focus:border-[var(--paper-muted)] focus:outline-none transition resize-y"
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            className="hairline px-3 py-1.5 smallcaps text-[var(--paper)] hover:bg-[var(--paper)] hover:text-[var(--ink-0)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--paper-muted)' }}
          >
            {busy ? 'sending…' : 'send · ⌘+enter'}
          </button>
          {err && <span className="text-[11px] text-[var(--err)]">{err}</span>}
          <span className="ml-auto smallcaps text-[var(--ink-7)]">
            visible to all of acme eng
          </span>
        </div>
      </div>
    </div>
  );
}
