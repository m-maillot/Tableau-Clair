import type { BreakerCircuit, Fixture } from '@tableau-clair/contracts';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { lastModifiedLabel, plural } from '../home/format';
import { useBreakerCircuit, usePlan } from '../home/queries';
import { BottomSheet, Button, Icon, StatusChip } from '../ui';
import { FIXTURE_KIND_LABEL } from '../plan/fixture-kinds';
import styles from './link.module.css';
import { useLinkMutations } from './useLinkMutations';

interface CircuitSectionProps {
  elementId: string;
  propertyId: string;
  canEdit: boolean;
}

/** Équipements d'un étage puis d'une pièce, dans l'ordre du plan. */
function groupByFloor(fixtures: BreakerCircuit['fixtures']) {
  const floors = new Map<string, { name: string; rooms: Map<string, typeof fixtures> }>();
  for (const f of fixtures) {
    const floor = floors.get(f.floorId) ?? { name: f.floorName, rooms: new Map() };
    floor.rooms.set(f.roomId, [...(floor.rooms.get(f.roomId) ?? []), f]);
    floors.set(f.floorId, floor);
  }
  return [...floors.entries()];
}

/**
 * Circuit d'un disjoncteur dans sa fiche : ce qu'il alimente, par étage et par pièce, avec le
 * statut de chaque liaison. Le choix d'un équipement à relier se fait dans une feuille à part.
 */
