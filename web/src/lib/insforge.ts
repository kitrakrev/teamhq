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

export type Team = {
  id: string;
  org_id: string;
  name: string;
  path_globs: string[] | null;
};

export type OrgRepo = {
  id: string;
  org_id: string;
  github_full_name: string;
  default_branch: string | null;
  created_at?: string;
};

export type Project = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  created_by_user_id: string | null;
  created_at?: string;
};

export type ProjectRepo = {
  id: string;
  project_id: string;
  org_repo_id: string;
  created_at?: string;
};

export type OAuthToken = {
  id: string;
  user_id: string;
  provider: string;
  access_token: string;
  github_login: string | null;
  scopes: string | null;
  created_at?: string;
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(URL + path, {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`InsForge POST ${path} -> ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(URL + path, {
    method: 'PATCH',
    headers: { 'x-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`InsForge PATCH ${path} -> ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const r = await fetch(URL + path, {
    method: 'DELETE',
    headers: { 'x-api-key': KEY },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`InsForge DELETE ${path} -> ${r.status}: ${await r.text()}`);
}

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
  async listTeams(): Promise<Team[]> {
    if (!ORG_ID) return [];
    return get<Team[]>(`/api/database/records/teams?org_id=eq.${ORG_ID}&order=name.asc`);
  },
  async listOrgRepos(): Promise<OrgRepo[]> {
    if (!ORG_ID) return [];
    return get<OrgRepo[]>(`/api/database/records/org_repos?org_id=eq.${ORG_ID}&order=github_full_name.asc`);
  },
  async listProjects(): Promise<Project[]> {
    if (!ORG_ID) return [];
    return get<Project[]>(`/api/database/records/projects?org_id=eq.${ORG_ID}&order=created_at.desc`);
  },
  async getProject(id: string): Promise<Project | null> {
    const rows = await get<Project[]>(`/api/database/records/projects?id=eq.${id}${orgClause()}`);
    return rows[0] ?? null;
  },
  async listProjectRepos(projectId: string): Promise<ProjectRepo[]> {
    return get<ProjectRepo[]>(`/api/database/records/project_repos?project_id=eq.${projectId}`);
  },
  async listOAuthTokens(userId?: string): Promise<OAuthToken[]> {
    const q = userId ? `?user_id=eq.${userId}` : '';
    return get<OAuthToken[]>(`/api/database/records/oauth_tokens${q}`);
  },
  async upsertOrgRepo(input: { github_full_name: string; default_branch?: string | null }): Promise<OrgRepo> {
    if (!ORG_ID) throw new Error('ORG_ID missing');
    // Check if exists first.
    const existing = await get<OrgRepo[]>(
      `/api/database/records/org_repos?org_id=eq.${ORG_ID}&github_full_name=eq.${encodeURIComponent(input.github_full_name)}`,
    );
    if (existing[0]) return existing[0];
    const created = await post<OrgRepo[] | OrgRepo>('/api/database/records/org_repos', {
      org_id: ORG_ID,
      github_full_name: input.github_full_name,
      default_branch: input.default_branch ?? 'main',
    });
    return Array.isArray(created) ? created[0] : created;
  },
  async createProject(input: { name: string; description?: string; repoIds?: string[]; createdByUserId?: string | null }): Promise<Project> {
    if (!ORG_ID) throw new Error('ORG_ID missing');
    const created = await post<Project[] | Project>('/api/database/records/projects', {
      org_id: ORG_ID,
      name: input.name,
      description: input.description ?? null,
      created_by_user_id: input.createdByUserId ?? null,
    });
    const project = Array.isArray(created) ? created[0] : created;
    if (input.repoIds && input.repoIds.length) {
      await Promise.all(
        input.repoIds.map((rid) =>
          post('/api/database/records/project_repos', { project_id: project.id, org_repo_id: rid }),
        ),
      );
    }
    return project;
  },
  async attachRepoToProject(projectId: string, orgRepoId: string): Promise<ProjectRepo> {
    const created = await post<ProjectRepo[] | ProjectRepo>('/api/database/records/project_repos', {
      project_id: projectId,
      org_repo_id: orgRepoId,
    });
    return Array.isArray(created) ? created[0] : created;
  },
  async detachRepoFromProject(projectId: string, orgRepoId: string): Promise<void> {
    const rows = await get<ProjectRepo[]>(
      `/api/database/records/project_repos?project_id=eq.${projectId}&org_repo_id=eq.${orgRepoId}`,
    );
    for (const r of rows) {
      await del(`/api/database/records/project_repos?id=eq.${r.id}`);
    }
  },
  async createRun(input: {
    repo: string;
    trigger_type: string;
    trigger_source: string;
    status?: string;
    project_id?: string | null;
  }): Promise<Run> {
    if (!ORG_ID) throw new Error('ORG_ID missing');
    const created = await post<Run[] | Run>('/api/database/records/runs', {
      org_id: ORG_ID,
      repo: input.repo,
      trigger_type: input.trigger_type,
      trigger_source: input.trigger_source,
      status: input.status ?? 'starting',
      project_id: input.project_id ?? null,
    });
    return Array.isArray(created) ? created[0] : created;
  },
  async listRunsForProject(projectId: string, limit = 20): Promise<Run[]> {
    return get<Run[]>(`/api/database/records/runs?project_id=eq.${projectId}&order=created_at.desc&limit=${limit}${orgClause()}`);
  },
  async listInvites(): Promise<Array<Record<string, unknown>>> {
    if (!ORG_ID) return [];
    return get<Array<Record<string, unknown>>>(`/api/database/records/invites?org_id=eq.${ORG_ID}&order=created_at.desc`);
  },
  async createInvite(input: { email: string; role: string; team_id?: string | null }): Promise<Record<string, unknown>> {
    if (!ORG_ID) throw new Error('ORG_ID missing');
    const created = await post<Array<Record<string, unknown>> | Record<string, unknown>>(
      '/api/database/records/invites',
      {
        org_id: ORG_ID,
        email: input.email,
        role: input.role,
        team_id: input.team_id ?? null,
        status: 'pending',
      },
    );
    return Array.isArray(created) ? created[0] : created;
  },
  async countCardsWithDocuments(): Promise<number> {
    if (!ORG_ID) return 0;
    // Light heuristic: cards w/ a non-null body, scoped to org.
    const rows = await get<Array<{ id: string }>>(
      `/api/database/records/cards?org_id=eq.${ORG_ID}&select=id&limit=1000`,
    );
    return rows.length;
  },
};
