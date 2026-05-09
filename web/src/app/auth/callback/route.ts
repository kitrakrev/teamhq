// OAuth callback. InsForge redirects the browser back here with
// ?insforge_code=...&state=... after the user authorizes GitHub/Google.
// We exchange the code (PKCE) using the stored verifier (sent in `state` as
// a base64-encoded blob), set the HttpOnly cookie, and redirect on.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { InsForgeClient } from '@insforge/sdk';

const COOKIE_NAME = 'teamhq_token';
const SEVEN_DAYS = 60 * 60 * 24 * 7;

function loginErr(req: NextRequest, msg: string) {
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?err=${encodeURIComponent(msg)}`;
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('insforge_code');
  const state = req.nextUrl.searchParams.get('state') ?? '';

  if (!code) return loginErr(req, 'Missing OAuth code');

  // The login page packs the codeVerifier into `state` as base64(JSON).
  let codeVerifier: string | undefined;
  try {
    if (state) {
      const decoded = Buffer.from(state, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      codeVerifier = parsed.cv;
    }
  } catch {
    // ignore — exchange may still work without a verifier on some flows
  }

  const client = new InsForgeClient({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
    anonKey: undefined as unknown as string,
  });

  const { data, error } = await client.auth.exchangeOAuthCode(code, codeVerifier);
  if (error || !data) {
    return loginErr(req, error?.message ?? 'OAuth exchange failed');
  }

  const accessToken =
    (data as { accessToken?: string; access_token?: string }).accessToken ??
    (data as { access_token?: string }).access_token ??
    '';

  if (!accessToken) return loginErr(req, 'No access token returned');

  // Was this user just created? If yes -> /onboard. Else -> /
  const userObj = (data as { user?: { created_at?: string; createdAt?: string } }).user;
  const created =
    userObj?.created_at ?? userObj?.createdAt ?? null;
  let firstTime = false;
  if (created) {
    const createdMs = new Date(created).getTime();
    if (!Number.isNaN(createdMs) && Date.now() - createdMs < 60_000) {
      firstTime = true;
    }
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

  return res;
}
