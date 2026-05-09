// 3-step onboarding wizard: GitHub → Repos → Invites.
// Server component. Reads session + InsForge state, renders the active step
// based on `?step=` and live data.
import { redirect } from 'next/navigation';
import { ifg } from '@/lib/insforge';
import { getSession } from '@/lib/session';
import { GitHubIcon, CheckIcon } from '@/components/onboard/Icons';
import { RepoPicker, type PickableRepo } from '@/components/onboard/RepoPicker';
import { InviteForm } from '@/components/onboard/InviteForm';
import { TEAM_INK } from '@/lib/personas';

export const dynamic = 'force-dynamic';

type SP = Promise<{ step?: string }>;

const DEMO_REPOS: PickableRepo[] = [
  { full_name: 'kitrakrev/teamhq-hero', default_branch: 'main', description: 'TeamHQ hero repo — primary focus for scenario runs.', isFocus: true },
  { full_name: 'kitrakrev/teamhq-demo-fastapi', default_branch: 'main', description: 'Sample FastAPI service used in the FastAPI → Go scenario.' },
  { full_name: 'kitrakrev/teamhq-demo-frontend', default_branch: 'main', description: 'Sample React app used in the React → Next.js scenario.' },
];

async function fetchGithubRepos(token: string): Promise<PickableRepo[] | null> {
  try {
    const r = await fetch('https://api.github.com/user/repos?per_page=50&sort=updated', {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const rows = (await r.json()) as Array<{ full_name: string; default_branch: string; description: string | null }>;
    return rows.map((row) => ({
      full_name: row.full_name,
      default_branch: row.default_branch ?? 'main',
      description: row.description,
      isFocus: row.full_name === 'kitrakrev/teamhq-hero',
    }));
  } catch {
    return null;
  }
}

async function saveReposAction(formData: FormData) {
  'use server';
  const session = await getSession();
  const orgId = session?.orgId ?? null;
  const repos = formData.getAll('repo').map((v) => String(v));
  for (const r of repos) {
    const [full, branch] = r.split('::');
    if (!full) continue;
    if (!orgId) throw new Error('no org context');
    await ifg.upsertOrgRepo(orgId, { github_full_name: full, default_branch: branch || 'main' });
  }
  redirect('/onboard?step=3');
}

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

function StepDot({ done, active, n, label }: { done: boolean; active: boolean; n: number; label: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className={`inline-flex items-center justify-center h-7 w-7 rounded-full text-xs font-semibold transition
          ${done ? 'bg-gray-900 text-white' : active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}
      >
        {done ? <CheckIcon className="h-3.5 w-3.5" /> : n}
      </span>
      <span className={`text-sm truncate ${active || done ? 'text-gray-900' : 'text-gray-500'}`}>{label}</span>
    </div>
  );
}

function ProgressBar({ step }: { step: number }) {
  const segs = [1, 2, 3];
  return (
    <div className="grid grid-cols-3 gap-2">
      {segs.map((s) => (
        <div
          key={s}
          className={`h-1.5 rounded-full transition ${s <= step ? 'bg-gray-900' : 'bg-gray-200'}`}
        />
      ))}
    </div>
  );
}

export default async function OnboardPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const stepParam = Number(sp.step ?? '1');
  const session = await getSession();

  const orgId = session?.orgId ?? null;
  // Look up GH token + existing org repos to compute "done" state.
  const [tokens, existingRepos, members, teams, users] = await Promise.all([
    session ? ifg.listOAuthTokens(session.userId).catch(() => []) : Promise.resolve([]),
    ifg.listOrgRepos(orgId).catch(() => []),
    ifg.listOrgMembers(orgId).catch(() => []),
    ifg.listTeams(orgId).catch(() => []),
    ifg.listUsers(orgId).catch(() => []),
  ]);

  const ghToken = tokens.find((t) => t.provider === 'github');
  const step1Done = Boolean(ghToken);
  const step2Done = existingRepos.length > 0;

  // Decide which step to render.
  const step = Math.max(1, Math.min(3, stepParam));

  // Build repo list for step 2.
  let repos: PickableRepo[] = DEMO_REPOS;
  if (ghToken?.access_token) {
    const fetched = await fetchGithubRepos(ghToken.access_token);
    if (fetched && fetched.length) repos = fetched;
  }

  const userById = new Map(users.map((u) => [u.id, u]));

  return (
    <main className="bg-gradient-to-b from-white to-gray-50 min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div className="text-sm font-mono tracking-tight text-gray-900">TeamHQ</div>
          <a href="/" className="text-sm text-gray-500 hover:text-gray-900 transition">Skip for now</a>
        </div>

        <ProgressBar step={step} />

        <div className="mt-6 flex items-center gap-6">
          <StepDot n={1} done={step1Done} active={step === 1} label="Connect GitHub" />
          <StepDot n={2} done={step2Done} active={step === 2} label="Pick repos" />
          <StepDot n={3} done={false} active={step === 3} label="Invite teammates" />
        </div>

        {step === 1 && (
          <section className="mt-8 bg-white rounded-2xl shadow-sm shadow-gray-200/50 border border-gray-100 p-8">
            <div className="flex items-start gap-5">
              <div className="h-14 w-14 rounded-2xl bg-gray-900 text-white flex items-center justify-center shrink-0">
                <GitHubIcon className="h-7 w-7" />
              </div>
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Welcome to TeamHQ</h1>
                <p className="text-base text-gray-500 mt-2">
                  Connect GitHub so we can read your org&apos;s repos, runs, and PRs. We&apos;ll request
                  <span className="font-mono mx-1 text-gray-700">read:user</span>
                  and
                  <span className="font-mono mx-1 text-gray-700">repo</span>
                  scopes.
                </p>
              </div>
            </div>

            <div className="mt-8 flex items-center gap-3">
              {step1Done ? (
                <>
                  <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 ring-1 ring-green-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                    <CheckIcon className="h-3 w-3" /> Connected as {ghToken?.github_login}
                  </span>
                  <a
                    href="/onboard?step=2"
                    className="bg-gray-900 text-white rounded-xl px-6 py-3 hover:bg-gray-800 active:scale-[.98] transition"
                  >
                    Continue
                  </a>
                </>
              ) : (
                <>
                  <a
                    href="/api/oauth/github/start?next=/onboard?step=2"
                    className="bg-gray-900 text-white rounded-xl px-6 py-3 hover:bg-gray-800 active:scale-[.98] transition inline-flex items-center gap-2"
                  >
                    <GitHubIcon className="h-4 w-4" /> Connect GitHub
                  </a>
                  <a
                    href="/onboard?step=2"
                    className="bg-white border border-gray-200 rounded-xl px-6 py-3 hover:border-gray-300 transition text-gray-700"
                  >
                    Continue in demo mode
                  </a>
                </>
              )}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="mt-8 bg-white rounded-2xl shadow-sm shadow-gray-200/50 border border-gray-100 p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Pick the repos this org will manage</h1>
            <p className="text-base text-gray-500 mt-2">
              {ghToken
                ? `Showing repos from @${ghToken.github_login}.`
                : 'Demo mode — kitrakrev/teamhq-hero is the live focus repo.'}
            </p>
            <div className="mt-6">
              <RepoPicker repos={repos} action={saveReposAction} />
            </div>
            {existingRepos.length > 0 && (
              <div className="mt-6 text-xs text-gray-500">
                Already in scope: {existingRepos.map((r) => r.github_full_name).join(', ')}
              </div>
            )}
          </section>
        )}

        {step === 3 && (
          <section className="mt-8 bg-white rounded-2xl shadow-sm shadow-gray-200/50 border border-gray-100 p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Invite teammates</h1>
            <p className="text-base text-gray-500 mt-2">
              Bring in the leads, architects, and PMs who&apos;ll see the decision feed.
            </p>

            <div className="mt-6">
              <InviteForm teams={teams.map((t) => ({ id: t.id, name: t.name }))} action={inviteAction} />
            </div>

            <div className="mt-10">
              <h2 className="text-sm font-semibold text-gray-700 tracking-tight">Current roster</h2>
              <ul className="mt-3 divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white overflow-hidden">
                {members.length === 0 && (
                  <li className="px-4 py-3 text-sm text-gray-500">No members yet.</li>
                )}
                {members.map((m) => {
                  const u = userById.get(m.user_id);
                  const initials = (u?.name ?? u?.email ?? '?')
                    .split(/\s+/)
                    .map((w) => w[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();
                  const tint = u?.team ? TEAM_INK[u.team] : '#9ca3af';
                  return (
                    <li key={m.id} className="px-4 py-3 flex items-center gap-3">
                      <span
                        className="inline-flex items-center justify-center h-8 w-8 rounded-full text-[11px] font-semibold text-white"
                        style={{ background: tint }}
                      >
                        {initials || '?'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-gray-900 truncate">{u?.name ?? m.user_id}</div>
                        <div className="text-xs text-gray-500 truncate">{u?.email ?? ''}</div>
                      </div>
                      <span className="text-xs text-gray-500 capitalize">{m.role}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-8 flex justify-end">
              <a href="/" className="bg-gray-900 text-white rounded-xl px-6 py-3 hover:bg-gray-800 active:scale-[.98] transition">
                Finish setup
              </a>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
