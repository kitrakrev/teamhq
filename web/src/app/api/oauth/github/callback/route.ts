// GitHub OAuth callback for the onboarding "Connect GitHub" flow.
// Exchanges the InsForge code -> session, then writes an oauth_tokens row so
// the rest of the app sees "GitHub connected".
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('insforge_code')
    ?? req.nextUrl.searchParams.get('code');
  const verifier = req.cookies.get('teamhq_pkce_onboard')?.value;
  const next = req.cookies.get('teamhq_oauth_next')?.value || '/onboard?step=2';

  if (!code || !verifier) {
    return NextResponse.redirect(
      new URL('/onboard?err=' + encodeURIComponent('OAuth callback missing code/verifier'), req.nextUrl),
    );
  }

  const ifgUrl = process.env.INSFORGE_PROJECT_URL ?? process.env.NEXT_PUBLIC_INSFORGE_URL;
  if (!ifgUrl) {
    return NextResponse.redirect(new URL('/onboard?err=Backend+URL+missing', req.nextUrl));
  }

  const xch = await fetch(`${ifgUrl}/api/auth/oauth/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier }),
  });
  const xchData = await xch.json().catch(() => ({}));
  if (!xch.ok) {
    return NextResponse.redirect(
      new URL('/onboard?err=' + encodeURIComponent(xchData?.message ?? 'OAuth exchange failed'), req.nextUrl),
    );
  }

  // Resolve current session — should already be authed when reaching onboarding.
  const session = await getSession();
  const userId = session?.userId ?? xchData?.user?.id ?? null;
  const ghLogin = xchData?.user?.profile?.github_login
    ?? xchData?.user?.metadata?.github_login
    ?? xchData?.user?.profile?.login
    ?? null;

  // Insert oauth_tokens row (best-effort; UI tolerates absence).
  if (userId) {
    try {
      const KEY = process.env.INSFORGE_ACCESS_API_KEY;
      if (KEY) {
        await fetch(`${ifgUrl}/api/database/records/oauth_tokens`, {
          method: 'POST',
          headers: {
            'x-api-key': KEY,
            'content-type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            user_id: userId,
            provider: 'github',
            access_token: xchData?.accessToken ?? '',
            github_login: ghLogin ?? 'unknown',
            scopes: 'user:email read:user',
          }),
        });
      }
    } catch {
      // best-effort; don't block the redirect
    }
  }

  const dest = new URL(next, req.nextUrl);
  const res = NextResponse.redirect(dest);
  // Clean up single-use cookies.
  res.cookies.set('teamhq_pkce_onboard', '', { path: '/', maxAge: 0 });
  res.cookies.set('teamhq_oauth_next', '', { path: '/', maxAge: 0 });

  // If a fresh session token was minted, set it.
  if (xchData?.accessToken) {
    res.cookies.set('teamhq_token', xchData.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return res;
}
