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

export const ifg = {
  async listRuns(limit = 20): Promise<Run[]> {
    return get<Run[]>(`/api/database/records/runs?order=created_at.desc&limit=${limit}`);
  },
  async getRun(id: string): Promise<Run | null> {
    const rows = await get<Run[]>(`/api/database/records/runs?id=eq.${id}`);
    return rows[0] ?? null;
  },
  async listCards(runId: string): Promise<Card[]> {
    return get<Card[]>(`/api/database/records/cards?run_id=eq.${runId}&order=created_at.asc`);
  },
  async listUsers(): Promise<User[]> {
    return get<User[]>(`/api/database/records/users?order=created_at.asc`);
  },
};