export function CircuitSection({ elementId, propertyId, canEdit }: CircuitSectionProps) {
  const circuit = useBreakerCircuit(elementId);
  const { unlink, busy } = useLinkMutations(propertyId);
  const [picking, setPicking] = useState(false);
  const [cutting, setCutting] = useState(false);

  if (circuit.isPending) return <p className={styles.empty}>Chargement du circuit…</p>;
  if (circuit.isError || !circuit.data) {
    return (
      <p className={styles.empty} role="alert">
        Impossible de charger le circuit.
      </p>
    );
  }

  const { fixtures, lastModified } = circuit.data;
  const modified = lastModifiedLabel(lastModified);

  return (
    <section className={styles.section} aria-label="Circuit alimenté">
      <div className={styles.sectionHead}>
        <h3 className={styles.heading}>
          {fixtures.length === 0
            ? 'Aucun équipement relié'
            : `${fixtures.length} ${plural(fixtures.length, 'équipement alimenté', 'équipements alimentés')}`}
        </h3>
        {modified && <span className={styles.sub}>{modified}</span>}
      </div>

      {groupByFloor(fixtures).map(([floorId, floor]) => (
        <div key={floorId} className={styles.list}>
          {[...floor.rooms.entries()].map(([roomId, items]) => (
            <div key={roomId} className={styles.list}>
              <p className={styles.group}>
                {floor.name} · {items[0]!.roomName}
              </p>
              {items.map((f) => (
                <div key={f.id} className={styles.fixture}>
                  <span className={styles.fixtureName}>
                    <Link to={`/plan?fixture=${f.id}`}>{f.label}</Link>{' '}
                    <span className={styles.sub}>{FIXTURE_KIND_LABEL[f.kind]}</span>
                  </span>
                  <StatusChip status={f.status} />
                  {canEdit && (
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`Délier ${f.label}`}
                      disabled={busy}
                      onClick={() => unlink.mutate(f.id)}
                    >
                      <Icon name="close" size={18} strokeWidth={2.4} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      {unlink.isError && (
        <p className={styles.empty} role="alert">
          La liaison n’a pas pu être retirée. Réessayez.
        </p>
      )}

      <div className={styles.actions}>
        {fixtures.length > 0 && (
          <Link to={`/plan?breaker=${elementId}`} className={styles.pick} style={{ width: 'auto' }}>
            <Icon name="plan" size={18} />
            Voir sur le plan
          </Link>
        )}
        {canEdit && fixtures.length > 0 && (
          <Button size="md" variant="secondary" icon="bolt" onClick={() => setCutting(true)}>
            Je viens de le couper
          </Button>
        )}
        {canEdit && (
          <Button size="md" variant="secondary" icon="plug" onClick={() => setPicking(true)}>
            Lier un équipement
          </Button>
        )}
      </div>

      {cutting && (
        <JustCutSheet
          propertyId={propertyId}
          breakerId={elementId}
          fixtures={fixtures}
          onClose={() => setCutting(false)}
        />
      )}

      {picking && (
        <FixturePickerSheet
          propertyId={propertyId}
          breakerId={elementId}
          onClose={() => setPicking(false)}
        />
      )}
    </section>
  );
}

interface FixturePickerProps {
  propertyId: string;
  breakerId: string;
  onClose: () => void;
}

/** Équipements du logement à relier : d'abord ceux à identifier, puis ceux déjà reliés ailleurs. */
function FixturePickerSheet({ propertyId, breakerId, onClose }: FixturePickerProps) {
  const plan = usePlan(propertyId);
  const { link, busy } = useLinkMutations(propertyId);

  const entries = useMemo(() => {
    const data = plan.data;
    if (!data) return [];
    const breakers = new Map(data.breakers.map((b) => [b.id, b]));
    return data.floors
      .flatMap((floor) =>
        floor.fixtures.map((fixture: Fixture) => ({
          fixture,
          where: `${floor.name} · ${floor.rooms.find((r) => r.id === fixture.roomId)?.name ?? ''}`,
          current: fixture.link?.breakerId ? breakers.get(fixture.link.breakerId) : undefined,
        })),
      )
      .filter((e) => e.fixture.link?.breakerId !== breakerId)
      .sort(
        (a, b) =>
          Number(Boolean(a.fixture.link?.breakerId)) - Number(Boolean(b.fixture.link?.breakerId)),
      );
  }, [plan.data, breakerId]);

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Quel équipement ce disjoncteur alimente-t-il ?"
      description="Un équipement n’a qu’un seul disjoncteur : le relier ici remplace l’ancien lien."
    >
      {plan.isPending ? (
        <p className={styles.empty}>Chargement du plan…</p>
      ) : entries.length === 0 ? (
        <p className={styles.empty}>
          Aucun autre équipement à relier. Ajoutez-en sur le plan du logement.
        </p>
      ) : (
        <ul className={styles.list}>
          {entries.map(({ fixture, where, current }) => (
            <li key={fixture.id}>
              <button
                type="button"
                className={styles.pick}
                disabled={busy}
                onClick={() =>
                  link.mutate(
                    { fixtureId: fixture.id, breakerId, status: 'assumed' },
                    { onSuccess: onClose },
                  )
                }
              >
                <span className={styles.text}>
                  <span className={styles.title}>{fixture.label}</span>
                  <span className={styles.sub}>{where}</span>
                </span>
                <span className={styles.sub}>
                  {current ? `Actuellement : ${current.label}` : 'À identifier'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {link.isError && (
        <p className={styles.empty} role="alert">
          La liaison a échoué. Réessayez.
        </p>
      )}
    </BottomSheet>
  );
}

interface JustCutProps {
  propertyId: string;
  breakerId: string;
  fixtures: BreakerCircuit['fixtures'];
  onClose: () => void;
}

/**
 * « Je viens de le couper : qu'est-ce qui est tombé ? » Les équipements cochés passent à
 * « vérifiée » ; les autres restent inchangés (on ne déduit rien d'un équipement non testé).
 */
function JustCutSheet({ propertyId, breakerId, fixtures, onClose }: JustCutProps) {
  const { link, busy } = useLinkMutations(propertyId);
  const [fell, setFell] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState(false);

  const toggle = (id: string) =>
    setFell((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  async function confirm() {
    setFailed(false);
    try {
      for (const id of fell) {
        await link.mutateAsync({ fixtureId: id, breakerId, status: 'verified' });
      }
      onClose();
    } catch {
      setFailed(true);
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Qu’est-ce qui est tombé ?"
      description="Cochez ce qui n’est plus alimenté : ces liaisons passent à « vérifiée »."
      footer={
        <div className={styles.actions} style={{ flex: 1 }}>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Annuler
          </Button>
          <Button size="lg" fullWidth disabled={busy || fell.size === 0} onClick={confirm}>
            {fell.size === 0
              ? 'Confirmer'
              : `Confirmer ${fell.size} ${plural(fell.size, 'équipement', 'équipements')}`}
          </Button>
        </div>
      }
    >
      <ul className={styles.list}>
        {fixtures.map((f) => (
          <li key={f.id}>
            <label className={styles.fixture}>
              <input
                type="checkbox"
                checked={fell.has(f.id)}
                onChange={() => toggle(f.id)}
                style={{ width: 22, height: 22 }}
              />
              <span className={styles.fixtureName}>
                {f.label}{' '}
                <span className={styles.sub}>
                  {f.roomName} · {f.floorName}
                </span>
              </span>
              <StatusChip status={f.status} />
            </label>
          </li>
        ))}
      </ul>
      {failed && (
        <p className={styles.empty} role="alert">
          Certaines liaisons n’ont pas pu être confirmées. Réessayez.
        </p>
      )}
    </BottomSheet>
  );
}
