import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import { authorizeApproveReject, getCard, patchCard, writeAudit } from '../_helpers';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { reason?: string } = {};
  try {
    body = await req.json();
  } catch { /* empty body ok */ }
  const reason = (body.reason ?? '').toString();
  if (!reason.trim()) {
    return NextResponse.json({ error: 'reason required' }, { status: 400 });
  }

  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const card = await getCard(id);
  if (!card) return NextResponse.json({ error: 'card not found' }, { status: 404 });

  const az = authorizeApproveReject(card, viewer);
  if (!az.allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const now = new Date().toISOString();
  const newBody = {
    ...(card.body ?? {}),
    rejected_by: viewer.name,
    rejected_at: now,
    reject_actor: viewer.email,
    reject_reason: reason,
    ...(az.override ? { reject_override: true } : {}),
  };

  const updated = await patchCard(id, { status: 'rejected', body: newBody });
  if (!updated) return NextResponse.json({ error: 'patch failed' }, { status: 502 });

  await writeAudit({
    actor: viewer.email,
    action: az.override ? 'reject_override' : 'reject',
    target_type: 'card',
    target_id: card.id,
  });

  return NextResponse.json({ ok: true, card: updated });
}
