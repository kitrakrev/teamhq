// POST /api/run-scenario — inserts a runs row + spawns the agent process so
// cards stream in real-time. The Python entrypoint is `scripts/run_scenario.py`
// which loads .env, picks the canned TriggerSpec, and runs the loop.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { ifg } from '@/lib/insforge';
import { getSession } from '@/lib/session';

const SCENARIO_LABELS: Record<string, string> = {
  'fastapi-go': 'FastAPI → Go',
  'openai-bump': 'openai SDK upgrade',
  'react-nextjs': 'React → Next.js',
};

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await getSession();
  const orgId = session?.orgId ?? null;
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

  const project = await ifg.getProject(orgId, projectId).catch(() => null);
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }

  // Pick the first attached repo (if any) to seed run.repo. Falls back to
  // a placeholder so the row still inserts.
  const projectRepos = await ifg.listProjectRepos(projectId).catch(() => []);
  const orgRepos = await ifg.listOrgRepos(orgId).catch(() => []);
  const repoById = new Map(orgRepos.map((r) => [r.id, r]));
  const repoFull =
    projectRepos
      .map((pr) => repoById.get(pr.org_repo_id)?.github_full_name)
      .find(Boolean) ?? 'kitrakrev/teamhq-hero';

  if (!orgId) return NextResponse.json({ error: 'no org context' }, { status: 400 });
  const run = await ifg.createRun(orgId, {
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

  // Real fix for "/api/run-scenario doesn't actually invoke the agent":
  // spawn the Python loop detached so the request returns instantly while
  // cards stream into the run we just inserted. Only runs in dev / local
  // (not on Vercel — there the Tensorlake-hosted variant takes over).
  spawnAgent(scenarioKey, orgId, projectId);

  return NextResponse.json({
    runId: run.id,
    redirect: `/orgs/${slug}/runs/${run.id}`,
  });
}

function spawnAgent(scenario: string, orgId: string, projectId: string) {
  // Repo root is two levels above /web in dev. On Vercel, FS is read-only
  // and Python isn't available — caller should rely on the Tensorlake app.
  const repoRoot = join(process.cwd(), '..');
  const script = join(repoRoot, 'scripts', 'run_scenario.py');
  const venvPython = join(repoRoot, '.venv', 'bin', 'python');
  const py = existsSync(venvPython) ? venvPython : 'python3';
  if (!existsSync(script)) {
    console.warn(`[run-scenario] script missing at ${script} — agent NOT spawned`);
    return;
  }
  try {
    const child = spawn(py, [script, scenario, orgId, projectId], {
      cwd: repoRoot,
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.unref();
    console.log(`[run-scenario] spawned ${py} ${script} ${scenario} ${orgId} ${projectId} (pid=${child.pid})`);
  } catch (e) {
    console.error('[run-scenario] spawn failed', e);
  }
}
