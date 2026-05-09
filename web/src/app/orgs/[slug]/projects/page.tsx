// Projects index — list view w/ a CTA to create a new one.
import { ifg } from '@/lib/insforge';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  const orgId = session?.orgId ?? null;
  const { slug } = await params;
  const projects = await ifg.listProjects(orgId).catch(() => []);

  return (
    <main className="bg-gradient-to-b from-white to-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Projects</h1>
            <p className="text-base text-gray-500 mt-2">
              {projects.length} {projects.length === 1 ? 'project' : 'projects'} in this org.
            </p>
          </div>
          <a
            href={`/orgs/${slug}/projects/new`}
            className="bg-gray-900 text-white rounded-xl px-5 py-2.5 text-sm hover:bg-gray-800 active:scale-[.98] transition"
          >
            New project
          </a>
        </div>

        <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.length === 0 && (
            <div className="col-span-full bg-white rounded-2xl shadow-sm shadow-gray-200/50 border border-gray-100 p-8 text-center">
              <div className="text-base font-semibold text-gray-900">No projects yet</div>
              <p className="text-sm text-gray-500 mt-1">Create one to scope scenario runs and decisions.</p>
              <a
                href={`/orgs/${slug}/projects/new`}
                className="mt-4 inline-block bg-gray-900 text-white rounded-xl px-5 py-2.5 text-sm hover:bg-gray-800 transition"
              >
                Create project
              </a>
            </div>
          )}
          {projects.map((p) => (
            <a
              key={p.id}
              href={`/orgs/${slug}/projects/${p.id}`}
              className="bg-white rounded-2xl shadow-sm shadow-gray-200/50 border border-gray-100 p-6 hover:border-gray-900 hover:bg-gray-50 transition"
            >
              <div className="text-base font-semibold text-gray-900 truncate">{p.name}</div>
              {p.description && (
                <p className="text-sm text-gray-500 mt-1 line-clamp-3">{p.description}</p>
              )}
              <div className="mt-4 text-xs text-gray-500">
                {p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}
              </div>
            </a>
          ))}
        </section>
      </div>
    </main>
  );
}
