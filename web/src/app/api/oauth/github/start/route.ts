// "Connect GitHub" entry from /onboard. Initiates the InsForge GitHub OAuth
// flow w/ PKCE and stashes the verifier in a cookie. The InsForge shared
// OAuth app only grants `user:email read:user` (no `repo` scope), so we
// can't read private repos — but we mark the user as connected and pull
// public repos via the GitHub REST API on step 2.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get('next') || '/onboard?step=2';
  const ifgUrl = process.env.INSFORGE_PROJECT_URL ?? process.env.NEXT_PUBLIC_INSFORGE_URL;
  if (!ifgUrl) {
    return NextResponse.redirect(new URL('/onboard?err=Backend+URL+missing', req.nextUrl));
  }

  // PKCE — RFC 7636. The verifier must be ≥43 chars; InsForge enforces this.
  const verifier = (crypto.randomUUID() + '-' + crypto.randomUUID() + '-' + crypto.randomUUID()).slice(0, 64);
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const origin = req.nextUrl.origin;
  const callback = `${origin}/api/oauth/github/callback`;

  const params = new URLSearchParams({
    code_challenge: challenge,
    code_challenge_method: 'S256',
    redirect_uri: callback,
  });

  const r = await fetch(`${ifgUrl}/api/auth/oauth/github?${params}`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.authUrl) {
    return NextResponse.redirect(
      new URL(`/onboard?err=${encodeURIComponent(data?.message ?? 'OAuth init failed')}`, req.nextUrl),
    );
  }

  const res = NextResponse.redirect(data.authUrl);
  res.cookies.set('teamhq_pkce_onboard', verifier, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
    secure: process.env.NODE_ENV === 'production',
  });
  res.cookies.set('teamhq_oauth_next', next, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
