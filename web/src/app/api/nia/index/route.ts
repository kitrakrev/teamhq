// POST /api/nia/index — admin-driven world-context indexing.
// Body: { repository?: string, branch?: string, url?: string }
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { nia } from '@/lib/nia';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const repository: string | undefined = body.repository;
  const branch: string | undefined = body.branch;

  if (repository) {
    try {
      const r = await nia.indexRepo({ repository, branch });
      return NextResponse.json({ ok: true, kind: 'repository', repo: r });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'indexing failed';
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  return NextResponse.json({ error: 'repository required' }, { status: 400 });
}

export async function GET() {
  try {
    const repos = await nia.listRepos();
    return NextResponse.json({ repos });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'list failed' }, { status: 502 });
  }
}
