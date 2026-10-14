import type { Element } from '@tableau-clair/contracts';
import { maxWidthAt } from '@tableau-clair/domain';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { lastModifiedLabel, plural } from '../home/format';
import { useBoard } from '../home/queries';
import { BottomSheet, IconButton } from '../ui';
import { ElementSheet } from './ElementSheet';
import styles from './EditorPage.module.css';
import { RailRow, type SlotRef } from './RailRow';

/** `/tableaux/:boardId` : composition du tableau, rangée par rangée. */
export function EditorPage() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const board = useBoard(boardId);
  const [slot, setSlot] = useState<SlotRef | null>(null);

  const data = board.data;
  const elementId = params.get('element');

  const selected = useMemo(() => {
    if (!data || !elementId) return null;
    for (const row of data.rows) {
      const element = row.elements.find((e) => e.id === elementId);
      if (element) return { element, row };
    }
    return null;
  }, [data, elementId]);

  // Arrivée depuis une recherche : le rail se positionne sur l'élément retrouvé.
  const selectedId = selected?.element.id;
  useEffect(() => {
    if (!selectedId) return;
    document
      .querySelector(`[data-element-id="${selectedId}"]`)
      ?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [selectedId]);

  if (board.isPending) {
    return (
      <main className={styles.page}>
        <p role="status" className={styles.status}>
          Chargement…
        </p>
      </main>
    );
  }
  if (board.isError || !data) {
    return (
      <main className={styles.page}>
        <p role="alert" className={styles.status}>
          Ce tableau est introuvable.
        </p>
      </main>
    );
  }

  const modified = lastModifiedLabel(data.lastModified);
  const subtitle = [
    data.location,
    modified ? modified.charAt(0).toLowerCase() + modified.slice(1) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const selectElement = (element: Element) => {
    setSlot(null);
    const same = element.id === elementId;
    setParams(same ? {} : { element: element.id }, { replace: true });
  };

  const selectSlot = (next: SlotRef) => {
    setParams({}, { replace: true });
    setSlot(slot?.rowIndex === next.rowIndex && slot.position === next.position ? null : next);
  };

  const slotRow = slot ? data.rows.find((r) => r.index === slot.rowIndex) : undefined;
  const available = slot && slotRow ? maxWidthAt(slotRow, slot.position) : 0;
  const hasSheet = !!selected || !!slot;

  return (
    <main className={`${styles.page} ${hasSheet ? styles.withSheet : ''}`}>
      <header className={styles.header}>
        <IconButton
          label="Retour aux tableaux"
          icon="chevron-left"
          onClick={() => navigate('/tableaux')}
        />
        <div className={styles.titles}>
          <h1 className={styles.title}>{data.name}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        <IconButton
          label="Paramètres du tableau"
          icon="settings"
          onClick={() => navigate(`/tableaux/${data.id}/parametres`)}
        />
      </header>

      <div className={styles.rows}>
        {data.rows.map((row) => (
          <RailRow
            key={row.id}
            row={row}
            selectedElementId={selected?.element.id ?? null}
            selectedSlot={slot}
            onSelectElement={selectElement}
            onSelectSlot={selectSlot}
          />
        ))}
      </div>

      <ElementSheet
        element={selected?.element ?? null}
        rowIndex={selected?.row.index ?? 0}
        onClose={() => setParams({}, { replace: true })}
      />

      <BottomSheet
        open={!!slot && !selected}
        modal={false}
        floating
        onClose={() => setSlot(null)}
        title="Module libre"
        description={
          slot
            ? `Rangée ${slot.rowIndex + 1} · module ${slot.position + 1} · ${available} ${plural(
                available,
                'module disponible',
                'modules disponibles',
              )}`
            : undefined
        }
      >
        <p className={styles.note}>L'ajout d'appareils arrive bientôt.</p>
      </BottomSheet>
    </main>
  );
}
