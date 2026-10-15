import { reviewItems } from '@tableau-clair/domain';
import { useMemo } from 'react';
import { usePlan } from '../home/queries';

/** Nombre de liaisons à confirmer (supposées + équipements sans disjoncteur), pour le badge. */
export function useReviewCount(propertyId: string | undefined): number {
  const plan = usePlan(propertyId);
  return useMemo(() => {
    if (!plan.data) return 0;
    const fixtures = plan.data.floors.flatMap((f) => f.fixtures);
    const links = fixtures.flatMap((f) => (f.link ? [{ fixtureId: f.id, ...f.link }] : []));
    const items = reviewItems(
      fixtures.map((f) => f.id),
      plan.data.breakers.map((b) => b.id),
      links,
    );
    return items.assumed.length + items.unlinkedFixtures.length;
  }, [plan.data]);
}
