'use client';

import type { Persona } from '@/lib/personas';
import type { Run } from '@/lib/insforge';
import { ThemeToggle } from './ThemeToggle';

type Props = {
  orgName: string;
  orgSlug?: string;
  runs: Run[];
  runId: string | null;
  setRunId: (id: string | null) => void;
  viewer: Persona;
};

export function Chrome({ orgName, orgSlug = 'acme-eng', runs, runId, setRunId, viewer }: Props) {
  const activeRun = runs.find(r => r.id === runId);
  const issueNo = activeRun ? runs.findIndex(r => r.id === runId) + 1 : 0;

  return (
    <header className="relative z-20 sticky top-0 backdrop-blur-md bg-[var(--ink-0)]/90 hairline-b">
      {/* Brand bar */}
      <div className="px-6 py-4 flex items-baseline gap-6">
        <a href="/" className="flex items-baseline gap-2 group">
          <span className="font-display italic text-2xl text-[var(--paper)] leading-none">
            T<span className="text-[var(--ink-12)] not-italic">/</span>HQ
          </span>
          <span className="smallcaps text-[var(--ink-8)]">teamhq</span>
        </a>

        {/* Breadcrumb */}
        <nav className="flex items-baseline gap-3 text-[12.5px] text-[var(--ink-9)]">
          <span className="text-[var(--ink-7)]">/</span>
          <span className="text-[var(--ink-11)]">{orgName}</span>
          <span className="text-[var(--ink-7)]">/</span>
          <span className="text-[var(--ink-9)]">decision feed</span>
        </nav>

        {/* Quick-nav links — get the user from feed → other org pages */}
        <nav className="flex items-baseline gap-4 ml-2 text-[12px]">
          <a href={`/orgs/${orgSlug}/projects`} className="text-[var(--ink-9)] hover:text-[var(--paper)] transition-colors">projects</a>
          <a href={`/orgs/${orgSlug}/people`} className="text-[var(--ink-9)] hover:text-[var(--paper)] transition-colors">people</a>
          <a href={`/orgs/${orgSlug}/connectors`} className="text-[var(--ink-9)] hover:text-[var(--paper)] transition-colors">connectors</a>
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {/* Prominent New-project CTA — judges should be able to start from any page */}
          <a
            href={`/orgs/${orgSlug}/projects/new`}
            className="hairline px-3 py-1.5 smallcaps text-[var(--paper)] hover:text-[var(--ink-0)] hover:bg-[var(--paper)] transition-colors"
            style={{ borderColor: 'var(--paper-muted)' }}
          >
            + new project
          </a>
          {/* Run selector — looks like an issue number on a print masthead */}
          <div className="flex items-center gap-2">
            <span className="smallcaps text-[var(--ink-7)]">issue</span>
            <span className="font-display text-lg text-[var(--paper)]">
              №{String(issueNo).padStart(3, '0')}
            </span>
            <select
              value={runId ?? ''}
              onChange={e => setRunId(e.target.value || null)}
              className="bg-transparent text-[12px] text-[var(--ink-10)] hover:text-[var(--ink-12)] border-0 outline-none cursor-pointer max-w-[280px] truncate"
            >
              {runs.map(r => (
                <option key={r.id} value={r.id} className="bg-[var(--ink-1)]">
                  {(r.trigger_source ?? r.id.slice(0, 8))} — {r.status}
                </option>
              ))}
            </select>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-1.5 px-2 py-1 hairline rounded-none">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)] tick-pulse" />
            <span className="smallcaps text-[var(--ink-9)]">live</span>
          </div>

          {/* Active viewer */}
          <ViewerChip viewer={viewer} />

          {/* Theme toggle + logout */}
          <ThemeToggle />
          <a
            href="/api/auth/signout"
            className="smallcaps text-[var(--ink-8)] hover:text-[var(--err)] transition-colors px-2 py-1"
            title="Sign out"
          >
            sign out
          </a>
        </div>
      </div>

      {/* Editorial subhead */}
      <div className="px-6 pb-3 flex items-baseline justify-between border-t border-[var(--ink-4)] pt-3">
        <div className="font-display italic text-[var(--ink-10)] text-[15px]">
          where the engineering org converges to ship
        </div>
        <div className="flex items-center gap-5 text-[11.5px] text-[var(--ink-8)]">
          <Stat label="teams" value="04" />
          <Stat label="repos" value="01" />
          <Stat label="brain artifacts" value="19" />
          <Stat label="connectors" value="03/08" />
        </div>
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="smallcaps text-[var(--ink-7)]">{label}</span>
      <span className="font-display text-[var(--paper)] text-[14px]">{value}</span>
    </div>
  );
}

function ViewerChip({ viewer }: { viewer: Persona }) {
  return (
    <div className="flex items-center gap-2 pl-3 hairline-l">
      <div
        className="w-7 h-7 grid place-items-center text-[10px] font-mono font-medium ring-persona-active rounded-none"
        style={{ color: viewer.ink, background: `color-mix(in srgb, ${viewer.ink} 10%, transparent)` }}
      >
        {viewer.initials}
      </div>
      <div className="leading-tight">
        <div className="text-[12px] text-[var(--ink-12)]">{viewer.name}</div>
        <div className="text-[10px] text-[var(--ink-8)] font-mono">@{viewer.github_login}</div>
      </div>
    </div>
  );
}
