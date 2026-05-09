// POST /api/cards/[id]/answer — submit an answer to a question card.
// Only the user the question was addressed to (body.to_user.email) may answer
// it. Architects can override.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getViewer } from '@/lib/viewer';

const URL_ = process.env.INSFORGE_PROJECT_URL!;
const KEY = process.env.INSFORGE_ACCESS_API_KEY!;

async function getCard(id: string) {
  const r = await fetch(
    `${URL_}/api/database/records/cards?id=eq.${id}&limit=1`,
    { headers: { 'x-api-key': KEY }, cache: 'no-store' },
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0] ?? null;
}

async function patchCard(id: string, patch: Record<string, unknown>) {
  await fetch(`${URL_}/api/database/records/cards?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'x-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

async function audit(row: Record<string, unknown>) {
  await fetch(`${URL_}/api/database/records/audit_log`, {
    method: 'POST',
    headers: {
      'x-api-key': KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { answer?: string; choice?: string };
  if (!body.answer && !body.choice) {
    return NextResponse.json({ error: 'answer or choice required' }, { status: 400 });
  }

  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const card = await getCard(id);
  if (!card) return NextResponse.json({ error: 'card not found' }, { status: 404 });
  if (card.card_type !== 'question') {
    return NextResponse.json({ error: 'card is not a question' }, { status: 400 });
  }

  const cardBody = (card.body || {}) as { to_user?: { email?: string }; to_role?: string };
  const targetEmail = cardBody.to_user?.email;
  const allowed =
    viewer.role === 'architect' ||
    viewer.role === 'org_owner' ||
    viewer.email === targetEmail;
  if (!allowed) {
    return NextResponse.json(
      { error: 'forbidden', message: `Only ${targetEmail} can answer this question` },
      { status: 403 },
    );
  }

  const answeredAt = new Date().toISOString();
  await patchCard(id, {
    status: 'answered',
    body: {
      ...cardBody,
      answer: body.answer ?? null,
      choice: body.choice ?? null,
      answered_by: viewer.email,
      answered_at: answeredAt,
    },
  });

  await audit({
    org_id: card.org_id,
    actor: viewer.email,
    action: 'answer',
    target_type: 'card',
    target_id: id,
  });

  return NextResponse.json({ ok: true, status: 'answered', answered_at: answeredAt });
}
