import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import { getCard, patchCard, writeAudit } from '../_helpers';

export const dynamic = 'force-dynamic';

type Comment = { actor: string; text: string; ts: string };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { text?: string } = {};
  try {
    body = await req.json();
  } catch { /* */ }
  const text = (body.text ?? '').toString().trim();
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });

  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const card = await getCard(id);
  if (!card) return NextResponse.json({ error: 'card not found' }, { status: 404 });

  const existing = (card.body && Array.isArray((card.body as { comments?: unknown }).comments)
    ? ((card.body as { comments: Comment[] }).comments)
    : []) as Comment[];

  const comment: Comment = {
    actor: viewer.email,
    text,
    ts: new Date().toISOString(),
  };
  const newBody = { ...(card.body ?? {}), comments: [...existing, comment] };

  const updated = await patchCard(id, { body: newBody });
  if (!updated) return NextResponse.json({ error: 'patch failed' }, { status: 502 });

  await writeAudit({
    actor: viewer.email,
    action: 'comment',
    target_type: 'card',
    target_id: card.id,
  });

  return NextResponse.json({ ok: true, card: updated });
}
