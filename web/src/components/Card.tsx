'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Card as CardRow } from '@/lib/insforge';
import { TEAM_INK, TEAM_LABEL, leadOfTeam, type Persona } from '@/lib/personas';
import { Glyph, type GlyphKey } from './Glyph';

type Source = {
  kind?: 'adr' | 'slack' | 'doc';
  title?: string;
  text?: string;
  url?: string | null;
  channel?: string | null;
};

type AcceptanceCriterion = {
  id: string;
  statement: string;
  kind: 'test' | 'check' | 'review' | string;
  test_command?: string | null;
  expected?: string | null;
  owner_role?: string;
  status?: 'pending' | 'passed' | 'failed' | 'waived' | string;
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
  // question card fields
  to_user?: { email?: string; name?: string };
  to_role?: string;
  text?: string;
  options?: string[];
  free_text_ok?: boolean;
  rationale?: string;
  answered_by?: string;
  answered_at?: string;
  choice?: string;
  // acceptance_criteria card fields
  feature?: string;
  criteria?: AcceptanceCriterion[];
  // user_message card fields
  author_email?: string;
  author_name?: string;
  author_team?: string;
  author_role?: string;
};

const TYPE_CONFIG: Record<string, { glyph: GlyphKey; label: string }> = {
  trigger:              { glyph: 'Trigger',  label: 'Trigger' },
  team_plan:            { glyph: 'Plan',     label: 'Team Plan' },
  world_ctx:            { glyph: 'Doc',      label: 'World Context' },
  sandbox:              { glyph: 'Sandbox',  label: 'Sandbox' },
  test_result:          { glyph: 'Check',    label: 'Test Result' },
  pr_pending:           { glyph: 'Pencil',   label: 'PR Pending' },
  pr_opened:            { glyph: 'Pr',       label: 'PR Opened' },
  conflict:             { glyph: 'Conflict', label: 'Conflict' },
  question:             { glyph: 'Q',        label: 'Question' },
  approval_request:     { glyph: 'Lock',     label: 'Approval' },
  override:             { glyph: 'Override', label: 'Override' },
  audit:                { glyph: 'Audit',    label: 'Audit' },
  acceptance_criteria:  { glyph: 'Check',    label: 'Acceptance Criteria' },
  user_message:         { glyph: 'Q',        label: 'Message' },
};

type Props = {
  card: CardRow;
  viewer: Persona;
  index?: number;
};

