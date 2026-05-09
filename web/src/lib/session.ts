// Server-only helper. Reads cookies, returns the active session user (or null).
// If the demo cookie is set, returns the seeded persona's user record from
// the InsForge users table.
// NOTE: this module imports `next/headers` which is server-only by virtue of
// that import — Next.js will throw if a client component tries to use it.
import { cookies } from 'next/headers';
import { PERSONAS } from './personas';

export type SessionUser = {
  userId: string;
  email: string;
  name: string;
  /** The active tenant for this user. null = needs onboarding. */
  orgId: string | null;
};

const URL_BASE = process.env.INSFORGE_PROJECT_URL!;
const KEY = process.env.INSFORGE_ACCESS_API_KEY!;
/** Fallback tenant for the seeded demo personas (Sarah/Iris/Alice/Grace). */
const DEMO_ORG_ID = process.env.ORG_ID ?? null;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '==='.slice((payload.length + 3) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function lookupUserByEmail(email: string): Promise<{ id: string; email: string; name: string } | null> {
  try {
    const r = await fetch(
      `${URL_BASE}/api/database/records/users?email=eq.${encodeURIComponent(email)}&limit=1`,
      { headers: { 'x-api-key': KEY }, cache: 'no-store' },
    );
    if (!r.ok) return null;
    const rows = (await r.json()) as Array<{
      id: string;
      email: string;
      name: string;
    }>;
    if (!rows.length) return null;
    return rows[0];
  } catch {
    return null;
  }
}

/**
 * Resolve the user's active org. Order of precedence:
 *   1. Explicit `teamhq_org_id` cookie (after onboarding picks/creates an org)
 *   2. The org_members row that links this user to a tenant
 *   3. null — fresh user, must onboard
 *
 * Demo personas (Sarah/Iris/Alice/Grace) are seeded under DEMO_ORG_ID so they
 * naturally resolve to Acme Eng without leaking that tenant to anyone else.
 */
async function resolveOrgIdForUser(userId: string, isDemo: boolean): Promise<string | null> {
  if (isDemo) return DEMO_ORG_ID;
  if (!userId) return null;
  try {
    const r = await fetch(
      `${URL_BASE}/api/database/records/org_members?user_id=eq.${userId}&limit=1`,
      { headers: { 'x-api-key': KEY }, cache: 'no-store' },
    );
    if (!r.ok) return null;
    const rows = (await r.json()) as Array<{ org_id: string }>;
    return rows[0]?.org_id ?? null;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const demoKey = jar.get('teamhq_demo_persona')?.value;
  const cookieOrgId = jar.get('teamhq_org_id')?.value || null;

  if (demoKey) {
    const persona = PERSONAS.find((p) => p.key === demoKey);
    if (persona) {
      const user = await lookupUserByEmail(persona.email);
      const baseUser = user
        ? { userId: user.id, email: user.email, name: user.name }
        : { userId: `demo-${persona.key}`, email: persona.email, name: persona.name };
      const orgId = cookieOrgId ?? (await resolveOrgIdForUser(baseUser.userId, true));
      return { ...baseUser, orgId };
    }
  }

  const token = jar.get('teamhq_token')?.value;
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  const userId =
    (payload.sub as string | undefined) ??
    (payload.user_id as string | undefined) ??
    (payload.id as string | undefined) ??
    '';
  const email = (payload.email as string | undefined) ?? '';
  const name =
    (payload.name as string | undefined) ??
    (payload.full_name as string | undefined) ??
    email.split('@')[0] ??
    '';

  if (!userId && !email) return null;

  const orgId = cookieOrgId ?? (await resolveOrgIdForUser(userId, false));
  return { userId, email, name, orgId };
}
