// Email + password sign-up. Calls InsForge POST /api/auth/users, then
// writes the access token into an HttpOnly cookie. Email verification is
// disabled in this project so we get a token immediately.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'teamhq_token';
const SEVEN_DAYS = 60 * 60 * 24 * 7;

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const { email, password, name } = body;
  if (!email || !password || !name) {
    return NextResponse.json(
      { message: 'Email, password, and name required' },
      { status: 400 },
    );
  }

  const upstream = await fetch(
    `${process.env.INSFORGE_PROJECT_URL}/api/auth/users`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    },
  );
  const data = await upstream.json().catch(() => ({}));

  if (!upstream.ok) {
    const msg =
      (data as { error?: { message?: string }; message?: string }).error?.message ??
      (data as { message?: string }).message ??
      `Sign-up failed (${upstream.status})`;
    return NextResponse.json({ message: msg }, { status: upstream.status });
  }

  const accessToken = (data as { accessToken?: string }).accessToken;
  if (!accessToken) {
    return NextResponse.json({ message: 'No access token returned' }, { status: 502 });
  }

  const res = NextResponse.json({ ok: true, redirect: '/onboard' });
  res.cookies.set(COOKIE_NAME, accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SEVEN_DAYS,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
