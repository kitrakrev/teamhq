import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import { authorizeApproveReject, getCard, patchCard, writeAudit } from '../_helpers';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const card = await getCard(id);
  if (!card) return NextResponse.json({ error: 'card not found' }, { status: 404 });

  const az = authorizeApproveReject(card, viewer);
  if (!az.allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const now = new Date().toISOString();
  const newBody = {
    ...(card.body ?? {}),
    approved_by: viewer.name,
    approved_at: now,
    approval_actor: viewer.email,
    ...(az.override ? { approval_override: true } : {}),
  };

  const updated = await patchCard(id, { status: 'approved', body: newBody });
  if (!updated) return NextResponse.json({ error: 'patch failed' }, { status: 502 });

  await writeAudit({
    actor: viewer.email,
    action: az.override ? 'approve_override' : 'approve',
    target_type: 'card',
    target_id: card.id,
  });

  return NextResponse.json({ ok: true, card: updated });
}
