// Universal OAuth start handler — every Hyperspell-supported provider goes
// through here. We mint a per-user Hyperspell user_token, ask Hyperspell for
// a connect link, and redirect the user there. After they finish the OAuth
// dance, Hyperspell redirects them back to /api/oauth/hyperspell/callback.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

// integration UUIDs come from Hyperspell integrations.list() — pinned here
// so we don't round-trip on every request.
const INTEGRATIONS: Record<string, string> = {
  slack:           '019e0e05-b83b-7692-864d-ddfb0d0e6d75',
  notion:          '019e0e05-b266-70d7-a52f-3bcfc7700a14',
  github:          '019e0e05-b393-7733-9bb1-aec52abed116',
  drive:           '019e0e05-b14e-7222-bcfe-40c270d47656',
  google_drive:    '019e0e05-b14e-7222-bcfe-40c270d47656',
  gmail:           '019e0e05-b4b3-76a5-a09d-6377476f9687',
  google_mail:     '019e0e05-b4b3-76a5-a09d-6377476f9687',
  linear:          '019e0e05-b5eb-722b-9bd9-a2c1a73958bf',
  teams:           '019e0e05-b714-7137-ba53-d3b35e8bd9c5',
  microsoft_teams: '019e0e05-b714-7137-ba53-d3b35e8bd9c5',
};

const ADMIN_KEY = process.env.HYPERSPELL_API_KEY ?? '';

// Hyperspell REST (verified via SDK probe):
//   POST https://api.hyperspell.com/auth/user_token  body: {user_id}
//   GET  https://api.hyperspell.com/integrations/<uuid>/connect?redirect_url=...
const HYPERSPELL_BASE = 'https://api.hyperspell.com';

async function mintUserToken(userId: string): Promise<string | null> {
  if (!ADMIN_KEY) return null;
  try {
    const r = await fetch(`${HYPERSPELL_BASE}/auth/user_token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ADMIN_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId }),
    });
    if (!r.ok) {
      console.warn('[hyperspell] mintUserToken failed', r.status, await r.text());
      return null;
    }
    const data = (await r.json()) as { token?: string };
    return data.token ?? null;
  } catch (e) {
    console.warn('[hyperspell] mintUserToken err', e);
    return null;
  }
}

async function connect(userToken: string, integrationId: string, redirectUrl: string): Promise<string | null> {
  try {
    const url = `${HYPERSPELL_BASE}/integrations/${integrationId}/connect?redirect_url=${encodeURIComponent(redirectUrl)}`;
    const r = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    if (!r.ok) {
      console.warn('[hyperspell] connect failed', r.status, await r.text());
      return null;
    }
    const data = (await r.json()) as { url?: string; auth_url?: string; authorization_url?: string };
    return data.url ?? data.auth_url ?? data.authorization_url ?? null;
  } catch (e) {
    console.warn('[hyperspell] connect err', e);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const provider = (req.nextUrl.searchParams.get('provider') ?? '').toLowerCase();
  const next = req.nextUrl.searchParams.get('next') ?? '/orgs/default/connectors';
  const integrationId = INTEGRATIONS[provider];
  if (!integrationId) {
    return NextResponse.redirect(new URL(`/orgs/default/connectors?err=${encodeURIComponent('Unknown provider')}`, req.nextUrl));
  }

  const session = await getSession();
  const userId = session?.userId;
  if (!userId) {
    return NextResponse.redirect(new URL('/login?err=signin+to+connect', req.nextUrl));
  }

  const userToken = await mintUserToken(userId);
  if (!userToken) {
    return NextResponse.redirect(
      new URL(`/orgs/default/connectors?err=${encodeURIComponent('Could not mint token')}`, req.nextUrl),
    );
  }

  const callback = `${req.nextUrl.origin}/api/oauth/hyperspell/callback?provider=${provider}&next=${encodeURIComponent(next)}`;
  const authUrl = await connect(userToken, integrationId, callback);
  if (!authUrl) {
    return NextResponse.redirect(
      new URL(`/orgs/default/connectors?err=${encodeURIComponent('Hyperspell connect failed')}`, req.nextUrl),
    );
  }

  // Park userId so the callback knows who's connecting
  const res = NextResponse.redirect(authUrl);
  res.cookies.set('teamhq_hyperspell_uid', userId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
