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

  // Kick off an agent reply via the Claude tunnel (laptop-hosted CLI exposed
  // through ngrok). Fire-and-forget — caller doesn't wait on streaming.
  void streamClaudeReply({
    runId,
    orgId: session.orgId,
    projectId: run.project_id ?? null,
    sourceCardId: card.id,
    authorName: persona?.name ?? session.name ?? session.email,
    userText: text,
  });

  return NextResponse.json({ card });
}

type StreamArgs = {
  runId: string;
  orgId: string;
  projectId: string | null;
  sourceCardId: string;
  authorName: string;
  userText: string;
};

async function streamClaudeReply(args: StreamArgs) {
  const tunnelUrl = process.env.CLAUDE_TUNNEL_URL;
  const tunnelSecret = process.env.TEAMHQ_TUNNEL_SECRET;
  if (!tunnelUrl || !tunnelSecret) {
    console.warn('[messages] CLAUDE_TUNNEL_URL / TEAMHQ_TUNNEL_SECRET not set; skipping agent reply');
    return;
  }

  // Pull the run's history so the agent reasons in-context.
  const cards = await ifg.listCards(args.orgId, args.runId).catch(() => []);
  const history = cards
    .map((c) => {
      const b = (c.body as Record<string, unknown> | null) ?? {};
      const t = (b.text as string | undefined) || c.title || '';
      const team = c.team_id ? `[${c.team_id}]` : '';
      return `- ${c.card_type}${team}: ${String(t).slice(0, 200)}`;
    })
    .join('\n');

  const systemPrompt =
    "You are TeamHQ's conversational engineering agent. Reply in plain prose " +
    '(one short paragraph). At the very end of your reply, on a new line, append a route tag: ' +
    '<route>{"kind":"answer|question|plan_revision|comment|noop","to_user_email":"<email or null>",' +
    '"to_team":"backend|ds|ui|devops or null","rationale":"<why>"}</route>. ' +
    'Personas: backend=sarah@teamhq.demo, ds=iris@teamhq.demo, ui=alice@teamhq.demo, ' +
    'devops=grace@teamhq.demo, architect=dan@teamhq.demo, pm=frank@teamhq.demo.';

  const userPrompt = `# Run history\n${history}\n\n# New message from ${args.authorName}\n${JSON.stringify(args.userText)}\n\nRespond now.`;

  // Insert placeholder card immediately so UI shows "Agent thinking…".
  const placeholder = await ifg.createCard(args.orgId, {
    run_id: args.runId,
    project_id: args.projectId,
    card_type: 'agent_reply',
    title: 'Agent thinking…',
    body: {
      text: '',
      streaming: true,
      kind: 'streaming',
      in_reply_to_card_id: args.sourceCardId,
      in_reply_to_author: args.authorName,
    },
    status: 'streaming',
  });

  // Tunnel /reply runs the whole pipeline server-side: spawns claude, reads
  // SSE, PATCHes the card live, parses route tag. Vercel function returns
  // immediately while the tunnel keeps streaming. Survives Vercel's 60s
  // function timeout because the work happens off-platform.
  const baseUrl = tunnelUrl.replace(/\/(chat|reply)\/?$/, '').replace(/\/$/, '');
  const replyUrl = `${baseUrl}/reply`;

  try {
    await fetch(replyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TeamHQ-Auth': tunnelSecret,
        'ngrok-skip-browser-warning': '1',
      },
      body: JSON.stringify({
        prompt: userPrompt,
        system_prompt: systemPrompt,
        card_id: placeholder.id,
        run_id: args.runId,
        org_id: args.orgId,
        project_id: args.projectId,
        source_card_id: args.sourceCardId,
        author_name: args.authorName,
      }),
    });
  } catch (e) {
    console.error('[messages] tunnel kick failed', e);
    await ifg
      .updateCardBody(placeholder.id, { text: '(agent unreachable)', streaming: false }, 'info')
      .catch(() => {});
  }
}
