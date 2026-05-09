// Shared helpers for card action routes (approve/reject/comment/override).
import 'server-only';

const URL_BASE = process.env.INSFORGE_PROJECT_URL!;
const KEY = process.env.INSFORGE_ACCESS_API_KEY!;
export const ORG_ID = process.env.ORG_ID!;

export type CardRow = {
  id: string;
  run_id: string | null;
  org_id: string;
  card_type: string;
  team_id: string | null;
  title: string | null;
  body: Record<string, unknown> | null;
  visibility: Record<string, unknown> | null;
  status: string | null;
  project_id?: string | null;
  created_at: string;
  updated_at: string;
};

export async function getCard(id: string): Promise<CardRow | null> {
  const r = await fetch(
    `${URL_BASE}/api/database/records/cards?id=eq.${encodeURIComponent(id)}&org_id=eq.${ORG_ID}&limit=1`,
    { headers: { 'x-api-key': KEY }, cache: 'no-store' },
  );
  if (!r.ok) return null;
  const rows = (await r.json()) as CardRow[];
  return rows[0] ?? null;
}

export async function patchCard(id: string, patch: Partial<CardRow>): Promise<CardRow | null> {
  const r = await fetch(
    `${URL_BASE}/api/database/records/cards?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'x-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  if (!r.ok) return null;
  // InsForge PATCH returns 204 No Content; re-fetch the row.
  if (r.status === 204) return getCard(id);
  try {
    const rows = await r.json();
    if (Array.isArray(rows)) return (rows[0] ?? null) as CardRow | null;
    return rows as CardRow;
  } catch {
    return getCard(id);
  }
}

export async function writeAudit(row: {
  actor: string;
  action: string;
  target_type: string;
  target_id: string;
  recipient_user?: string | null;
  source_visibility?: string | null;
}): Promise<void> {
  await fetch(`${URL_BASE}/api/database/records/audit_log`, {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      org_id: ORG_ID,
      actor: row.actor,
      action: row.action,
      target_type: row.target_type,
      target_id: row.target_id,
      recipient_user: row.recipient_user ?? null,
      source_visibility: row.source_visibility ?? null,
    }),
  });
}

export type Authz = {
  allowed: boolean;
  override: boolean;
};

export function authorizeApproveReject(
  card: CardRow,
  viewer: { role: string; team: string },
): Authz {
  if (viewer.role === 'architect' || viewer.role === 'org_owner') {
    return { allowed: true, override: true };
  }
  if (viewer.role === 'lead' && card.team_id && card.team_id === viewer.team) {
    return { allowed: true, override: false };
  }
  return { allowed: false, override: false };
}
