// Server-only: resolve the active viewer (full user row) from cookies.
// Reads either the demo persona cookie or the InsForge JWT, then looks up
// the user in InsForge by email so we get role/team/github_login.
import 'server-only';
import { cookies } from 'next/headers';
import { PERSONAS } from './personas';

const URL_BASE = process.env.INSFORGE_PROJECT_URL!;
const KEY = process.env.INSFORGE_ACCESS_API_KEY!;

export type Viewer = {
  userId: string;
  name: string;
  email: string;
  role: string;
  team: string;
  github_login: string | null;
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '==='.slice((payload.length + 3) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

async function lookupByEmail(email: string): Promise<Viewer | null> {
  const r = await fetch(
    `${URL_BASE}/api/database/records/users?email=eq.${encodeURIComponent(email)}&limit=1`,
    { headers: { 'x-api-key': KEY }, cache: 'no-store' },
  );
  if (!r.ok) return null;
  const rows = (await r.json()) as Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    team: string;
    github_login: string | null;
  }>;
  if (!rows.length) return null;
  const u = rows[0];
  return {
    userId: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    team: u.team,
    github_login: u.github_login,
  };
}

export async function getViewer(): Promise<Viewer | null> {
  const jar = await cookies();
  const demoKey = jar.get('teamhq_demo_persona')?.value;
  if (demoKey) {
    const persona = PERSONAS.find((p) => p.key === demoKey);
    if (persona) {
      const v = await lookupByEmail(persona.email);
      if (v) return v;
      // Fallback to in-memory persona record if DB seed missing.
      return {
        userId: `demo-${persona.key}`,
        name: persona.name,
        email: persona.email,
        role: persona.role,
        team: persona.team,
        github_login: persona.github_login,
      };
    }
  }
  const token = jar.get('teamhq_token')?.value;
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const email = (payload.email as string | undefined) ?? '';
  if (!email) return null;
  return lookupByEmail(email);
}
