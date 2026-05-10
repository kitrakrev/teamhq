'use client';

import { PERSONAS, type Persona } from '@/lib/personas';

type Props = {
  current: Persona['key'];
  onChange: (k: Persona['key']) => void;
};

export function ViewAsToggle({ current, onChange }: Props) {
  return (
    <div className="hairline-b bg-[var(--ink-1)]">
      <div className="px-6 py-3 flex items-center gap-5">
        <div className="flex items-center gap-3">
          <span className="smallcaps text-[var(--ink-7)]">acting as</span>
          <span className="font-display italic text-[var(--ink-9)] text-[14px]">
            ⟶ identity controls who can decide what
          </span>
        </div>

        <div className="ml-auto flex items-stretch gap-0 hairline">
          {PERSONAS.filter(p => p.role === 'lead' || p.role === 'architect').map(p => {
            const active = p.key === current;
            return (
              <button
                key={p.key}
                onClick={() => onChange(p.key)}
                className={[
                  'group relative flex items-center gap-2 px-3 py-2 transition-all duration-200',
                  'first:border-l-0 border-l border-[var(--ink-4)]',
                  active ? '' : 'opacity-60 hover:opacity-100',
                ].join(' ')}
                style={
                  active
                    ? { background: `color-mix(in srgb, ${p.ink} 12%, var(--ink-2))` }
                    : { background: 'transparent' }
                }
                title={`${p.name} · ${p.role} · ${p.team}`}
              >
                <span
                  className="w-6 h-6 grid place-items-center text-[10px] font-mono"
                  style={{
                    color: p.ink,
                    background: `color-mix(in srgb, ${p.ink} 14%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${p.ink} 40%, transparent)`,
                  }}
                >
                  {p.initials}
                </span>
                <span className="text-left">
                  <span className="block text-[12px] text-[var(--ink-12)] leading-tight">{p.name}</span>
                  <span
                    className="block text-[10px] leading-tight"
                    style={{ color: p.ink }}
                  >
                    {p.team}
                  </span>
                </span>
                {/* Active marker — a serif tick on the bottom edge */}
                {active && (
                  <span
                    className="absolute -bottom-px left-3 right-3 h-px"
                    style={{ background: p.ink }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
