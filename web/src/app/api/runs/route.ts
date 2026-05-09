import { NextResponse } from 'next/server';
import { ifg } from '@/lib/insforge';

export const dynamic = 'force-dynamic';

export async function GET() {
  const runs = await ifg.listRuns(20);
  return NextResponse.json({ runs });
}
