// Project detail — name, description, repos in scope, scenario triggers,
// and the run history scoped to this project.
import { notFound } from 'next/navigation';
import { ifg } from '@/lib/insforge';
import { TriggerForm } from '@/components/projects/TriggerForm';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    starting: 'bg-amber-50 text-amber-700 ring-amber-200',
    running: 'bg-blue-50 text-blue-700 ring-blue-200',
    succeeded: 'bg-green-50 text-green-700 ring-green-200',
    failed: 'bg-red-50 text-red-700 ring-red-200',
  };
  const cls = map[status] ?? 'bg-gray-50 text-gray-600 ring-gray-200';
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${cls}`}>{status}</span>
  );
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const session = await getSession();
  const orgId = session?.orgId ?? null;
  const { slug, id } = await params;
  const project = await ifg.getProject(orgId, id).catch(() => null);
  if (!project) notFound();

  const [projectRepos, orgRepos, runs] = await Promise.all([
    ifg.listProjectRepos(id).catch(() => []),
    ifg.listOrgRepos(orgId).catch(() => []),
    ifg.listRunsForProject(orgId, id, 30).catch(() => []),
  ]);

  const repoById = new Map(orgRepos.map((r) => [r.id, r]));
  const scopedRepos = projectRepos
    .map((pr) => repoById.get(pr.org_repo_id))
    .filter(Boolean) as typeof orgRepos;

  return (
    <main className="bg-gradient-to-b from-white to-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-sm text-gray-500">
          <a href={`/orgs/${slug}/projects`} className="hover:text-gray-900 transition">Projects</a> · {project.name}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 mt-2">{project.name}</h1>
        {project.description && (
          <p className="text-base text-gray-500 mt-2 max-w-2xl">{project.description}</p>
        )}

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-gray-700 tracking-tight">Repos in scope</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {scopedRepos.length === 0 && (
              <span className="text-sm text-gray-500">No repos attached yet.</span>
            )}
            {scopedRepos.map((r) => (
              <span
                key={r!.id}
                className="font-mono text-xs bg-white border border-gray-200 rounded-full px-3 py-1.5 text-gray-700"
              >
                {r!.github_full_name}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold text-gray-700 tracking-tight">Trigger a change</h2>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            Describe what you want shipped. The agent will route per-role questions, draft per-team
            plans grounded in your team brain, and open a real PR after quorum approval.
          </p>
          <div className="mt-4">
            <TriggerForm
              projectId={project.id}
              hasRepos={scopedRepos.length > 0}
              orgSlug={slug}
            />
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold text-gray-700 tracking-tight">Past runs</h2>
          <ul className="mt-3 divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white overflow-hidden">
            {runs.length === 0 && (
              <li className="px-5 py-6 text-sm text-gray-500 text-center">No runs yet — trigger a scenario above.</li>
            )}
            {runs.map((run) => (
              <li key={run.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/60">
                <a href={`/?run=${run.id}`} className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900 truncate">{run.trigger_source ?? run.trigger_type}</div>
                  <div className="text-xs text-gray-500 truncate font-mono">{run.repo}</div>
                </a>
                <div className="text-xs text-gray-500">
                  {run.created_at ? new Date(run.created_at).toLocaleString() : ''}
                </div>
                <StatusPill status={run.status} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
