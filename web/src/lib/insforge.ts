// Server-side InsForge wrapper. Never imported by client components — the
// access key is server-only. We resolve env at call time (not module load)
// so Next.js build/static-analysis doesn't crash if the var isn't set yet.
function URL(): string {
  const v = process.env.INSFORGE_PROJECT_URL;
  if (!v) throw new Error('INSFORGE_PROJECT_URL missing');
  return v;
}
function KEY(): string {
  const v = process.env.INSFORGE_ACCESS_API_KEY;
  if (!v) throw new Error('INSFORGE_ACCESS_API_KEY missing');
  return v;
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
  const r = await fetch(URL() + path, {
    headers: { 'x-api-key': KEY() },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`InsForge ${path} -> ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

// Multi-tenant: every read takes the active org from the SESSION, not env.
// Callers must obtain orgId via getSession() (lib/session.ts) and pass it in.
// The hardcoded ORG_ID env is deliberately removed — it leaked Acme Eng's
// data to fresh tenants.
function orgClause(orgId: string | null | undefined): string {
  return orgId ? `&org_id=eq.${orgId}` : '';
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
  const r = await fetch(URL() + path, {
    method: 'POST',
    headers: {
      'x-api-key': KEY(),
      'content-type': 'application/json',
      // InsForge follows PostgREST conventions — without this, POSTs return [].
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`InsForge POST ${path} -> ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(URL() + path, {
    method: 'PATCH',
    headers: { 'x-api-key': KEY(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`InsForge PATCH ${path} -> ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const r = await fetch(URL() + path, {
    method: 'DELETE',
    headers: { 'x-api-key': KEY() },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`InsForge DELETE ${path} -> ${r.status}: ${await r.text()}`);
}

/**
 * NEW SHAPE: every method that touches tenant-scoped data takes `orgId`.
 * If orgId is null, methods return empty (reads) or throw (writes).
 * Callers obtain orgId via getSession() so the active tenant is per-request.
 */
export const ifg = {
  async listRuns(orgId: string | null, limit = 20): Promise<Run[]> {
    if (!orgId) return [];
    return get<Run[]>(`/api/database/records/runs?order=created_at.desc&limit=${limit}${orgClause(orgId)}`);
  },
  async getRun(orgId: string | null, id: string): Promise<Run | null> {
    if (!orgId) return null;
    const rows = await get<Run[]>(`/api/database/records/runs?id=eq.${id}${orgClause(orgId)}`);
    return rows[0] ?? null;
  },
  async listCards(orgId: string | null, runId: string): Promise<Card[]> {
    if (!orgId) return [];
    return get<Card[]>(`/api/database/records/cards?run_id=eq.${runId}&order=created_at.asc${orgClause(orgId)}`);
  },
  async listUsers(orgId: string | null): Promise<User[]> {
    if (!orgId) return [];
    return get<User[]>(`/api/database/records/users?order=created_at.asc${orgClause(orgId)}`);
  },
  async getOrg(orgId: string | null): Promise<Org | null> {
    if (!orgId) return null;
    const rows = await get<Org[]>(`/api/database/records/orgs?id=eq.${orgId}`);
    return rows[0] ?? null;
  },
  async listOrgMembers(orgId: string | null): Promise<OrgMember[]> {
    if (!orgId) return [];
    return get<OrgMember[]>(`/api/database/records/org_members?org_id=eq.${orgId}`);
  },
  async listTeams(orgId: string | null): Promise<Team[]> {
    if (!orgId) return [];
    return get<Team[]>(`/api/database/records/teams?org_id=eq.${orgId}&order=name.asc`);
  },
  async listOrgRepos(orgId: string | null): Promise<OrgRepo[]> {
    if (!orgId) return [];
    return get<OrgRepo[]>(`/api/database/records/org_repos?org_id=eq.${orgId}&order=github_full_name.asc`);
  },
  async listProjects(orgId: string | null): Promise<Project[]> {
    if (!orgId) return [];
    return get<Project[]>(`/api/database/records/projects?org_id=eq.${orgId}&order=created_at.desc`);
  },
  async getProject(orgId: string | null, id: string): Promise<Project | null> {
    if (!orgId) return null;
    const rows = await get<Project[]>(`/api/database/records/projects?id=eq.${id}${orgClause(orgId)}`);
    return rows[0] ?? null;
  },
  async listProjectRepos(projectId: string): Promise<ProjectRepo[]> {
    return get<ProjectRepo[]>(`/api/database/records/project_repos?project_id=eq.${projectId}`);
  },
  async listOAuthTokens(userId?: string): Promise<OAuthToken[]> {
    const q = userId ? `?user_id=eq.${userId}` : '';
    return get<OAuthToken[]>(`/api/database/records/oauth_tokens${q}`);
  },
  async recordOAuthToken(input: {
    user_id: string;
    provider: string;
    access_token: string;
    github_login?: string | null;
    scopes?: string | null;
  }): Promise<OAuthToken> {
    // Upsert by (user_id, provider) — overwrite token + scopes if user
    // re-auths with broader scopes.
    const existing = await get<OAuthToken[]>(
      `/api/database/records/oauth_tokens?user_id=eq.${input.user_id}&provider=eq.${encodeURIComponent(input.provider)}`,
    );
    if (existing[0]) {
      const patched = await patch<OAuthToken[] | OAuthToken>(
        `/api/database/records/oauth_tokens?id=eq.${existing[0].id}`,
        {
          access_token: input.access_token,
          github_login: input.github_login ?? existing[0].github_login,
          scopes: input.scopes ?? existing[0].scopes,
        },
      );
      return Array.isArray(patched) ? patched[0] : patched;
    }
    const created = await post<OAuthToken[] | OAuthToken>('/api/database/records/oauth_tokens', {
      user_id: input.user_id,
      provider: input.provider,
      access_token: input.access_token,
      github_login: input.github_login ?? null,
      scopes: input.scopes ?? null,
    });
    return Array.isArray(created) ? created[0] : created;
  },
  async upsertOrgRepo(orgId: string, input: { github_full_name: string; default_branch?: string | null }): Promise<OrgRepo> {
    if (!orgId) throw new Error('orgId missing');
    const existing = await get<OrgRepo[]>(
      `/api/database/records/org_repos?org_id=eq.${orgId}&github_full_name=eq.${encodeURIComponent(input.github_full_name)}`,
    );
    if (existing[0]) return existing[0];
    const created = await post<OrgRepo[] | OrgRepo>('/api/database/records/org_repos', {
      org_id: orgId,
      github_full_name: input.github_full_name,
      default_branch: input.default_branch ?? 'main',
    });
    return Array.isArray(created) ? created[0] : created;
  },
  async createProject(orgId: string, input: { name: string; description?: string; repoIds?: string[]; createdByUserId?: string | null }): Promise<Project> {
    if (!orgId) throw new Error('orgId missing');
    const created = await post<Project[] | Project>('/api/database/records/projects', {
      org_id: orgId,
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
  async createRun(orgId: string, input: {
    repo: string;
    trigger_type: string;
    trigger_source: string;
    status?: string;
    project_id?: string | null;
  }): Promise<Run> {
    if (!orgId) throw new Error('orgId missing');
    const created = await post<Run[] | Run>('/api/database/records/runs', {
      org_id: orgId,
      repo: input.repo,
      trigger_type: input.trigger_type,
      trigger_source: input.trigger_source,
      status: input.status ?? 'starting',
      project_id: input.project_id ?? null,
    });
    return Array.isArray(created) ? created[0] : created;
  },
  async listRunsForProject(orgId: string | null, projectId: string, limit = 20): Promise<Run[]> {
    if (!orgId) return [];
    return get<Run[]>(`/api/database/records/runs?project_id=eq.${projectId}&order=created_at.desc&limit=${limit}${orgClause(orgId)}`);
  },
  async listInvites(orgId: string | null): Promise<Array<Record<string, unknown>>> {
    if (!orgId) return [];
    return get<Array<Record<string, unknown>>>(`/api/database/records/invites?org_id=eq.${orgId}&order=created_at.desc`);
  },
  async createInvite(orgId: string, input: { email: string; role: string; team_id?: string | null }): Promise<Record<string, unknown>> {
    if (!orgId) throw new Error('orgId missing');
    const created = await post<Array<Record<string, unknown>> | Record<string, unknown>>(
      '/api/database/records/invites',
      {
        org_id: orgId,
        email: input.email,
        role: input.role,
        team_id: input.team_id ?? null,
        status: 'pending',
      },
    );
    return Array.isArray(created) ? created[0] : created;
  },
  async countCardsWithDocuments(orgId: string | null): Promise<number> {
    if (!orgId) return 0;
    const rows = await get<Array<{ id: string }>>(
      `/api/database/records/cards?org_id=eq.${orgId}&select=id&limit=1000`,
    );
    return rows.length;
  },
  /** Create a fresh org for a brand-new user (post-signup, no existing membership). */
  async provisionOrg(input: { name: string; slug: string; ownerUserId: string }): Promise<Org> {
    const created = await post<Org[] | Org>('/api/database/records/orgs', {
      name: input.name,
      slug: input.slug,
      owner_user_id: input.ownerUserId,
    });
    const org = Array.isArray(created) ? created[0] : created;
    // Add owner membership.
    await post('/api/database/records/org_members', {
      org_id: org.id,
      user_id: input.ownerUserId,
      role: 'org_owner',
      team_id: null,
    });
    return org;
  },
};
