import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import { getCard, patchCard, writeAudit } from '../_helpers';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { reason?: string } = {};
  try {
    body = await req.json();
  } catch { /* */ }
  const reason = (body.reason ?? '').toString().trim();
  if (!reason) return NextResponse.json({ error: 'reason required' }, { status: 400 });

  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  if (viewer.role !== 'architect' && viewer.role !== 'org_owner') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const card = await getCard(id);
  if (!card) return NextResponse.json({ error: 'card not found' }, { status: 404 });

  const newBody = {
    ...(card.body ?? {}),
    override_actor: viewer.email,
    override_reason: reason,
    override_at: new Date().toISOString(),
  };

  const updated = await patchCard(id, { status: 'overridden', body: newBody });
  if (!updated) return NextResponse.json({ error: 'patch failed' }, { status: 502 });

  await writeAudit({
    actor: viewer.email,
    action: 'override',
    target_type: 'card',
    target_id: card.id,
  });

  return NextResponse.json({ ok: true, card: updated });
}
