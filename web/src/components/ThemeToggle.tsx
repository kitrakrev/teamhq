'use client';

import { useEffect, useState } from 'react';

type Mode = 'dark' | 'light';

const KEY = 'teamhq_theme';

function applyTheme(mode: Mode) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = mode;
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('dark');

  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as Mode | null) ?? 'dark';
    setMode(saved);
    applyTheme(saved);
  }, []);

  function toggle() {
    const next: Mode = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    localStorage.setItem(KEY, next);
    applyTheme(next);
  }

  return (
    <button
      onClick={toggle}
      title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
      className="smallcaps text-[var(--ink-8)] hover:text-[var(--paper)] transition-colors px-2 py-1 hairline"
    >
      {mode === 'dark' ? '☾ dark' : '☀ light'}
    </button>
  );
}
