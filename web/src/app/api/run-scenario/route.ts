// POST /api/run-scenario — inserts a runs row + spawns the agent process so
// cards stream in real-time. The Python entrypoint is `scripts/run_scenario.py`
// which loads .env, picks the canned TriggerSpec, and runs the loop.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { ifg } from '@/lib/insforge';
import { getSession } from '@/lib/session';

// Run trigger.
// - Real users: project MUST have at least one repo attached; otherwise we
//   422 the caller and surface a "go to /onboard" hint.
// - Demo personas (cookie-only auth): fall back to kitrakrev/teamhq-hero so
//   the canned demo flow keeps working without forcing onboarding.
// - Accepts free-text `prompt` (preferred) OR a legacy canned `scenario` key.

import { cookies } from 'next/headers';

const DEMO_FALLBACK_REPO = 'kitrakrev/teamhq-hero';

export const dynamic = 'force-dynamic';

const LEGACY_SCENARIO_LABELS: Record<string, string> = {
  'fastapi-go': 'Port FastAPI service to Go for cost/perf',
  'openai-bump': 'Bump openai SDK and migrate call sites',
  'react-nextjs': 'Migrate React CRA to Next.js App Router',
};

export async function POST(req: Request) {
  const session = await getSession();
  const orgId = session?.orgId ?? null;
  if (!orgId) return NextResponse.json({ error: 'no org context — sign in first' }, { status: 401 });

  let body: { projectId?: string; scenario?: string; prompt?: string };
  try {
    body = (await req.json()) as { projectId?: string; scenario?: string; prompt?: string };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const projectId = body.projectId;
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const promptRaw = (body.prompt ?? '').trim();
  const legacyLabel = body.scenario ? LEGACY_SCENARIO_LABELS[body.scenario] : undefined;
  const triggerSource = promptRaw || legacyLabel;
  if (!triggerSource) {
    return NextResponse.json(
      { error: 'prompt (free text) or a legacy scenario key required' },
      { status: 400 },
    );
  }

  const project = await ifg.getProject(orgId, projectId).catch(() => null);
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }

  // Resolve the project's repos. NO hardcoded fallback — if the user hasn't
  // attached a repo, send them to /onboard.
  const projectRepos = await ifg.listProjectRepos(projectId).catch(() => []);
  const orgRepos = await ifg.listOrgRepos(orgId).catch(() => []);
  const repoById = new Map(orgRepos.map((r) => [r.id, r]));
  const repos = projectRepos
    .map((pr) => repoById.get(pr.org_repo_id)?.github_full_name)
    .filter((x): x is string => Boolean(x));

  // Demo personas (auth via teamhq_demo_persona cookie, no real GitHub
  // OAuth) get the seeded fallback repo so the demo flow works without
  // onboarding. Real signups must attach a repo first.
  const jar = await cookies();
  const isDemoPersona = Boolean(jar.get('teamhq_demo_persona')?.value);

  let targetRepo: string;
  if (repos.length > 0) {
    targetRepo = repos[0];
  } else if (isDemoPersona) {
    targetRepo = DEMO_FALLBACK_REPO;
    console.log(`[run-scenario] demo persona; falling back to ${DEMO_FALLBACK_REPO}`);
  } else {
    return NextResponse.json(
      {
        error: 'no repos attached to this project',
        hint: 'Open the project, attach at least one repo (or finish /onboard step 2 first).',
      },
      { status: 422 },
    );
  }

  const run = await ifg.createRun(orgId, {
    repo: targetRepo,
    trigger_type: promptRaw ? 'prompt' : 'scenario',
    trigger_source: `Project: ${project.name} · ${triggerSource}`,
    status: 'starting',
    project_id: projectId,
  });

  spawnAgent({
    orgId,
    projectId,
    runId: run.id,
    repo: targetRepo,
    prompt: triggerSource,
  });

  return NextResponse.json({
    runId: run.id,
    redirect: `/?run=${run.id}`,
  });
}

function spawnAgent(args: {
  orgId: string;
  projectId: string;
  runId: string;
  repo: string;
  prompt: string;
}) {
  const repoRoot = join(process.cwd(), '..');
  const script = join(repoRoot, 'scripts', 'run_scenario.py');
  const venvPython = join(repoRoot, '.venv', 'bin', 'python');
  const py = existsSync(venvPython) ? venvPython : 'python3';
  if (!existsSync(script)) {
    console.warn(`[run-scenario] script missing at ${script} — agent NOT spawned`);
    return;
  }
  try {
    const child = spawn(
      py,
      [script, '--repo', args.repo, '--prompt', args.prompt, '--org', args.orgId, '--project', args.projectId, '--run', args.runId],
      {
        cwd: repoRoot,
        detached: true,
        stdio: 'ignore',
        env: process.env,
      },
    );
    child.unref();
    console.log(`[run-scenario] spawned pid=${child.pid} repo=${args.repo}`);
  } catch (e) {
    console.error('[run-scenario] spawn failed', e);
  }
}
