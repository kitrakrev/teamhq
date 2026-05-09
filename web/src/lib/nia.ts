// Server-only Nia REST wrapper. Used to index public sources (GitHub repos,
// docs URLs, research papers) and expose them as world context to the agent.
//
// Verified endpoints (no /v1 prefix):
//   GET  /repositories                    list indexed repos
//   POST /repositories                    body: {repository, branch?}
//   GET  /sources                         list indexed docs/papers
//   POST /sources                         body: {url, source_type?, name?}
//   POST /search                          body: {mode, messages}
const NIA_BASE = 'https://api.trynia.ai';

function key(): string {
  const v = process.env.NIA_API_KEY;
  if (!v) throw new Error('NIA_API_KEY missing');
  return v;
}

export type NiaRepo = {
  repository_id: string;
  id: string;
  repository: string;
  branch: string;
  status: string; // 'indexed' | 'indexing' | 'failed'
  display_name: string | null;
  is_global: boolean | null;
  progress: number | null;
  error: string | null;
};

export type NiaSource = {
  id: string;
  name: string;
  url?: string;
  source_type?: string;
  status?: string;
};

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${NIA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key()}` },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`Nia GET ${path} -> ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${NIA_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Nia POST ${path} -> ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

export const nia = {
  async listRepos(): Promise<NiaRepo[]> {
    return get<NiaRepo[]>('/repositories');
  },
  async indexRepo(input: { repository: string; branch?: string }): Promise<NiaRepo> {
    const data = await post<NiaRepo & { project_id?: string }>('/repositories', {
      repository: input.repository,
      branch: input.branch ?? 'main',
    });
    return data;
  },
  async listSources(): Promise<NiaSource[]> {
    const r = await get<{ items?: NiaSource[] }>('/sources');
    return r.items ?? [];
  },
  /**
   * Send a chat-style query. Mode `query` searches indexed sources; `web`,
   * `universal`, `deep` are externalized to Nia's MCP layer in the current
   * release ("wave 1") — for those, we fall back to an empty result.
   */
  async ask(query: string, sourceIds: string[] = []): Promise<{ answer: string | null; documents: Array<{ title?: string; url?: string }> }> {
    if (sourceIds.length === 0) {
      return { answer: null, documents: [] };
    }
    try {
      const data = await post<{ answer?: string; documents?: Array<{ title?: string; url?: string }> }>(
        '/search',
        {
          mode: 'query',
          sources: sourceIds,
          messages: [{ role: 'user', content: query }],
        },
      );
      return {
        answer: data.answer ?? null,
        documents: data.documents ?? [],
      };
    } catch {
      return { answer: null, documents: [] };
    }
  },
};
