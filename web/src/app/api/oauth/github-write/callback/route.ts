// Callback for the write-scope GitHub OAuth flow. Exchanges the code for an
// access token, fetches the GitHub user (login + scopes), and persists the
// token in oauth_tokens with provider='github_write' so the agent's PR opener
// can use it. Read scope flow lives in /api/oauth/github/* — keep separate.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ifg } from '@/lib/insforge';
import { getSession } from '@/lib/session';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const cookieState = req.cookies.get('teamhq_gh_write_state')?.value;
  const next = req.cookies.get('teamhq_gh_write_next')?.value || '/onboard?step=2&gh_write=1';

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL('/onboard?err=Invalid+OAuth+state', req.nextUrl));
  }
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL('/onboard?err=GH+OAuth+app+not+configured', req.nextUrl),
    );
  }

  // 1. Exchange code for access token.
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${req.nextUrl.origin}/api/oauth/github-write/callback`,
    }),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  const accessToken: string | undefined = tokenData.access_token;
  const scopes: string | undefined = tokenData.scope;
  if (!accessToken) {
    const msg = tokenData.error_description ?? tokenData.error ?? 'token exchange failed';
    return NextResponse.redirect(new URL(`/onboard?err=${encodeURIComponent(msg)}`, req.nextUrl));
  }

  // 2. Fetch the GitHub login so we can record it alongside the token.
  const ghUser = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
  })
    .then((r) => r.json())
    .catch(() => ({}));
  const ghLogin: string | null = ghUser?.login ?? null;

  // 3. Persist. Use the live session's user_id so this token is tied to the
  // logged-in TeamHQ user (multi-tenant safe).
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL('/login?err=Not+signed+in', req.nextUrl));
  }
  await ifg.recordOAuthToken({
    user_id: session.userId,
    provider: 'github_write',
    access_token: accessToken,
    github_login: ghLogin,
    scopes: scopes ?? null,
  });

  const res = NextResponse.redirect(new URL(next, req.nextUrl));
  res.cookies.delete('teamhq_gh_write_state');
  res.cookies.delete('teamhq_gh_write_next');
  return res;
}
