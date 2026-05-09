// People roster — joins org_members + users + teams. Shows pending invites.
import { ifg } from '@/lib/insforge';
import { TEAM_INK } from '@/lib/personas';
import { InviteModal } from '@/components/people/InviteModal';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

async function inviteAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  'use server';
  const session = await getSession();
  const orgId = session?.orgId ?? null;
  const email = String(formData.get('email') ?? '').trim();
  const role = String(formData.get('role') ?? 'member');
  const team_id = String(formData.get('team_id') ?? '') || null;
  if (!email) return { ok: false, error: 'Email required' };
  try {
    if (!orgId) throw new Error('no org context');
    await ifg.createInvite(orgId, { email, role, team_id });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'invite failed' };
  }
}

function initialsOf(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default async function PeoplePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  const orgId = session?.orgId ?? null;
  await params;
  const [members, users, teams, invites] = await Promise.all([
    ifg.listOrgMembers(orgId).catch(() => []),
    ifg.listUsers(orgId).catch(() => []),
    ifg.listTeams(orgId).catch(() => []),
    ifg.listInvites(orgId).catch(() => []),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const teamOptions = teams.map((t) => ({ id: t.id, name: t.name }));

  return (
    <main className="bg-gradient-to-b from-white to-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">People</h1>
            <p className="text-base text-gray-500 mt-2">
              {members.length} {members.length === 1 ? 'member' : 'members'} in this org.
            </p>
          </div>
          <InviteModal teams={teamOptions} action={inviteAction} />
        </div>

        <section className="mt-8 bg-white rounded-2xl shadow-sm shadow-gray-200/50 border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 border-b border-gray-100">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3 font-medium">Person</th>
                <th className="px-5 py-3 font-medium">Team</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">GitHub</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-gray-500">No members yet — invite teammates above.</td>
                </tr>
              )}
              {members.map((m) => {
                const u = userById.get(m.user_id);
                const team = m.team_id ? teamById.get(m.team_id) : null;
                const teamKey = u?.team ?? '';
                const tint = TEAM_INK[teamKey] ?? '#9ca3af';
                const name = u?.name ?? m.user_id;
                return (
                  <tr key={m.id} className="hover:bg-gray-50/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="inline-flex items-center justify-center h-8 w-8 rounded-full text-[11px] font-semibold text-white"
                          style={{ background: tint }}
                        >
                          {initialsOf(name) || '?'}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm text-gray-900 truncate">{name}</div>
                          <div className="text-xs text-gray-500 truncate">{u?.email ?? ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <span className="h-2 w-2 rounded-full" style={{ background: tint }} />
                        {team?.name ?? u?.team ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="bg-gray-100 text-gray-700 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize">
                        {m.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-600">
                      {u?.github_login ? `@${u.github_login}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {invites.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold text-gray-700 tracking-tight">Pending invites</h2>
            <ul className="mt-3 divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white overflow-hidden">
              {invites
                .filter((inv) => (inv.status ?? 'pending') === 'pending')
                .map((inv) => (
                  <li key={String(inv.id)} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 truncate">{String(inv.email)}</div>
                      <div className="text-xs text-gray-500">
                        {String(inv.role ?? 'member')}
                        {inv.team_id ? ` · ${teamById.get(String(inv.team_id))?.name ?? 'team'}` : ''}
                      </div>
                    </div>
                    <span className="bg-amber-50 text-amber-700 ring-1 ring-amber-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                      Pending
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
