import { NextResponse } from 'next/server';
import { ifg } from '@/lib/insforge';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  const orgId = session?.orgId ?? null;
  const runs = await ifg.listRuns(orgId, 20);
  return NextResponse.json({ runs });
}
