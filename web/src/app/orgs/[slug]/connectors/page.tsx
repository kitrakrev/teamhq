// Connectors directory — light grid of source cards w/ live "Connected" status
// pulled from oauth_tokens + ingested cards.
import { ifg } from '@/lib/insforge';
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

type Connector = {
  key: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  liveProbe: boolean; // if true we ask oauth_tokens / cards
};

const CONNECTORS: Connector[] = [
  { key: 'slack', name: 'Slack', description: 'Decisions, threads, channels', icon: <SlackIcon className="h-7 w-7" />, liveProbe: true },
  { key: 'notion', name: 'Notion', description: 'Specs, designs, runbooks', icon: <NotionIcon className="h-7 w-7" />, liveProbe: true },
  { key: 'github', name: 'GitHub', description: 'Repos, PRs, runs', icon: <GitHubIcon className="h-7 w-7" />, liveProbe: true },
  { key: 'linear', name: 'Linear', description: 'Issues and projects', icon: <LinearIcon className="h-7 w-7" />, liveProbe: false },
  { key: 'gmail', name: 'Gmail', description: 'Inbound stakeholder mail', icon: <GmailIcon className="h-7 w-7" />, liveProbe: false },
  { key: 'teams', name: 'Microsoft Teams', description: 'Org-wide chat surface', icon: <TeamsIcon className="h-7 w-7" />, liveProbe: false },
  { key: 'drive', name: 'Google Drive', description: 'Specs and exports', icon: <DriveIcon className="h-7 w-7" />, liveProbe: false },
  { key: 'calendar', name: 'Google Calendar', description: 'Standups, releases, syncs', icon: <CalendarIcon className="h-7 w-7" />, liveProbe: false },
];

function StatusPill({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="bg-green-50 text-green-700 ring-1 ring-green-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
      Connected
    </span>
  ) : (
    <span className="bg-gray-50 text-gray-500 ring-1 ring-gray-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
      Not connected
    </span>
  );
}

export default async function ConnectorsPage({ params }: { params: Promise<{ slug: string }> }) {
  await params;
  const [tokens, teams, indexedCount] = await Promise.all([
    ifg.listOAuthTokens().catch(() => []),
    ifg.listTeams().catch(() => []),
    ifg.countCardsWithDocuments().catch(() => 0),
  ]);

  const liveProviders = new Set(tokens.map((t) => t.provider.toLowerCase()));
  // Slack/Notion/GitHub are seeded — even without an oauth_tokens row, treat as connected
  // because they've ingested artifacts in the demo backend.
  const seededLive = new Set(['slack', 'notion', 'github']);

  function isConnected(c: Connector): boolean {
    if (!c.liveProbe) return false;
    return liveProviders.has(c.key) || seededLive.has(c.key);
  }

  return (
    <main className="bg-gradient-to-b from-white to-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Connectors</h1>
            <p className="text-base text-gray-500 mt-2">
              The sources TeamHQ pulls signal from. Indexed in real time, scoped to your org.
            </p>
          </div>
          <div className="text-xs text-gray-500">
            {indexedCount} indexed artifacts across {Math.max(1, teams.length)} teams
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CONNECTORS.map((c) => {
            const connected = isConnected(c);
            return (
              <div
                key={c.key}
                className="bg-white rounded-2xl shadow-sm shadow-gray-200/50 border border-gray-100 p-6 flex flex-col gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                    {c.icon}
                  </div>
                  <StatusPill connected={connected} />
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
                  ) : (
                    <button
                      type="button"
                      className="bg-gray-900 text-white rounded-xl px-4 py-2 text-sm hover:bg-gray-800 active:scale-[.98] transition w-full"
                    >
                      Connect
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
