// Direct GitHub OAuth flow that requests `repo` + `workflow` scopes so
// TeamHQ can open + merge real PRs on the user's behalf — instead of the
// read-only InsForge shared GitHub app. Requires a registered GitHub OAuth
// App; configure via env:
//   GITHUB_OAUTH_CLIENT_ID
//   GITHUB_OAUTH_CLIENT_SECRET
//   (Authorization callback URL = <origin>/api/oauth/github-write/callback)
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      new URL('/onboard?err=Set+GITHUB_OAUTH_CLIENT_ID+to+enable+write+scopes', req.nextUrl),
    );
  }
  const next = req.nextUrl.searchParams.get('next') || '/onboard?step=2&gh_write=1';
  const origin = req.nextUrl.origin;
  const callback = `${origin}/api/oauth/github-write/callback`;
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    scope: 'repo workflow read:org',
    state,
    allow_signup: 'true',
  });

  const res = NextResponse.redirect(`https://github.com/login/oauth/authorize?${params}`);
  res.cookies.set('teamhq_gh_write_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
    secure: process.env.NODE_ENV === 'production',
  });
  res.cookies.set('teamhq_gh_write_next', next, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
