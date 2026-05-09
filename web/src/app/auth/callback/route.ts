// OAuth callback. InsForge redirects the browser back here with
// ?insforge_code=...&state=... after the user authorizes GitHub/Google.
// We exchange the code (PKCE) using the verifier the login page stashed in
// the `teamhq_pkce` cookie, set the HttpOnly token cookie, and redirect on.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'teamhq_token';
const PKCE_COOKIE = 'teamhq_pkce';
const SEVEN_DAYS = 60 * 60 * 24 * 7;

function loginErr(req: NextRequest, msg: string) {
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?err=${encodeURIComponent(msg)}`;
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('insforge_code')
    ?? req.nextUrl.searchParams.get('code');

  if (!code) return loginErr(req, 'Missing OAuth code');

  const codeVerifier = req.cookies.get(PKCE_COOKIE)?.value;
  if (!codeVerifier) {
    return loginErr(req, 'OAuth verifier missing — try again');
  }

  // Direct fetch to InsForge's exchange endpoint.
  const URL = process.env.INSFORGE_PROJECT_URL ?? process.env.NEXT_PUBLIC_INSFORGE_URL;
  if (!URL) return loginErr(req, 'Backend URL not configured');

  const r = await fetch(`${URL}/api/auth/oauth/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: codeVerifier }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    return loginErr(req, data?.message ?? `OAuth exchange failed (${r.status})`);
  }

  const accessToken: string =
    data.accessToken ?? data.access_token ?? '';
  if (!accessToken) return loginErr(req, 'No access token returned');

  // First-time visitor? Send to onboarding.
  const userObj = data.user ?? null;
  const created = userObj?.createdAt ?? userObj?.created_at ?? null;
  let firstTime = false;
  if (created) {
    const ms = new Date(created).getTime();
    if (!Number.isNaN(ms) && Date.now() - ms < 60_000) firstTime = true;
  }

  const dest = req.nextUrl.clone();
  dest.pathname = firstTime ? '/onboard' : '/';
  dest.search = '';
  const res = NextResponse.redirect(dest);
  res.cookies.set(COOKIE_NAME, accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SEVEN_DAYS,
    secure: process.env.NODE_ENV === 'production',
  });
  // Clear PKCE cookie — it's single-use.
  res.cookies.set(PKCE_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
