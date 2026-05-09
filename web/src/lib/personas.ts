// Mirror of agent/personas.py — single source of truth for demo personas.
// Keep these in sync manually; both languages need it.
export type Persona = {
  key: 'sarah' | 'iris' | 'alice' | 'grace' | 'dan' | 'frank';
  name: string;
  initials: string;          // editorial — used as the avatar mark
  email: string;
  role: 'lead' | 'architect' | 'pm';
  team: 'backend' | 'ds' | 'ui' | 'devops' | '*';
  github_login: string;
  /** Tailwind text/border accent for the persona's team */
  accent: string;            // e.g. 'text-team-backend'
  /** Hex from the global ink palette (for inline style) */
  ink: string;
};

export const PERSONAS: Persona[] = [
  { key: 'sarah', name: 'Sarah Chen',   initials: 'SC', email: 'sarah@teamhq.demo', role: 'lead',      team: 'backend', github_login: 'kitrakrev',           accent: 'text-[var(--team-backend)]', ink: 'var(--team-backend)' },
  { key: 'iris',  name: 'Iris Patel',   initials: 'IP', email: 'iris@teamhq.demo',  role: 'lead',      team: 'ds',      github_login: 'kart-001',            accent: 'text-[var(--team-ds)]',      ink: 'var(--team-ds)' },
  { key: 'alice', name: 'Alice Rivera', initials: 'AR', email: 'alice@teamhq.demo', role: 'lead',      team: 'ui',      github_login: 'Ash-ketchum-pikachu', accent: 'text-[var(--team-ui)]',      ink: 'var(--team-ui)' },
  { key: 'grace', name: 'Grace Liu',    initials: 'GL', email: 'grace@teamhq.demo', role: 'lead',      team: 'devops',  github_login: 'kitrakrev',           accent: 'text-[var(--team-devops)]',  ink: 'var(--team-devops)' },
  { key: 'dan',   name: 'Dan Park',     initials: 'DP', email: 'dan@teamhq.demo',   role: 'architect', team: '*',       github_login: 'kitrakrev',           accent: 'text-[var(--team-arch)]',    ink: 'var(--team-arch)' },
  { key: 'frank', name: 'Frank Lee',    initials: 'FL', email: 'frank@teamhq.demo', role: 'pm',        team: '*',       github_login: 'kitrakrev',           accent: 'text-[var(--team-pm)]',      ink: 'var(--team-pm)' },
];

export const TEAM_LABEL: Record<string, string> = {
  backend: 'Backend',
  ds:      'Data Science',
  ui:      'Frontend',
  devops:  'DevOps',
};

export const TEAM_INK: Record<string, string> = {
  backend: 'var(--team-backend)',
  ds:      'var(--team-ds)',
  ui:      'var(--team-ui)',
  devops:  'var(--team-devops)',
};

export function personaByKey(key: string): Persona | undefined {
  return PERSONAS.find(p => p.key === key);
}

export function leadOfTeam(team: string): Persona | undefined {
  return PERSONAS.find(p => p.team === team && p.role === 'lead');
}

export function roleRank(role: string): number {
  return ({ viewer: 0, member: 1, lead: 2, architect: 3, org_owner: 4, pm: 1 } as Record<string, number>)[role] ?? 0;
}

// Backward-compat exports (referenced elsewhere if any)
export const TEAM_COLOR = TEAM_INK;
