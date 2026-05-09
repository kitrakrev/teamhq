'use client';

import type { Card as CardRow } from '@/lib/insforge';
import { TEAM_COLOR, TEAM_LABEL, leadOfTeam, type Persona } from '@/lib/personas';

type Source = {
  kind?: 'adr' | 'slack' | 'doc';
  title?: string;
  text?: string;
  url?: string | null;
  channel?: string | null;
};

type CardBody = {
  answer?: string;
  documents?: Source[];
  files?: string[];
  question?: string;
  trigger_source?: string;
  affected_paths?: string[];
  team_plans?: Record<string, { answer: string; citations: string[] }>;
  python_version?: string;
  url?: string;
};

const KIND_EMOJI: Record<string, string> = {
  trigger: '🚀',
  team_plan: '📋',
  world_ctx: '🌍',
  sandbox: '🧪',
  test_result: '✅',
  pr_pending: '📝',
  pr_opened: '🔀',
  conflict: '⚠️',
  question: '❓',
  approval_request: '👀',
  override: '⚖️',
  audit: '📜',
};

export function Card({ card, viewer }: { card: CardRow; viewer: Persona }) {
  const body = (card.body || {}) as CardBody;
  const team = card.team_id;
  const accent = team ? TEAM_COLOR[team] : 'bg-slate-400';
  const teamLabel = team ? TEAM_LABEL[team] : null;
  const lead = team ? leadOfTeam(team) : undefined;

  const isMine = team === viewer.team;
  const canActOnThisTeam = isMine || viewer.role === 'architect';

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className={`flex items-center gap-3 px-4 py-2 text-white text-sm ${accent}`}>
        <span className="text-base">{KIND_EMOJI[card.card_type] ?? '•'}</span>
        <span className="font-semibold uppercase tracking-wide text-xs opacity-90">{card.card_type}</span>
        {teamLabel && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/20">{teamLabel}</span>
        )}
        <span className="ml-auto text-xs opacity-75">{new Date(card.created_at).toLocaleTimeString()}</span>
      </div>

      <div className="p-4 space-y-3">
        <div className="text-sm font-semibold text-slate-900">{card.title}</div>

        {body.answer && (
          <div className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded p-3 border border-slate-100">
            {body.answer}
          </div>
        )}

        {body.trigger_source && (
          <div className="text-sm text-slate-700">{body.trigger_source}</div>
        )}

        {body.affected_paths && body.affected_paths.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {body.affected_paths.map((p) => (
              <code key={p} className="text-[11px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-700">{p}</code>
            ))}
          </div>
        )}

        {body.documents && body.documents.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">
              Sources ({body.documents.length})
            </div>
            <div className="space-y-1">
              {body.documents.map((d, i) => (
                <SourceChip key={i} doc={d} />
              ))}
            </div>
          </div>
        )}

        {body.python_version && (
          <code className="text-xs text-slate-500">{body.python_version}</code>
        )}

        {lead && card.card_type === 'team_plan' && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="text-[11px] text-slate-500">
              Required approver: <span className="font-medium text-slate-700">{lead.emoji} {lead.name}</span>
              {' · '}@{lead.github_login}
            </div>
            <div className="flex gap-1.5">
              <button
                disabled={!canActOnThisTeam}
                title={canActOnThisTeam ? '' : `Only ${lead.name} can approve`}
                className={`text-xs px-2.5 py-1 rounded font-medium transition
                  ${canActOnThisTeam
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
              >
                Approve
              </button>
              <button
                disabled={!canActOnThisTeam}
                className={`text-xs px-2.5 py-1 rounded font-medium transition
                  ${canActOnThisTeam
                    ? 'bg-rose-500 text-white hover:bg-rose-600'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
              >
                Reject
              </button>
              <button className="text-xs px-2.5 py-1 rounded font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">
                Comment
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SourceChip({ doc }: { doc: Source }) {
  const icon = doc.kind === 'adr' ? '📝' : doc.kind === 'slack' ? '💬' : '📄';
  const label = doc.kind === 'slack' ? `Slack ${doc.channel ?? ''}` : doc.kind === 'adr' ? 'Notion · ADR' : 'Doc';

  const inner = (
    <>
      <span>{icon}</span>
      <span className="text-[11px] uppercase tracking-wider text-slate-500 shrink-0">{label}</span>
      <span className="text-xs text-slate-700 truncate">{doc.title}</span>
    </>
  );

  if (doc.url) {
    return (
      <a
        href={doc.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-2 py-1.5 rounded border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition"
      >
        {inner}
        <span className="ml-auto text-[10px] text-slate-400">↗</span>
      </a>
    );
  }
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-slate-200 bg-slate-50">
      {inner}
    </div>
  );
}
