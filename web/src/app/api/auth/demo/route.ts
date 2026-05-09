// Demo shortcut: drop a non-HttpOnly persona-key cookie and bounce to /.
// This is the only "shortcut" allowed — every other path is real auth.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SEVEN_DAYS = 60 * 60 * 24 * 7;

export async function POST(req: NextRequest) {
  let body: { persona?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const persona = body.persona ?? 'sarah';

  const res = NextResponse.json({ ok: true, redirect: '/' });
  res.cookies.set('teamhq_demo_persona', persona, {
    httpOnly: false, // demo only — readable by client for UI
    sameSite: 'lax',
    path: '/',
    maxAge: SEVEN_DAYS,
  });
  return res;
}
