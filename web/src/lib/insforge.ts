// Server-side InsForge wrapper. Never imported by client components — the
// access key is server-only.
const URL = process.env.INSFORGE_PROJECT_URL!;
const KEY = process.env.INSFORGE_ACCESS_API_KEY!;

if (!URL || !KEY) {
  throw new Error('INSFORGE_PROJECT_URL or INSFORGE_ACCESS_API_KEY missing');
}

export type Card = {
  id: string;
  run_id: string | null;
  card_type: string;
  team_id: string | null;
  title: string | null;
  body: Record<string, unknown> | null;
  visibility: Record<string, unknown> | null;
  status: string | null;
  created_at: string;
  updated_at: string;
};

export type Run = {
  id: string;
  repo: string;
  trigger_type: string;
  trigger_source: string | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  pr_url: string | null;
  created_at: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  team: string;
  github_login: string | null;
};

async function get<T>(path: string): Promise<T> {
  const r = await fetch(URL + path, {
    headers: { 'x-api-key': KEY },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`InsForge ${path} -> ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

// Demo currently runs single-tenant under one org. Multi-tenant is enforced
// at the data layer — every read scopes by org_id. The active org is set at
// the server boundary; clients never pick a tenant freely.
const ORG_ID = process.env.ORG_ID;

function orgClause(): string {
  return ORG_ID ? `&org_id=eq.${ORG_ID}` : '';
}

export type Org = {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string | null;
};

export type OrgMember = {
  id: string;
  org_id: string;
  user_id: string;
  role: string;
  team_id: string | null;
};

export const ifg = {
  async listRuns(limit = 20): Promise<Run[]> {
    return get<Run[]>(`/api/database/records/runs?order=created_at.desc&limit=${limit}${orgClause()}`);
  },
  async getRun(id: string): Promise<Run | null> {
    const rows = await get<Run[]>(`/api/database/records/runs?id=eq.${id}${orgClause()}`);
    return rows[0] ?? null;
  },
  async listCards(runId: string): Promise<Card[]> {
    return get<Card[]>(`/api/database/records/cards?run_id=eq.${runId}&order=created_at.asc${orgClause()}`);
  },
  async listUsers(): Promise<User[]> {
    return get<User[]>(`/api/database/records/users?order=created_at.asc${orgClause()}`);
  },
  async getOrg(): Promise<Org | null> {
    if (!ORG_ID) return null;
    const rows = await get<Org[]>(`/api/database/records/orgs?id=eq.${ORG_ID}`);
    return rows[0] ?? null;
  },
  async listOrgMembers(): Promise<OrgMember[]> {
    if (!ORG_ID) return [];
    return get<OrgMember[]>(`/api/database/records/org_members?org_id=eq.${ORG_ID}`);
  },
};
