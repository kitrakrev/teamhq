// POST /api/runs/<run_id>/messages — append a user_message card to a run.
// Anyone signed into the org can post. The card appears in the live feed
// for every viewer in the same org via the 2-second poll.
import { NextResponse } from 'next/server';
import { ifg } from '@/lib/insforge';
import { getSession } from '@/lib/session';
import { PERSONAS } from '@/lib/personas';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.orgId) {
    return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  }
  const { id: runId } = await ctx.params;

  let body: { text?: string };
  try {
    body = (await req.json()) as { text?: string };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const text = (body.text ?? '').trim();
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });

  // Verify the run belongs to this org.
  const runs = await ifg.listRuns(session.orgId, 200).catch(() => []);
  const run = runs.find((r) => r.id === runId);
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });

  // Decorate w/ persona info so the card renders the right name + ink.
  const persona = PERSONAS.find((p) => p.email === session.email);

  const card = await ifg.createCard(session.orgId, {
    run_id: runId,
    project_id: run.project_id ?? null,
    card_type: 'user_message',
    title: persona ? `${persona.name} (${persona.team})` : (session.name || session.email),
    team_id: persona?.team ?? null,
    body: {
      text,
      author_email: session.email,
      author_name: persona?.name ?? session.name ?? session.email,
      author_team: persona?.team ?? null,
      author_role: persona?.role ?? null,
    },
    status: 'info',
  });

  return NextResponse.json({ card });
}
