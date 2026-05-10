import { ifg } from '@/lib/insforge';
import { Feed } from '@/components/Feed';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

type SP = Promise<{ run?: string }>;

export default async function Home({ searchParams }: { searchParams: SP }) {
  const session = await getSession();
  const orgId = session?.orgId ?? null;
  const sp = await searchParams;
  const runs = await ifg.listRuns(orgId, 20);
  // Honor ?run=<id> deep-links so slide live-links can point at the exact
  // run captured in each screenshot.
  const requested = sp.run && runs.find((r) => r.id === sp.run) ? sp.run : null;
  const initialRunId = requested ?? runs[0]?.id ?? null;
  const cards = initialRunId ? await ifg.listCards(orgId, initialRunId) : [];
  return <Feed initialRuns={runs} initialCards={cards} initialRunId={initialRunId} />;
}
