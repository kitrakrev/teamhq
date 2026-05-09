'use client';

import { PERSONAS, type Persona } from '@/lib/personas';

type Props = {
  current: Persona['key'];
  onChange: (k: Persona['key']) => void;
};

export function ViewAsToggle({ current, onChange }: Props) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200">
      <span className="text-xs uppercase tracking-wider text-slate-500">View as</span>
      {PERSONAS.filter(p => p.role === 'lead').map(p => {
        const active = p.key === current;
        return (
          <button
            key={p.key}
            onClick={() => onChange(p.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition
              ${active
                ? `${p.color} text-white shadow`
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'}`}
            title={`${p.name} · ${p.role} · ${p.team}`}
          >
            <span>{p.emoji}</span>
            <span>{p.name}</span>
            <span className="text-[10px] opacity-70 hidden sm:inline">@{p.github_login}</span>
          </button>
        );
      })}
    </div>
  );
}
