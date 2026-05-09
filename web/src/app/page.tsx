import { ifg } from '@/lib/insforge';
import { Feed } from '@/components/Feed';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const runs = await ifg.listRuns(20);
  const initialRunId = runs[0]?.id ?? null;
  const cards = initialRunId ? await ifg.listCards(initialRunId) : [];
  return <Feed initialRuns={runs} initialCards={cards} initialRunId={initialRunId} />;
}
