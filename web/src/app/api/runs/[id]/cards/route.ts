import { NextResponse } from 'next/server';
import { ifg } from '@/lib/insforge';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  const orgId = session?.orgId ?? null;
  const cards = await ifg.listCards(orgId, id);
  return NextResponse.json({ cards });
}
