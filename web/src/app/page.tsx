import { ifg } from '@/lib/insforge';
import { Feed } from '@/components/Feed';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await getSession();
  const orgId = session?.orgId ?? null;
  const runs = await ifg.listRuns(orgId, 20);
  const initialRunId = runs[0]?.id ?? null;
  const cards = initialRunId ? await ifg.listCards(orgId, initialRunId) : [];
  return <Feed initialRuns={runs} initialCards={cards} initialRunId={initialRunId} />;
}