export function Card({ card, viewer, index = 0 }: Props) {
  const body = (card.body || {}) as CardBody;
  const team = card.team_id;
  const teamInk = team ? TEAM_INK[team] : 'var(--paper)';
  const teamLabel = team ? TEAM_LABEL[team] : null;
  const lead = team ? leadOfTeam(team) : undefined;

  const meta = TYPE_CONFIG[card.card_type] ?? { glyph: 'Dot' as GlyphKey, label: card.card_type };
  const G = Glyph[meta.glyph];

  const isMyTeam = team === viewer.team;
  const canActOnThisTeam = isMyTeam || viewer.role === 'architect';

  const ts = new Date(card.created_at);
  const timeStr = ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <article
      className="rise grid grid-cols-[44px_1fr] gap-0 group"
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      {/* Timeline rail — left column with stem + node */}
      <div className="relative hairline-r">
        <div className="absolute top-6 -right-[6px] z-10">
          <div
            className="w-3 h-3 rounded-full stem-glow"
            style={{ background: 'var(--ink-2)', color: teamInk }}
          />
        </div>
      </div>

      {/* Body */}
      <div className="hairline-b py-5 pl-6 pr-2 hover:bg-[var(--ink-2)]/40 transition-colors duration-300">
        {/* Meta line — type, team, time */}
        <header className="flex items-center gap-3 mb-3">
          <span className="flex items-center gap-1.5" style={{ color: teamInk }}>
            <G size={11} />
            <span className="smallcaps">{meta.label}</span>
          </span>
          {teamLabel && (
            <>
              <span className="text-[var(--ink-6)]">·</span>
              <span
                className="smallcaps"
                style={{ color: teamInk }}
              >
                {teamLabel}
              </span>
            </>
          )}
          <span className="text-[var(--ink-6)]">·</span>
          <span className="font-mono text-[10.5px] text-[var(--ink-7)]">
            {timeStr}
          </span>
          {body.python_version && (
            <>
              <span className="text-[var(--ink-6)]">·</span>
              <span className="font-mono text-[10.5px] text-[var(--ink-8)]">{body.python_version}</span>
            </>
          )}
          <span className="ml-auto font-display italic text-[12.5px] text-[var(--ink-7)]">
            ⟦ {String(index + 1).padStart(2, '0')} ⟧
          </span>
        </header>

        {/* Headline — serif */}
        <h2 className="font-display text-[22px] leading-[1.15] text-[var(--ink-12)] mb-3">
          {card.title}
        </h2>

        {/* Trigger source — for trigger cards */}
        {body.trigger_source && card.card_type === 'trigger' && (
          <p className="font-display italic text-[16px] text-[var(--paper)] mb-3 leading-snug">
            “{body.trigger_source}”
          </p>
        )}

        {/* Question card — render text + options + answer form */}
        {card.card_type === 'question' && body.text && (
          <QuestionBlock
            cardId={card.id}
            text={body.text}
            options={body.options ?? []}
            freeTextOk={body.free_text_ok ?? true}
            rationale={body.rationale}
            toUserEmail={body.to_user?.email}
            toUserName={body.to_user?.name}
            status={card.status}
            answer={body.answer}
            choice={body.choice}
            answeredBy={body.answered_by}
            answeredAt={body.answered_at}
            viewer={viewer}
          />
        )}

        {/* User message card — chat-style bubble */}
        {card.card_type === 'user_message' && body.text && (
          <div className="mt-2 hairline px-4 py-3 max-w-2xl"
               style={{ background: 'color-mix(in srgb, var(--paper) 4%, transparent)', borderColor: 'var(--paper-muted)' }}>
            <p className="text-[14px] text-[var(--ink-12)] leading-snug whitespace-pre-wrap">{body.text}</p>
            {body.author_name && (
              <div className="mt-2 smallcaps text-[var(--ink-7)]">
                — {body.author_name}{body.author_team ? ` · ${body.author_team}` : ''}
              </div>
            )}
          </div>
        )}

        {/* Acceptance criteria card — render checklist */}
        {card.card_type === 'acceptance_criteria' && body.criteria && body.criteria.length > 0 && (
          <AcceptanceCriteriaBlock feature={body.feature} criteria={body.criteria} />
        )}

        {/* Affected paths — code chips */}
        {body.affected_paths && body.affected_paths.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {body.affected_paths.map(p => (
              <code
                key={p}
                className="text-[11px] font-mono px-2 py-0.5 text-[var(--ink-10)]"
                style={{
                  background: 'color-mix(in srgb, var(--paper) 6%, transparent)',
                  borderLeft: '2px solid var(--paper-muted)',
                }}
              >
                {p}
              </code>
            ))}
          </div>
        )}

        {/* Two-column layout when there's an answer + sources */}
        {body.answer ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mt-2">
            {/* Body copy */}
            <div className="space-y-3">
              <div className="text-[14.5px] leading-[1.6] text-[var(--ink-11)] font-mono">
                {decorateAnswer(body.answer)}
              </div>
            </div>

            {/* Citation sidebar — like footnotes */}
            {body.documents && body.documents.length > 0 && (
              <aside className="space-y-3 lg:border-l lg:border-[var(--ink-4)] lg:pl-5">
                <div className="smallcaps text-[var(--ink-7)]">
                  Citations · {body.documents.length}
                </div>
                <ol className="space-y-2.5">
                  {body.documents.map((d, i) => (
                    <SourceFootnote key={i} doc={d} index={i + 1} />
                  ))}
                </ol>
              </aside>
            )}
          </div>
        ) : (
          // No answer body, but sources may still exist — render inline
          body.documents && body.documents.length > 0 && (
            <div className="mt-2">
              <div className="smallcaps text-[var(--ink-7)] mb-2">
                Citations · {body.documents.length}
              </div>
              <ol className="space-y-2.5">
                {body.documents.map((d, i) => (
                  <SourceFootnote key={i} doc={d} index={i + 1} />
                ))}
              </ol>
            </div>
          )
        )}

        {/* Approver row — only for team_plan cards */}
        {lead && card.card_type === 'team_plan' && (
          <ApproverRow lead={lead} canAct={canActOnThisTeam} viewer={viewer} cardId={card.id} status={card.status} />
        )}

        {/* PR opened — show URL prominently */}
        {body.url && card.card_type === 'pr_opened' && (
          <a
            href={body.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 group/pr inline-flex items-center gap-2 hairline px-3 py-2 hover:border-[var(--paper)] transition-colors"
          >
            <Glyph.Pr size={11} className="text-[var(--paper)]" />
            <span className="smallcaps text-[var(--ink-9)] group-hover/pr:text-[var(--paper)]">
              view pull request
            </span>
            <span className="font-mono text-[11px] text-[var(--ink-10)] group-hover/pr:text-[var(--ink-12)] truncate max-w-[400px]">
              {body.url.replace('https://github.com/', '')}
            </span>
            <Glyph.Arrow size={10} className="text-[var(--ink-7)] group-hover/pr:text-[var(--paper)]" />
          </a>
        )}
      </div>
    </article>
  );
}

