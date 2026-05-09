// Email + password sign-up. Calls InsForge POST /api/auth/users, then
// writes the access token into an HttpOnly cookie. Email verification is
// disabled in this project so we get a token immediately.
//
// First-time users get a fresh tenant: we mirror their auth user into
// `users`, provision an `orgs` row, and add an `org_members` row so they
// don't see anyone else's data.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'teamhq_token';
const ORG_COOKIE = 'teamhq_org_id';
const SEVEN_DAYS = 60 * 60 * 24 * 7;

async function provisionTenant(opts: {
  insforgeUserId: string;
  email: string;
  name: string;
}): Promise<string | null> {
  const URL = process.env.INSFORGE_PROJECT_URL;
  const KEY = process.env.INSFORGE_ACCESS_API_KEY;
  if (!URL || !KEY) return null;

  const headers = {
    'x-api-key': KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // 1. Mirror auth user -> users table (so org_members.user_id can FK to it).
  const userRows = await fetch(`${URL}/api/database/records/users?email=eq.${encodeURIComponent(opts.email)}&limit=1`, {
    headers: { 'x-api-key': KEY }, cache: 'no-store',
  }).then((r) => r.json()).catch(() => []);
  let userRowId: string | null = userRows[0]?.id ?? null;
  if (!userRowId) {
    const created = await fetch(`${URL}/api/database/records/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: opts.name,
        email: opts.email,
        role: 'lead',
        team: 'backend',
        github_login: null,
      }),
    }).then((r) => r.json()).catch(() => null);
    userRowId = Array.isArray(created) ? created[0]?.id : created?.id;
  }
  if (!userRowId) return null;

  // 2. Provision a brand-new org with a unique slug.
  const slug = `${opts.email.split('@')[0]}-${Math.random().toString(36).slice(2, 6)}`;
  const orgCreated = await fetch(`${URL}/api/database/records/orgs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `${opts.name}'s Org`,
      slug,
      owner_user_id: userRowId,
    }),
  }).then((r) => r.json()).catch(() => null);
  const org = Array.isArray(orgCreated) ? orgCreated[0] : orgCreated;
  if (!org?.id) return null;

  // 3. Insert org_members so resolveOrgIdForUser finds it.
  await fetch(`${URL}/api/database/records/org_members`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      org_id: org.id,
      user_id: userRowId,
      role: 'org_owner',
      team_id: null,
    }),
  });

  return org.id;
}

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
  const insforgeUser = (data as { user?: { id: string; email: string } }).user;
  if (!accessToken) {
    return NextResponse.json({ message: 'No access token returned' }, { status: 502 });
  }

  // Provision a fresh tenant for this brand-new account so they're isolated
  // from the seeded Acme Eng demo data.
  const orgId = insforgeUser
    ? await provisionTenant({
        insforgeUserId: insforgeUser.id,
        email: insforgeUser.email ?? email,
        name,
      })
    : null;

  const res = NextResponse.json({ ok: true, redirect: '/onboard' });
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
  return res;
}
