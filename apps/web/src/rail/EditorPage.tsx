import type { Element } from '@tableau-clair/contracts';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { lastModifiedLabel } from '../home/format';
import { useBoard, useProperties } from '../home/queries';
import { IconButton } from '../ui';
import { AddElementSheet } from './AddElementSheet';
import { DeleteElementSheet } from './DeleteElementSheet';
import { ElementSheet } from './ElementSheet';
import styles from './EditorPage.module.css';
import { RailRow, type SlotRef } from './RailRow';
import { RowPickerSheet } from './RowPickerSheet';
import { useRailActions } from './useRailActions';

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** `/tableaux/:boardId` : composition du tableau, rangée par rangée, et sa modification. */
export function EditorPage() {
  const { boardId = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const board = useBoard(boardId);
  const properties = useProperties();
  const actions = useRailActions(boardId);
  const [slot, setSlot] = useState<SlotRef | null>(null);
  const [choosingRow, setChoosingRow] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const data = board.data;
  const elementId = params.get('element');
  const role = properties.data?.find((p) => p.id === data?.propertyId)?.role;
  const canEdit = role !== 'viewer';

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

  // Ctrl/⌘+Z annule, Ctrl/⌘+Maj+Z (ou Ctrl+Y) rétablit — hors champs de saisie.
  const { undo, redo, canUndo, canRedo } = actions;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey && canUndo) {
        event.preventDefault();
        void undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        if (canRedo) {
          event.preventDefault();
          void redo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, canUndo, canRedo]);

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
    setParams(element.id === elementId ? {} : { element: element.id }, { replace: true });
  };

  const selectSlot = (next: SlotRef) => {
    setParams({}, { replace: true });
    setSlot(slot?.rowIndex === next.rowIndex && slot.position === next.position ? null : next);
  };

  const hasSheet = !!selected || !!slot;
  const notice = actions.notice;

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
        {canEdit && (
          <>
            <IconButton
              label={
                actions.undoLabel ? `Annuler : ${actions.undoLabel}` : 'Annuler la dernière action'
              }
              icon="undo"
              disabled={!actions.canUndo || actions.busy}
              onClick={() => void actions.undo()}
            />
            <IconButton
              label={actions.redoLabel ? `Rétablir : ${actions.redoLabel}` : 'Rétablir'}
              icon="redo"
              disabled={!actions.canRedo || actions.busy}
              onClick={() => void actions.redo()}
            />
          </>
        )}
        <IconButton
          label="Paramètres du tableau"
          icon="settings"
          onClick={() => navigate(`/tableaux/${data.id}/parametres`)}
        />
      </header>

      {/* Annonce des résultats : succès en « status » (poli), refus en « alert » (immédiat). */}
      <div className={styles.noticeRegion}>
        {notice && (
          <p
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={`${styles.notice} ${notice.tone === 'error' ? styles.noticeError : ''}`}
          >
            {notice.text}
          </p>
        )}
      </div>

      <div className={styles.rows}>
        {data.rows.map((row) => (
          <RailRow
            key={row.id}
            row={row}
            selectedElementId={selected?.element.id ?? null}
            selectedSlot={slot}
            refusedId={actions.refusedId}
            onSelectElement={selectElement}
            onSelectSlot={selectSlot}
          />
        ))}
      </div>

      <ElementSheet
        element={selected?.element ?? null}
        propertyId={data.propertyId}
        rowIndex={selected?.row.index ?? 0}
        canEdit={canEdit}
        busy={actions.busy}
        onMove={(delta) => selected && void actions.move(selected.element, delta)}
        onChangeRow={() => setChoosingRow(true)}
        onDelete={() => setDeleting(true)}
        onClose={() => setParams({}, { replace: true })}
      />

      <RowPickerSheet
        board={data}
        element={choosingRow ? (selected?.element ?? null) : null}
        onClose={() => setChoosingRow(false)}
        onPick={(rowId) => {
          setChoosingRow(false);
          if (selected) void actions.changeRow(selected.element, rowId);
        }}
      />

      <DeleteElementSheet
        element={deleting ? (selected?.element ?? null) : null}
        rowIndex={selected?.row.index ?? 0}
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          const element = selected?.element;
          setDeleting(false);
          if (!element) return;
          void actions.remove(element).then((done) => {
            if (done) setParams({}, { replace: true });
          });
        }}
      />

      <AddElementSheet
        board={data}
        slot={slot && !selected ? slot : null}
        propertyId={data.propertyId}
        busy={actions.busy}
        onClose={() => setSlot(null)}
        onSubmit={async (rowId, input) => {
          const created = await actions.add(rowId, input);
          if (!created) return false;
          setSlot(null);
          setParams({ element: created.id }, { replace: true });
          return true;
        }}
      />
    </main>
  );
}
