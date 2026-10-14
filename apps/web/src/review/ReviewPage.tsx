import type { Fixture, PlanBreaker } from '@tableau-clair/contracts';
import { reviewItems } from '@tableau-clair/domain';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { plural } from '../home/format';
import { usePlan, useProperties, useSelectedProperty } from '../home/queries';
import { BreakerPickerSheet } from '../link/BreakerPickerSheet';
import { JustCutSheet } from '../link/CircuitSection';
import { breakerName, placeOf } from '../link/place';
import { useLinkMutations } from '../link/useLinkMutations';
import { Button, StatusChip, TypeChip } from '../ui';
import styles from './review.module.css';

type Filter = 'all' | 'assumed' | 'unlinked';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'assumed', label: 'Supposées' },
  { value: 'unlinked', label: 'Sans lien' },
];

interface Located {
  fixture: Fixture;
  where: string;
}

/** `/verifier` : ce qu'il reste à confirmer ou à identifier, avec les actions rapides. */
export function ReviewPage() {
  const properties = useProperties();
  const [property] = useSelectedProperty(properties.data);
  const plan = usePlan(property?.id);
  const { link, busy } = useLinkMutations(property?.id ?? '');
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [choosing, setChoosing] = useState<string | null>(null);
  const [cutting, setCutting] = useState<PlanBreaker | null>(null);
  const canEdit = property?.role !== 'viewer';

  const data = useMemo(() => {
    const floors = plan.data?.floors ?? [];
    const breakers = plan.data?.breakers ?? [];
    const fixtures: Located[] = floors.flatMap((floor) =>
      floor.fixtures.map((fixture) => ({
        fixture,
        where: `${floor.name} · ${floor.rooms.find((r) => r.id === fixture.roomId)?.name ?? ''}`,
      })),
    );
    const links = fixtures.flatMap(({ fixture }) =>
      fixture.link ? [{ fixtureId: fixture.id, ...fixture.link }] : [],
    );
    const items = reviewItems(
      fixtures.map((f) => f.fixture.id),
      breakers.map((b) => b.id),
      links,
    );
    const byId = new Map(fixtures.map((f) => [f.fixture.id, f]));
    return {
      breakers,
      fixtures,
      assumed: items.assumed.flatMap((id) => byId.get(id) ?? []),
      unlinked: items.unlinkedFixtures.flatMap((id) => byId.get(id) ?? []),
      idle: breakers.filter((b) => items.idleBreakers.includes(b.id)),
    };
  }, [plan.data]);

  if (properties.isPending || (property && plan.isPending)) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>À vérifier</h1>
        <p role="status" className={styles.empty}>
          Chargement…
        </p>
      </main>
    );
  }
  if (!property || plan.isError) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>À vérifier</h1>
        <p role="alert" className={styles.empty}>
          Impossible de charger les liaisons. Réessayez.
        </p>
      </main>
    );
  }

  const { assumed, unlinked, idle, breakers } = data;
  const toConfirm = assumed.length + unlinked.length;
  const breakerOf = (f: Fixture) => breakers.find((b) => b.id === f.link?.breakerId);
  const showAssumed = filter !== 'unlinked';
  const showUnlinked = filter !== 'assumed';
  const nothing = toConfirm === 0 && idle.length === 0;

  const cutCandidates = cutting
    ? data.fixtures
        .filter((f) => f.fixture.link?.breakerId !== cutting.id)
        .map(({ fixture, where }) => {
          const [floorName = '', roomName = ''] = where.split(' · ');
          return {
            id: fixture.id,
            label: fixture.label,
            kind: fixture.kind,
            status: fixture.link?.status ?? ('unknown' as const),
            roomId: fixture.roomId,
            roomName,
            floorId: floorName,
            floorName,
          };
        })
    : [];

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>À vérifier</h1>

      <section className={styles.banner} aria-label="Bilan">
        <span className={styles.bannerCount}>
          {toConfirm} {plural(toConfirm, 'liaison à confirmer', 'liaisons à confirmer')}
        </span>
        <span className={styles.bannerSub}>
          {assumed.length} {plural(assumed.length, 'supposée', 'supposées')} · {unlinked.length}{' '}
          sans disjoncteur · {idle.length} {plural(idle.length, 'disjoncteur', 'disjoncteurs')} sans
          équipement
        </span>
      </section>

      <div className={styles.filters} role="group" aria-label="Filtrer">
        {FILTERS.map((f) => (
          <TypeChip
            key={f.value}
            label={f.label}
            selected={filter === f.value}
            onClick={() => setFilter(f.value)}
          />
        ))}
      </div>

      {nothing && <p className={styles.empty}>Tout est vérifié : rien à signaler.</p>}

      <ul className={styles.cards} aria-label="Éléments à vérifier">
        {showAssumed &&
          assumed.map(({ fixture, where }) => {
            const breaker = breakerOf(fixture);
            return (
              <li key={`a-${fixture.id}`} className={styles.card}>
                <div className={styles.cardHead}>
                  <div>
                    <p className={styles.name}>{fixture.label}</p>
                    <p className={styles.sub}>
                      {where}
                      {breaker ? ` · ${breakerName(breaker)} (${placeOf(breaker)})` : ''}
                    </p>
                  </div>
                  <StatusChip status="assumed" />
                </div>
                <div className={styles.actions}>
                  {canEdit && breaker && (
                    <Button
                      size="md"
                      icon="check"
                      disabled={busy}
                      onClick={() =>
                        link.mutate({
                          fixtureId: fixture.id,
                          breakerId: breaker.id,
                          status: 'verified',
                        })
                      }
                    >
                      Confirmer
                    </Button>
                  )}
                  <Button
                    size="md"
                    variant="secondary"
                    icon="plan"
                    onClick={() => navigate(`/plan?fixture=${fixture.id}`)}
                  >
                    Voir sur le plan
                  </Button>
                </div>
              </li>
            );
          })}

        {showUnlinked &&
          unlinked.map(({ fixture, where }) => (
            <li key={`u-${fixture.id}`} className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <p className={styles.name}>{fixture.label}</p>
                  <p className={styles.sub}>{where} · aucun disjoncteur</p>
                </div>
                <StatusChip status="unknown" label="À identifier" />
              </div>
              <div className={styles.actions}>
                {canEdit && (
                  <Button size="md" icon="plug" onClick={() => setChoosing(fixture.id)}>
                    Choisir un disjoncteur
                  </Button>
                )}
                <Button
                  size="md"
                  variant="secondary"
                  icon="plan"
                  onClick={() => navigate(`/plan?fixture=${fixture.id}`)}
                >
                  Voir sur le plan
                </Button>
              </div>
            </li>
          ))}

        {showUnlinked &&
          idle.map((breaker) => (
            <li key={`b-${breaker.id}`} className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <p className={styles.name}>{breakerName(breaker)}</p>
                  <p className={styles.sub}>
                    {placeOf(breaker)} · n’alimente aucun équipement connu
                  </p>
                </div>
                <StatusChip status="unknown" label="Sans équipement" />
              </div>
              {canEdit && (
                <div className={styles.actions}>
                  <Button size="md" icon="bolt" onClick={() => setCutting(breaker)}>
                    Je viens de le couper
                  </Button>
                </div>
              )}
            </li>
          ))}
      </ul>

      <BreakerPickerSheet
        open={choosing !== null}
        breakers={breakers}
        currentId={null}
        onClose={() => setChoosing(null)}
        onPick={(breakerId) => {
          const fixtureId = choosing;
          setChoosing(null);
          if (fixtureId) link.mutate({ fixtureId, breakerId, status: 'assumed' });
        }}
      />

      {cutting && (
        <JustCutSheet
          propertyId={property.id}
          breakerId={cutting.id}
          fixtures={cutCandidates}
          onClose={() => setCutting(null)}
        />
      )}
    </main>
  );
}
