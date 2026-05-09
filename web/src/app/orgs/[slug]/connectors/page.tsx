// Connectors directory — light grid of source cards w/ live "Connected"
// status pulled from oauth_tokens and tenant-scoped ingest signals.
//
// IMPORTANT: connection state is per-tenant (per orgId). New tenants must NOT
// inherit the demo Acme Eng connections. We probe oauth_tokens scoped to the
// active org's members + count cards w/ documents (the demo backfill writes
// these for the seeded tenant only).
import { ifg } from '@/lib/insforge';
import { getSession } from '@/lib/session';
import {
  GitHubIcon,
  SlackIcon,
  NotionIcon,
  LinearIcon,
  GmailIcon,
  TeamsIcon,
  DriveIcon,
  CalendarIcon,
} from '@/components/onboard/Icons';

export const dynamic = 'force-dynamic';

type ConnectorKey =
  | 'slack' | 'notion' | 'github' | 'linear'
  | 'gmail' | 'teams' | 'drive' | 'calendar';

type Connector = {
  key: ConnectorKey;
  name: string;
  description: string;
  icon: React.ReactNode;
  /** OAuth start URL for this provider (next handler is best-effort wired in V3). */
  startHref: string;
  /** True when InsForge / Hyperspell exposes a real OAuth flow today. */
  available: boolean;
};

const CONNECTORS: Connector[] = [
  { key: 'slack',    name: 'Slack',            description: 'Decisions, threads, channels',     icon: <SlackIcon className="h-7 w-7" />,    startHref: '/api/oauth/slack/start',    available: true },
  { key: 'notion',   name: 'Notion',           description: 'Specs, designs, runbooks',         icon: <NotionIcon className="h-7 w-7" />,   startHref: '/api/oauth/notion/start',   available: true },
  { key: 'github',   name: 'GitHub',           description: 'Repos, PRs, runs',                 icon: <GitHubIcon className="h-7 w-7" />,   startHref: '/api/oauth/github/start',   available: true },
  { key: 'linear',   name: 'Linear',           description: 'Issues and projects',              icon: <LinearIcon className="h-7 w-7" />,   startHref: '/api/oauth/linear/start',   available: false },
  { key: 'gmail',    name: 'Gmail',            description: 'Inbound stakeholder mail',         icon: <GmailIcon className="h-7 w-7" />,    startHref: '/api/oauth/gmail/start',    available: false },
  { key: 'teams',    name: 'Microsoft Teams',  description: 'Org-wide chat surface',            icon: <TeamsIcon className="h-7 w-7" />,    startHref: '/api/oauth/teams/start',    available: false },
  { key: 'drive',    name: 'Google Drive',     description: 'Specs and exports',                icon: <DriveIcon className="h-7 w-7" />,    startHref: '/api/oauth/drive/start',    available: false },
  { key: 'calendar', name: 'Google Calendar',  description: 'Standups, releases, syncs',        icon: <CalendarIcon className="h-7 w-7" />, startHref: '/api/oauth/calendar/start', available: false },
];

function StatusPill({ state }: { state: 'connected' | 'not_connected' | 'unavailable' }) {
  if (state === 'connected') {
    return (
      <span className="bg-green-50 text-green-700 ring-1 ring-green-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
        Connected
      </span>
    );
  }
  if (state === 'unavailable') {
    return (
      <span className="bg-amber-50 text-amber-700 ring-1 ring-amber-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
        Coming soon
      </span>
    );
  }
  return (
    <span className="bg-gray-50 text-gray-500 ring-1 ring-gray-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
      Not connected
    </span>
  );
}

export default async function ConnectorsPage({ params }: { params: Promise<{ slug: string }> }) {
  await params;
  const session = await getSession();
  const orgId = session?.orgId ?? null;

  // Pull oauth_tokens for THIS user only (per-user scope). For org-wide
  // connection state we'd ideally join through org_members; for V2 we treat
  // any connected token belonging to a member of the active org as
  // representing the org's connection.
  const [members, indexedCount, teams] = await Promise.all([
    ifg.listOrgMembers(orgId).catch(() => []),
    ifg.countCardsWithDocuments(orgId).catch(() => 0),
    ifg.listTeams(orgId).catch(() => []),
  ]);
  const memberUserIds = new Set(members.map((m) => m.user_id));

  // Tenant-scoped: a connector is Connected only when an oauth_tokens row
  // belongs to a member of THIS org. Fresh tenants start cold.
  const allTokens = await ifg.listOAuthTokens().catch(() => []);
  const liveProviders = new Set<string>();
  for (const t of allTokens) {
    if (memberUserIds.has(t.user_id)) {
      liveProviders.add(t.provider.toLowerCase());
    }
  }

  // Demo Acme Eng tenant has seeded artifacts in cards (Slack + Notion + GitHub
  // synthesized into Hyperspell). Use indexedCount as a tenant-scoped signal:
  // when this org has indexed artifacts, the seeded sources count as connected.
  const tenantHasSeeded = indexedCount > 0;
  const seededIfTenantBackedFilled: Set<string> = tenantHasSeeded
    ? new Set(['slack', 'notion', 'github'])
    : new Set();

  function stateFor(c: Connector): 'connected' | 'not_connected' | 'unavailable' {
    if (!c.available) return 'unavailable';
    if (liveProviders.has(c.key)) return 'connected';
    if (seededIfTenantBackedFilled.has(c.key)) return 'connected';
    return 'not_connected';
  }

  return (
    <main className="bg-gradient-to-b from-white to-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Connectors</h1>
            <p className="text-base text-gray-500 mt-2">
              {orgId
                ? 'The sources TeamHQ pulls signal from. Indexed in real time, scoped to your org.'
                : 'Sign in to connect sources to your org.'}
            </p>
          </div>
          <div className="text-xs text-gray-500">
            {indexedCount} indexed artifacts across {Math.max(1, teams.length)} teams
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CONNECTORS.map((c) => {
            const state = stateFor(c);
            const connected = state === 'connected';
            return (
              <div
                key={c.key}
                className="bg-white rounded-2xl shadow-sm shadow-gray-200/50 border border-gray-100 p-6 flex flex-col gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                    {c.icon}
                  </div>
                  <StatusPill state={state} />
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">{c.name}</div>
                  <div className="text-sm text-gray-500 mt-0.5">{c.description}</div>
                </div>
                <div className="mt-auto">
                  {connected ? (
                    <button
                      type="button"
                      className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm hover:border-gray-300 transition w-full text-gray-700"
                    >
                      Manage
                    </button>
                  ) : c.available ? (
                    <a
                      href={c.startHref}
                      className="bg-gray-900 text-white rounded-xl px-4 py-2 text-sm hover:bg-gray-800 active:scale-[.98] transition w-full inline-block text-center"
                    >
                      Connect {c.name}
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="bg-gray-100 text-gray-400 rounded-xl px-4 py-2 text-sm w-full cursor-not-allowed"
                    >
                      Coming soon
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
