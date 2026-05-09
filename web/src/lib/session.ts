// Server-only helper. Reads cookies, returns the active session user (or null).
// If the demo cookie is set, returns the seeded persona's user record from
// the InsForge users table.
import 'server-only';
import { cookies } from 'next/headers';
import { PERSONAS } from './personas';

export type SessionUser = {
  userId: string;
  email: string;
  name: string;
};

const URL_BASE = process.env.INSFORGE_PROJECT_URL!;
const KEY = process.env.INSFORGE_ACCESS_API_KEY!;

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

async function lookupUserByEmail(email: string): Promise<SessionUser | null> {
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
    return { userId: rows[0].id, email: rows[0].email, name: rows[0].name };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const demoKey = jar.get('teamhq_demo_persona')?.value;

  if (demoKey) {
    const persona = PERSONAS.find((p) => p.key === demoKey);
    if (persona) {
      const user = await lookupUserByEmail(persona.email);
      if (user) return user;
      // Fall back to the in-memory persona if the row hasn't been seeded yet.
      return {
        userId: `demo-${persona.key}`,
        email: persona.email,
        name: persona.name,
      };
    }
  }

  const token = jar.get('teamhq_token')?.value;
  if (!token) return null;

  // Don't fully validate signature — just shape-check + best-effort claim read.
  const payload = decodeJwtPayload(token);
  if (!payload) {
    // Token is opaque; still treat as authed but we can't extract a user.
    return null;
  }

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
  return { userId, email, name };
}
