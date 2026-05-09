'use client';

import { useState, useTransition } from 'react';
import { CheckIcon } from '@/components/onboard/Icons';

export type RepoOpt = { id: string; full_name: string };
export type TeamOpt = { id: string; name: string; ink?: string };

export function NewProjectForm({
  repos,
  teams,
  action,
}: {
  repos: RepoOpt[];
  teams: TeamOpt[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [repoIds, setRepoIds] = useState<Set<string>>(new Set());
  const [teamIds, setTeamIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleRepo(id: string) {
    setRepoIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleTeam(id: string) {
    setTeamIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set('name', name);
    fd.set('description', description);
    repoIds.forEach((id) => fd.append('repo_id', id));
    teamIds.forEach((id) => fd.append('team_id', id));
    startTransition(async () => {
      try {
        await action(fd);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to create project');
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">Name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="OpenAI SDK upgrade"
          className="rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none w-full"
        />
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What's this project about? Who cares about it?"
          className="rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none w-full resize-none"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">Repos in scope</label>
          <span className="text-xs text-gray-500">{repoIds.size} selected</span>
        </div>
        {repos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-sm text-gray-500 text-center">
            No org repos yet.{' '}
            <a href="/onboard?step=2" className="text-gray-900 underline underline-offset-2">
              Connect repos in onboarding
            </a>
            .
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {repos.map((r) => {
              const on = repoIds.has(r.id);
              return (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => toggleRepo(r.id)}
                  className={`relative text-left rounded-2xl border p-4 transition cursor-pointer
                    ${on ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white hover:border-gray-900 hover:bg-gray-50'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-mono text-sm text-gray-900 truncate">{r.full_name}</div>
                    <span
                      className={`shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full border ${
                        on ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 bg-white text-transparent'
                      }`}
                      aria-hidden
                    >
                      <CheckIcon className="h-3 w-3" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">Teams involved</label>
        <div className="flex flex-wrap gap-2">
          {teams.length === 0 && (
            <div className="text-sm text-gray-500">No teams configured yet.</div>
          )}
          {teams.map((t) => {
            const on = teamIds.has(t.id);
            return (
              <button
                type="button"
                key={t.id}
                onClick={() => toggleTeam(t.id)}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm border transition
                  ${on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-900'}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: t.ink ?? '#9ca3af' }} />
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="flex items-center justify-end gap-3">
        <a
          href=".."
          className="bg-white border border-gray-200 rounded-xl px-6 py-3 hover:border-gray-300 transition text-gray-700"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={isPending || !name}
          className="bg-gray-900 text-white rounded-xl px-6 py-3 hover:bg-gray-800 active:scale-[.98] transition disabled:opacity-40"
        >
          {isPending ? 'Creating…' : 'Create project'}
        </button>
      </div>
    </form>
  );
}
