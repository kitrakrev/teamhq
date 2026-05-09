// New project — name, description, multi-select repos + teams. Server action
// inserts projects + project_repos rows then redirects to the detail page.
import { redirect } from 'next/navigation';
import { ifg } from '@/lib/insforge';
import { getSession } from '@/lib/session';
import { TEAM_INK } from '@/lib/personas';
import { NewProjectForm } from '@/components/projects/NewProjectForm';

export const dynamic = 'force-dynamic';

export default async function NewProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [repos, teams] = await Promise.all([
    ifg.listOrgRepos().catch(() => []),
    ifg.listTeams().catch(() => []),
  ]);

  async function createAction(formData: FormData) {
    'use server';
    const name = String(formData.get('name') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim() || undefined;
    const repoIds = formData.getAll('repo_id').map((v) => String(v));
    if (!name) throw new Error('Project name required');
    const session = await getSession();
    const project = await ifg.createProject({
      name,
      description,
      repoIds,
      createdByUserId: session?.userId && !session.userId.startsWith('demo-') ? session.userId : null,
    });
    redirect(`/orgs/${slug}/projects/${project.id}`);
  }

  const teamOpts = teams.map((t) => {
    // Best-effort tint by team name match.
    const key = (t.name || '').toLowerCase();
    const ink = key.includes('back') ? TEAM_INK.backend
      : key.includes('data') || key.includes('ds') ? TEAM_INK.ds
      : key.includes('front') || key.includes('ui') ? TEAM_INK.ui
      : key.includes('devops') || key.includes('infra') ? TEAM_INK.devops
      : '#9ca3af';
    return { id: t.id, name: t.name, ink };
  });

  return (
    <main className="bg-gradient-to-b from-white to-gray-50 min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="text-sm text-gray-500">
          <a href={`/orgs/${slug}/projects`} className="hover:text-gray-900 transition">Projects</a> · New
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 mt-2">New project</h1>
        <p className="text-base text-gray-500 mt-2">
          Group repos + teams under one banner. Trigger scenarios scoped to it.
        </p>

        <section className="mt-8 bg-white rounded-2xl shadow-sm shadow-gray-200/50 border border-gray-100 p-8">
          <NewProjectForm
            repos={repos.map((r) => ({ id: r.id, full_name: r.github_full_name }))}
            teams={teamOpts}
            action={createAction}
          />
        </section>
      </div>
    </main>
  );
}