/**
 * Decorate inline mentions in answer text with subtle paper-color emphasis on
 * known artifact references like PR #347, ADR-12, INC-203.
 */
function decorateAnswer(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /\b(PR\s*#\d+|ADR-\d+|INC-\d+|@\w[\w-]*|`[^`]+`)\b/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('`') && tok.endsWith('`')) {
      parts.push(
        <code key={m.index} className="px-1 text-[var(--ink-12)] bg-[var(--ink-3)] text-[13px]">
          {tok.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(
        <span key={m.index} className="text-[var(--paper)] font-medium">
          {tok}
        </span>
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function SourceFootnote({ doc, index }: { doc: Source; index: number }) {
  const G = doc.kind === 'adr' ? Glyph.Notion : doc.kind === 'slack' ? Glyph.Slack : Glyph.Doc;
  const label = doc.kind === 'adr'
    ? 'Notion · ADR'
    : doc.kind === 'slack'
      ? `Slack ${doc.channel ?? ''}`
      : 'Doc';

  const Inner = (
    <>
      <span className="footnote-num shrink-0">{index}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[var(--ink-8)]">
          <G size={10} className="text-[var(--paper-muted)]" />
          <span className="smallcaps">{label}</span>
        </div>
        <div className="text-[12.5px] text-[var(--ink-11)] mt-0.5 leading-snug truncate">
          {doc.title}
        </div>
      </div>
      {doc.url && <Glyph.Arrow size={10} className="text-[var(--ink-7)] shrink-0" />}
    </>
  );

  if (doc.url) {
    return (
      <li className="source-chip flex items-start gap-2 cursor-pointer">
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-2 w-full text-[var(--ink-10)] hover:text-[var(--ink-12)]"
        >
          {Inner}
        </a>
      </li>
    );
  }
  return <li className="source-chip flex items-start gap-2">{Inner}</li>;
}

function ApproverRow({
  lead,
  canAct,
  viewer,
  cardId,
  status,
}: {
  lead: Persona;
  canAct: boolean;
  viewer: Persona;
  cardId: string;
  status: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'approve' | 'reject' | 'comment'>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(status);

  async function call(kind: 'approve' | 'reject' | 'comment') {
    setBusy(kind);
    setToast(null);
    try {
      let body: Record<string, unknown> | undefined;
      if (kind === 'reject') {
        const reason = typeof window !== 'undefined' ? window.prompt('Reject reason:') : '';
        if (!reason) { setBusy(null); return; }
        body = { reason };
      } else if (kind === 'comment') {
        const text = typeof window !== 'undefined' ? window.prompt('Comment:') : '';
        if (!text) { setBusy(null); return; }
        body = { text };
      }
      const res = await fetch(`/api/cards/${cardId}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ kind: 'err', msg: (data as { error?: string }).error ?? `error ${res.status}` });
      } else {
        if (kind === 'approve') setLocalStatus('approved');
        if (kind === 'reject') setLocalStatus('rejected');
        setToast({ kind: 'ok', msg: `${kind} ok` });
        router.refresh();
      }
    } catch (e) {
      setToast({ kind: 'err', msg: (e as Error).message });
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  const decided = localStatus === 'approved' || localStatus === 'rejected' || localStatus === 'overridden';

  return (
    <div className="mt-5 pt-4 border-t border-dashed border-[var(--ink-5)]">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 grid place-items-center text-[10px] font-mono"
            style={{
              color: lead.ink,
              background: `color-mix(in srgb, ${lead.ink} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${lead.ink} 35%, transparent)`,
            }}
          >
            {lead.initials}
          </div>
          <div className="leading-tight">
            <div className="text-[12.5px] text-[var(--ink-11)]">
              {decided ? (
                <span style={{ color: lead.ink }}>{localStatus}</span>
              ) : (
                <>awaiting <span style={{ color: lead.ink }}>{lead.name}</span></>
              )}
            </div>
            <div className="text-[10.5px] font-mono text-[var(--ink-7)]">@{lead.github_login}</div>
          </div>
        </div>

        <span className="text-[var(--ink-6)]">·</span>

        <span className="smallcaps text-[var(--ink-8)]">
          {canAct ? 'you can decide' : `read-only as ${viewer.name.split(' ')[0]}`}
        </span>

        {toast && (
          <span
            className="smallcaps font-mono text-[10.5px]"
            style={{ color: toast.kind === 'ok' ? 'var(--ok)' : 'var(--err)' }}
          >
            · {toast.msg}
          </span>
        )}

        <div className="ml-auto flex items-stretch hairline">
          <ActionButton enabled={canAct && !decided} busy={busy === 'approve'} kind="approve" onClick={() => call('approve')} />
          <ActionButton enabled={canAct && !decided} busy={busy === 'reject'} kind="reject" onClick={() => call('reject')} />
          <ActionButton enabled busy={busy === 'comment'} kind="comment" onClick={() => call('comment')} />
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  enabled,
  busy,
  kind,
  onClick,
}: {
  enabled: boolean;
  busy?: boolean;
  kind: 'approve' | 'reject' | 'comment';
  onClick?: () => void;
}) {
  const config = {
    approve: { label: 'Approve', glyph: Glyph.Check, color: 'var(--ok)' },
    reject:  { label: 'Reject',  glyph: Glyph.X,     color: 'var(--err)' },
    comment: { label: 'Comment', glyph: Glyph.Pencil, color: 'var(--ink-9)' },
  }[kind];
  const G = config.glyph;

  if (!enabled) {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 px-3 py-1.5 disabled-action smallcaps border-r border-[var(--ink-4)] last:border-r-0"
      >
        <G size={10} />
        {config.label}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex items-center gap-1.5 px-3 py-1.5 smallcaps text-[var(--ink-10)] hover:text-[var(--ink-12)] hover:bg-[var(--ink-3)] transition-colors border-r border-[var(--ink-4)] last:border-r-0 disabled:opacity-50"
      style={{ ['--accent' as string]: config.color }}
    >
      <G size={10} className={kind === 'comment' ? '' : ''} style={{ color: config.color } as React.CSSProperties} />
      {busy ? '…' : config.label}
    </button>
  );
}

function AcceptanceCriteriaBlock({
  feature,
  criteria,
}: {
  feature?: string;
  criteria: AcceptanceCriterion[];
}) {
  const TEAM_FROM_ROLE = (role?: string) => {
    if (!role) return null;
    const m = role.match(/^team_lead:(\w+)$/);
    return m ? m[1] : null;
  };
  const statusInk = (s?: string) => {
    if (s === 'passed') return 'var(--ok)';
    if (s === 'failed') return 'var(--err)';
    if (s === 'waived') return 'var(--ink-7)';
    return 'var(--paper-muted)';
  };

  return (
    <div className="mt-2 space-y-3">
      {feature && (
        <p className="font-display italic text-[15px] text-[var(--paper)] leading-snug">
          “{feature}”
        </p>
      )}
      <div className="smallcaps text-[var(--ink-7)]">
        Definition of done · {criteria.length} item{criteria.length === 1 ? '' : 's'}
      </div>
      <ol className="space-y-2.5 pl-0">
        {criteria.map((c, i) => {
          const team = TEAM_FROM_ROLE(c.owner_role);
          const teamInk = team ? TEAM_INK[team] : 'var(--paper)';
          const teamLabel = team ? TEAM_LABEL[team] : null;
          return (
            <li key={c.id ?? i} className="hairline px-3 py-2.5 flex items-start gap-3">
              <span className="footnote-num shrink-0 mt-0.5">{i + 1}</span>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="text-[13.5px] text-[var(--ink-12)] leading-snug">
                  {c.statement}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
                  <span
                    className="smallcaps"
                    style={{ color: statusInk(c.status) }}
                  >
                    {c.status ?? 'pending'}
                  </span>
                  <span className="text-[var(--ink-6)]">·</span>
                  <span className="smallcaps text-[var(--ink-8)]">{c.kind}</span>
                  {teamLabel && (
                    <>
                      <span className="text-[var(--ink-6)]">·</span>
                      <span className="smallcaps" style={{ color: teamInk }}>
                        owner {teamLabel}
                      </span>
                    </>
                  )}
                </div>
                {c.test_command && (
                  <code className="block font-mono text-[11.5px] text-[var(--ink-10)] bg-[var(--ink-3)] px-2 py-1 mt-1 leading-snug whitespace-pre-wrap">
                    {c.test_command}
                  </code>
                )}
                {c.expected && (
                  <div className="text-[11.5px] text-[var(--ink-9)]">
                    <span className="smallcaps text-[var(--ink-7)] mr-1">expect</span>
                    <span className="font-mono">{c.expected}</span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function QuestionBlock({
  cardId,
  text,
  options,
  freeTextOk,
  rationale,
  toUserEmail,
  toUserName,
  status,
  answer,
  choice,
  answeredBy,
  answeredAt,
  viewer,
}: {
  cardId: string;
  text: string;
  options: string[];
  freeTextOk: boolean;
  rationale?: string;
  toUserEmail?: string;
  toUserName?: string;
  status: string | null;
  answer?: string;
  choice?: string;
  answeredBy?: string;
  answeredAt?: string;
  viewer: Persona;
}) {
  const router = useRouter();
  const isAnswered = status === 'answered' || !!answeredBy;
  const canAnswer =
    !isAnswered &&
    (viewer.email === toUserEmail || viewer.role === 'architect');
  const [busy, setBusy] = useState(false);
  const [free, setFree] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function submit(payload: { answer?: string; choice?: string }) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/cards/${cardId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data?.message ?? data?.error ?? 'submit failed');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-3">
      <p className="font-display italic text-[16px] text-[var(--paper)] leading-snug">
        “{text}”
      </p>

      {rationale && (
        <p className="text-[12.5px] text-[var(--ink-9)] leading-snug">
          <span className="smallcaps text-[var(--ink-7)] mr-1">why</span>
          {rationale}
        </p>
      )}

      {toUserName && (
        <div className="text-[11px] smallcaps text-[var(--ink-7)]">
          asked of <span style={{ color: 'var(--paper)' }}>{toUserName}</span>
          {toUserEmail && <span className="text-[var(--ink-8)]"> · {toUserEmail}</span>}
        </div>
      )}

      {isAnswered ? (
        <div className="hairline px-3 py-2 text-[13px] text-[var(--ink-11)]">
          <div className="smallcaps text-[var(--ok)] mb-1">answered</div>
          {choice && <div>Choice: <span className="text-[var(--ink-12)]">{choice}</span></div>}
          {answer && <div className="font-mono text-[12px] mt-1 text-[var(--ink-10)]">{answer}</div>}
          {answeredBy && (
            <div className="text-[10.5px] text-[var(--ink-7)] mt-1">
              by {answeredBy} {answeredAt ? '· ' + new Date(answeredAt).toLocaleString() : ''}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {options.map((opt) => (
                <button
                  key={opt}
                  disabled={!canAnswer || busy}
                  onClick={() => submit({ choice: opt, answer: opt })}
                  className={
                    canAnswer
                      ? 'hairline px-3 py-1.5 smallcaps text-[var(--ink-11)] hover:text-[var(--ink-12)] hover:border-[var(--paper)] transition-colors'
                      : 'disabled-action smallcaps px-3 py-1.5'
                  }
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {freeTextOk && canAnswer && (
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                value={free}
                onChange={(e) => setFree(e.target.value)}
                placeholder="…or type a custom answer"
                className="flex-1 bg-transparent hairline px-3 py-1.5 text-[13px] text-[var(--ink-11)] placeholder:text-[var(--ink-7)] focus:border-[var(--paper)] focus:outline-none"
                disabled={busy}
              />
              <button
                disabled={!free.trim() || busy}
                onClick={() => submit({ answer: free.trim() })}
                className="hairline px-3 py-1.5 smallcaps text-[var(--ink-11)] hover:text-[var(--ink-12)] hover:border-[var(--paper)] transition-colors disabled:text-[var(--ink-7)] disabled:cursor-not-allowed"
              >
                Submit
              </button>
            </div>
          )}

          {!canAnswer && (
            <div className="text-[11px] smallcaps text-[var(--ink-7)]">
              read-only — only {toUserName || toUserEmail || 'the addressed user'} can answer
            </div>
          )}

          {err && (
            <div className="text-[12px] text-[var(--err)]">{err}</div>
          )}
        </div>
      )}
    </div>
  );
}
