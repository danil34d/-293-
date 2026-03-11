import { getWallboardSnapshot } from '@/lib/wallboard';

import { WallboardClient } from './WallboardClient';

export const dynamic = 'force-dynamic';

export default async function WallboardPage() {
  const snapshot = await getWallboardSnapshot();

  return <WallboardClient initialSnapshot={snapshot} />;
}
