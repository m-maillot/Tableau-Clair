import type { Element, Row } from '@tableau-clair/contracts';
import { DEFAULT_WIDTH, type ElementKind } from '@tableau-clair/domain';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { lastModifiedLabel } from '../home/format';
import { useBoard, useProperties } from '../home/queries';
import { DESKTOP_QUERY, Icon, IconButton, useMediaQuery } from '../ui';
import { KIND_LABEL } from './appearance';
import { AddElementSheet } from './AddElementSheet';
import { DeleteElementSheet } from './DeleteElementSheet';
import { ElementSheet } from './ElementSheet';
import styles from './EditorPage.module.css';
import { RailPalette } from './RailPalette';
import { RailRow, type DragPayload, type SlotRef } from './RailRow';
import { RowPickerSheet } from './RowPickerSheet';
import { useRailActions } from './useRailActions';

const norm = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

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
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [armed, setArmed] = useState<ElementKind | null>(null);
  const [query, setQuery] = useState('');

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

  // Recherche de la barre d'outils : libellé, rôle, marque ou modèle d'un appareil de ce tableau.
  const matches = useMemo(() => {
    const needle = norm(query.trim());
    if (!data || needle.length < 1) return [];
    return data.rows
      .flatMap((row) => row.elements)
      .filter((e) =>
        norm([e.label, e.role, e.brand, e.model].filter(Boolean).join(' ')).includes(needle),
      );
  }, [data, query]);
  const highlightIds = useMemo(() => new Set(matches.map((m) => m.id)), [matches]);

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

  /** Ajoute un appareil standard, avec sa largeur par défaut, sur un module libre. */
  const addKind = async (row: Row, position: number, kind: ElementKind) => {
    const created = await actions.add(row.id, {
      position,
      width: DEFAULT_WIDTH[kind],
      kind,
      label: KIND_LABEL[kind],
    });
    if (created) {
      setSlot(null);
      setParams({ element: created.id }, { replace: true });
    }
  };

  const dropOn = (row: Row, position: number, payload: DragPayload) => {
    if (payload.elementId) {
      const element = data.rows.flatMap((r) => r.elements).find((e) => e.id === payload.elementId);
      if (element) void actions.moveTo(element, row.id, position);
    } else if (payload.kind && payload.kind in DEFAULT_WIDTH) {
      void addKind(row, position, payload.kind as ElementKind);
    }
  };

  const selectSlot = (next: SlotRef) => {
    if (armed && canEdit) {
      const row = data.rows.find((r) => r.index === next.rowIndex);
      setArmed(null);
      if (row) void addKind(row, next.position, armed);
      return;
    }
    setParams({}, { replace: true });
    setSlot(slot?.rowIndex === next.rowIndex && slot.position === next.position ? null : next);
  };

  const hasSheet = !desktop && (!!selected || !!slot);
  const notice = actions.notice;

  return (
    <main
      className={`${styles.page} ${hasSheet ? styles.withSheet : ''} ${desktop ? styles.desktop : ''}`}
    >
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
        {canEdit && !desktop && (
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

      {desktop && (
        <div className={styles.toolbar} role="toolbar" aria-label="Outils du tableau">
          <label className={styles.search}>
            <Icon name="search" size={18} />
            <input
              type="search"
              value={query}
              placeholder="Rechercher un appareil de ce tableau"
              aria-label="Rechercher dans ce tableau"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && matches[0]) selectElement(matches[0]);
              }}
            />
          </label>
          {query.trim() && (
            <span role="status" className={styles.found}>
              {matches.length === 0
                ? 'Aucun appareil'
                : `${matches.length} appareil${matches.length > 1 ? 's' : ''}`}
            </span>
          )}
          {canEdit && (
            <>
              <IconButton
                label={
                  actions.undoLabel
                    ? `Annuler : ${actions.undoLabel}`
                    : 'Annuler la dernière action'
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
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.main}>
          {desktop && canEdit && <RailPalette armed={armed} onArm={setArmed} />}
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
                fluid={desktop}
                highlightIds={desktop ? highlightIds : undefined}
                dnd={
                  desktop && canEdit
                    ? { onDrop: (position, payload) => dropOn(row, position, payload) }
                    : undefined
                }
              />
            ))}
          </div>
        </div>

        {desktop && (
          <div className={styles.side}>
            {selected ? (
              <ElementSheet
                variant="panel"
                element={selected.element}
                propertyId={data.propertyId}
                rowIndex={selected.row.index}
                canEdit={canEdit}
                busy={actions.busy}
                onMove={(delta) => void actions.move(selected.element, delta)}
                onChangeRow={() => setChoosingRow(true)}
                onDelete={() => setDeleting(true)}
                onClose={() => setParams({}, { replace: true })}
              />
            ) : (
              <p className={styles.note}>
                Sélectionnez un appareil pour voir sa fiche, ou un module libre pour en ajouter un.
              </p>
            )}
          </div>
        )}
      </div>

      <ElementSheet
        element={desktop ? null : (selected?.element ?? null)}
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
