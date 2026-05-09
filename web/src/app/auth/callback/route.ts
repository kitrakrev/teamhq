// OAuth callback. InsForge redirects the browser back here with
// ?insforge_code=...&state=... after the user authorizes GitHub/Google.
// We exchange the code (PKCE) using the verifier the login page stashed in
// the `teamhq_pkce` cookie, set the HttpOnly token cookie, and redirect on.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'teamhq_token';
const PKCE_COOKIE = 'teamhq_pkce';
const ORG_COOKIE = 'teamhq_org_id';
const SEVEN_DAYS = 60 * 60 * 24 * 7;

async function provisionTenant(insforgeUser: { id: string; email?: string; profile?: { name?: string } }): Promise<string | null> {
  const URL = process.env.INSFORGE_PROJECT_URL;
  const KEY = process.env.INSFORGE_ACCESS_API_KEY;
  if (!URL || !KEY) return null;
  const headers = {
    'x-api-key': KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  const email = insforgeUser.email ?? `${insforgeUser.id}@auth.local`;
  const name = insforgeUser.profile?.name ?? email.split('@')[0];

  // Skip if a membership already exists.
  try {
    const existing = await fetch(`${URL}/api/database/records/org_members?user_id=eq.${insforgeUser.id}&limit=1`, {
      headers: { 'x-api-key': KEY }, cache: 'no-store',
    }).then((r) => r.json());
    if (existing?.[0]?.org_id) return existing[0].org_id;
  } catch {}

  // Mirror to users table.
  const userRows = await fetch(`${URL}/api/database/records/users?email=eq.${encodeURIComponent(email)}&limit=1`, {
    headers: { 'x-api-key': KEY }, cache: 'no-store',
  }).then((r) => r.json()).catch(() => []);
  let userRowId: string | null = userRows[0]?.id ?? null;
  if (!userRowId) {
    const created = await fetch(`${URL}/api/database/records/users`, {
      method: 'POST', headers,
      body: JSON.stringify({ name, email, role: 'lead', team: 'backend', github_login: null }),
    }).then((r) => r.json()).catch(() => null);
    userRowId = Array.isArray(created) ? created[0]?.id : created?.id;
  }
  if (!userRowId) return null;

  const slug = `${email.split('@')[0]}-${Math.random().toString(36).slice(2, 6)}`;
  const orgCreated = await fetch(`${URL}/api/database/records/orgs`, {
    method: 'POST', headers,
    body: JSON.stringify({ name: `${name}'s Org`, slug, owner_user_id: userRowId }),
  }).then((r) => r.json()).catch(() => null);
  const org = Array.isArray(orgCreated) ? orgCreated[0] : orgCreated;
  if (!org?.id) return null;

  await fetch(`${URL}/api/database/records/org_members`, {
    method: 'POST', headers,
    body: JSON.stringify({ org_id: org.id, user_id: userRowId, role: 'org_owner', team_id: null }),
  });
  return org.id;
}

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

  // Auto-provision a tenant for first-time sign-ins.
  const orgId = data.user
    ? await provisionTenant(data.user as { id: string; email?: string; profile?: { name?: string } })
    : null;

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
  if (orgId) {
    res.cookies.set(ORG_COOKIE, orgId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SEVEN_DAYS,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  // Clear PKCE cookie — it's single-use.
  res.cookies.set(PKCE_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
