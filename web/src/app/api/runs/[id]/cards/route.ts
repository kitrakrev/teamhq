import { NextResponse } from 'next/server';
import { ifg } from '@/lib/insforge';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cards = await ifg.listCards(id);
  return NextResponse.json({ cards });
}
