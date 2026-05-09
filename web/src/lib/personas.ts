// Mirror of agent/personas.py — single source of truth for demo personas.
// Keep these in sync manually; both languages need it.
export type Persona = {
  key: 'sarah' | 'iris' | 'alice' | 'grace' | 'dan' | 'frank';
  name: string;
  email: string;
  role: 'lead' | 'architect' | 'pm';
  team: 'backend' | 'ds' | 'ui' | 'devops' | '*';
  github_login: string;
  emoji: string;
  color: string; // tailwind class for team accent
};

export const PERSONAS: Persona[] = [
  { key: 'sarah', name: 'Sarah Chen',   email: 'sarah@teamhq.demo', role: 'lead',      team: 'backend', github_login: 'kitrakrev',           emoji: '🛠️', color: 'bg-amber-500' },
  { key: 'iris',  name: 'Iris Patel',   email: 'iris@teamhq.demo',  role: 'lead',      team: 'ds',      github_login: 'kart-001',            emoji: '🧪', color: 'bg-emerald-500' },
  { key: 'alice', name: 'Alice Rivera', email: 'alice@teamhq.demo', role: 'lead',      team: 'ui',      github_login: 'Ash-ketchum-pikachu', emoji: '🎨', color: 'bg-sky-500' },
  { key: 'grace', name: 'Grace Liu',    email: 'grace@teamhq.demo', role: 'lead',      team: 'devops',  github_login: 'kitrakrev',           emoji: '🚀', color: 'bg-orange-500' },
  { key: 'dan',   name: 'Dan Park',     email: 'dan@teamhq.demo',   role: 'architect', team: '*',       github_login: 'kitrakrev',           emoji: '🧭', color: 'bg-purple-500' },
  { key: 'frank', name: 'Frank Lee',    email: 'frank@teamhq.demo', role: 'pm',        team: '*',       github_login: 'kitrakrev',           emoji: '💼', color: 'bg-rose-500' },
];

export const TEAM_COLOR: Record<string, string> = {
  backend: 'bg-amber-500',
  ds:      'bg-emerald-500',
  ui:      'bg-sky-500',
  devops:  'bg-orange-500',
};

export const TEAM_LABEL: Record<string, string> = {
  backend: 'Backend',
  ds:      'DS',
  ui:      'UI',
  devops:  'DevOps',
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
