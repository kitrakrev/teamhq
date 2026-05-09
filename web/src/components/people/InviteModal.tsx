'use client';

import { useState, useTransition } from 'react';

export type TeamOption = { id: string; name: string };

export function InviteModal({
  teams,
  action,
}: {
  teams: TeamOption[];
  action: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
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
        setOpen(false);
      } else {
        setError(res.error ?? 'Invite failed');
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-gray-900 text-white rounded-xl px-5 py-2.5 text-sm hover:bg-gray-800 active:scale-[.98] transition"
      >
        Invite
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-gray-900">Invite a teammate</h2>
            <p className="text-sm text-gray-500 mt-1">They&apos;ll get an invite link to join this org.</p>
            <form onSubmit={submit} className="mt-5 space-y-3">
              <input
                type="email"
                required
                placeholder="email@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none w-full"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none w-full bg-white"
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
                  className="rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none w-full bg-white"
                >
                  <option value="">No team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              {error && <div className="text-sm text-red-600">{error}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm hover:border-gray-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !email}
                  className="bg-gray-900 text-white rounded-xl px-5 py-2 text-sm hover:bg-gray-800 active:scale-[.98] transition disabled:opacity-40"
                >
                  {isPending ? 'Sending…' : 'Send invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
