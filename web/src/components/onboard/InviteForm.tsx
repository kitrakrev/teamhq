'use client';

import { useState, useTransition } from 'react';

export type TeamOption = { id: string; name: string };

export function InviteForm({
  teams,
  action,
}: {
  teams: TeamOption[];
  action: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [teamId, setTeamId] = useState<string>(teams[0]?.id ?? '');
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set('email', email);
    fd.set('role', role);
    fd.set('team_id', teamId);
    startTransition(async () => {
      const res = await action(fd);
      if (res.ok) {
        setEmail('');
        setToast('Invite link generated');
        setTimeout(() => setToast(null), 2500);
      } else {
        setError(res.error ?? 'Invite failed');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <input
          type="email"
          required
          placeholder="teammate@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="sm:col-span-6 rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none w-full"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="sm:col-span-3 rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none w-full bg-white"
        >
          <option value="member">Member</option>
          <option value="lead">Lead</option>
          <option value="architect">Architect</option>
          <option value="pm">PM</option>
          <option value="viewer">Viewer</option>
        </select>
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="sm:col-span-3 rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none w-full bg-white"
        >
          <option value="">No team</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between gap-3">
        {error && <div className="text-sm text-red-600">{error}</div>}
        {toast && <div className="text-sm text-green-700">{toast}</div>}
        <button
          type="submit"
          disabled={isPending || !email}
          className="ml-auto bg-gray-900 text-white rounded-xl px-6 py-3 hover:bg-gray-800 active:scale-[.98] transition disabled:opacity-40"
        >
          {isPending ? 'Sending…' : 'Send invite'}
        </button>
      </div>
    </form>
  );
}
