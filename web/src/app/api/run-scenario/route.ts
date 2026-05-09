// POST /api/run-scenario — inserts a runs row scoped to a project + scenario.
// The agent loop runs separately; this just primes the timeline so the UI can
// redirect to the run detail page immediately.
import { NextResponse } from 'next/server';
import { ifg } from '@/lib/insforge';

const SCENARIO_LABELS: Record<string, string> = {
  'fastapi-go': 'FastAPI → Go',
  'openai-bump': 'openai SDK upgrade',
  'react-nextjs': 'React → Next.js',
};

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { projectId?: string; scenario?: string };
  try {
    body = (await req.json()) as { projectId?: string; scenario?: string };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const projectId = body.projectId;
  const scenarioKey = body.scenario ?? '';
  const label = SCENARIO_LABELS[scenarioKey];
  if (!projectId || !label) {
    return NextResponse.json({ error: 'projectId + scenario required' }, { status: 400 });
  }

  const project = await ifg.getProject(projectId).catch(() => null);
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }

  // Pick the first attached repo (if any) to seed run.repo. Falls back to
  // a placeholder so the row still inserts.
  const projectRepos = await ifg.listProjectRepos(projectId).catch(() => []);
  const orgRepos = await ifg.listOrgRepos().catch(() => []);
  const repoById = new Map(orgRepos.map((r) => [r.id, r]));
  const repoFull =
    projectRepos
      .map((pr) => repoById.get(pr.org_repo_id)?.github_full_name)
      .find(Boolean) ?? 'kitrakrev/teamhq-hero';

  const run = await ifg.createRun({
    repo: repoFull,
    trigger_type: 'scenario',
    trigger_source: `Project: ${project.name} · Scenario: ${label}`,
    status: 'starting',
    project_id: projectId,
  });

  // Best-effort detect the org slug for the redirect — UI passes it via referer.
  const referer = req.headers.get('referer') ?? '';
  const slugMatch = referer.match(/\/orgs\/([^/]+)\//);
  const slug = slugMatch?.[1] ?? 'acme-eng';

  return NextResponse.json({
    runId: run.id,
    redirect: `/orgs/${slug}/runs/${run.id}`,
  });
}
