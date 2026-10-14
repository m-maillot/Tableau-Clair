import type { Board, CreateElementInput, Element, Row } from '@tableau-clair/contracts';
import {
  moveElement,
  moveToRow as moveBetweenRows,
  nearestFreePosition,
  validateSpan,
  type PlacementError,
  type RowState,
} from '@tableau-clair/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiResponseError,
  createElement,
  deleteElement,
  NetworkError,
  patchElement,
} from '../api/client';
import { plural } from '../home/format';
import { keys } from '../home/queries';
import { moduleRange } from './appearance';
import { dropElement, findElement, putElement } from './board-cache';
import {
  afterRedo,
  afterUndo,
  EMPTY_HISTORY,
  nextRedo,
  nextUndo,
  record,
  remapElement,
  type Command,
  type History,
  type Place,
} from './history';

export interface Notice {
  tone: 'info' | 'error';
  text: string;
}

const NOTICE_MS = 5000;
const REFUSED_MS = 700;

const rowState = (row: Row): RowState<Element> => ({
  capacity: row.capacity,
  elements: row.elements,
});

const modules = (n: number) => `${n} ${plural(n, 'module', 'modules')}`;

function placementMessage(error: PlacementError, board: Board): string {
  switch (error.code) {
    case 'overlap': {
      const other = board.rows.flatMap((r) => r.elements).find((e) => e.id === error.with);
      return other ? `Emplacement occupé par « ${other.label} ».` : 'Emplacement déjà occupé.';
    }
    // À gauche, la position visée est négative (invalid_position) ; à droite, elle dépasse la capacité.
    case 'invalid_position':
    case 'out_of_bounds':
      return 'Bord de la rangée atteint : impossible d’aller plus loin.';
    default:
      return 'Position invalide.';
  }
}

function failureNotice(error: unknown): Notice {
  if (error instanceof NetworkError) {
    return {
      tone: 'error',
      text: 'Serveur injoignable : la modification n’a pas été enregistrée.',
    };
  }
  if (error instanceof ApiResponseError) {
    if (error.status === 409) {
      return {
        tone: 'error',
        text: 'Cet élément a été modifié ailleurs. Le tableau a été rechargé, réessayez.',
      };
    }
    if (error.status === 403) {
      return { tone: 'error', text: 'Vous n’avez pas le droit de modifier ce tableau.' };
    }
    if (error.status === 422) {
      return {
        tone: 'error',
        text: 'Le serveur a refusé cette modification : l’emplacement n’est plus libre.',
      };
    }
  }
  return { tone: 'error', text: 'La modification a échoué. Réessayez.' };
}

/** Champs d'un élément restauré (annulation d'une suppression). */
function createInput(element: Element, board: Board): CreateElementInput {
  const rcdStillThere =
    element.protectedByRcdId !== null && findElement(board, element.protectedByRcdId) !== null;
  return {
    position: element.position,
    width: element.width,
    kind: element.kind,
    label: element.label,
    role: element.role,
    brand: element.brand,
    model: element.model,
    notes: element.notes,
    photoId: element.photoId,
    outgoingCables: element.outgoingCables,
    cableSection: element.cableSection,
    ratingA: element.ratingA,
    poles: element.poles,
    curve: element.curve,
    sensitivityMa: element.sensitivityMa,
    rcdType: element.rcdType,
    protectedByRcdId: rcdStillThere ? element.protectedByRcdId : null,
  };
}

/**
 * Actions d'édition du rail : déplacement, changement de rangée, suppression, annuler / rétablir.
 *
 * Chaque action est validée localement par les règles du package `domain` (retour immédiat),
 * appliquée au cache de manière optimiste, puis envoyée au serveur. Les envois sont
 * sérialisés : trois appuis rapides sur « → » produisent trois requêtes ordonnées, chacune
 * avec la version à jour de l'élément.
 */
export function useRailActions(boardId: string) {
  const client = useQueryClient();
  const [history, setHistory] = useState<History>(EMPTY_HISTORY);
  const historyRef = useRef<History>(EMPTY_HISTORY);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [refusedId, setRefusedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const getBoard = () => client.getQueryData<Board>(keys.board(boardId));
  const setBoard = (board: Board) => client.setQueryData(keys.board(boardId), board);

  const commit = (next: History) => {
    historyRef.current = next;
    setHistory(next);
  };

  // Les messages disparaissent seuls.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!refusedId) return;
    const timer = setTimeout(() => setRefusedId(null), REFUSED_MS);
    return () => clearTimeout(timer);
  }, [refusedId]);

  const refuse = useCallback((text: string, elementId?: string) => {
    setNotice({ tone: 'error', text });
    if (elementId) setRefusedId(elementId);
  }, []);

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    pending.current += 1;
    setBusy(true);
    const run = chain.current.then(task, task);
    chain.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run.finally(() => {
      pending.current -= 1;
      if (pending.current > 0) return;
      setBusy(false);
      // Une fois la file vidée : relecture serveur (dernière modification, occupation, liaisons).
      void client.invalidateQueries({ queryKey: keys.board(boardId) });
      const propertyId = getBoard()?.propertyId;
      if (propertyId) {
        void client.invalidateQueries({ queryKey: keys.boards(propertyId) });
        void client.invalidateQueries({ queryKey: keys.overview(propertyId) });
      }
    });
  }

  /** Déplace un élément (même rangée ou autre) : validation locale, mise à jour optimiste, envoi. */
  async function applyMove(elementId: string, to: Place): Promise<boolean> {
    const board = getBoard();
    const found = board && findElement(board, elementId);
    if (!board || !found) {
      refuse('Cet élément n’existe plus.');
      return false;
    }
    const target = board.rows.find((r) => r.id === to.rowId);
    if (!target) {
      refuse('Rangée introuvable.');
      return false;
    }

    const rowChanged = to.rowId !== found.element.rowId;
    const checked = rowChanged
      ? moveBetweenRows(rowState(found.row), rowState(target), elementId, to.position)
      : moveElement(rowState(found.row), elementId, to.position);
    if (!checked.ok) {
      refuse(placementMessage(checked.error, board), elementId);
      return false;
    }

    const original = found.element;
    setBoard(putElement(board, { ...original, rowId: to.rowId, position: to.position }));
    try {
      const updated = await patchElement(elementId, {
        ...(rowChanged ? { rowId: to.rowId } : {}),
        position: to.position,
        version: original.version,
      });
      const current = getBoard();
      if (current) setBoard(putElement(current, updated));
      return true;
    } catch (error) {
      const current = getBoard();
      if (current) setBoard(putElement(current, original));
      setNotice(failureNotice(error));
      return false;
    }
  }

  async function applyRemove(elementId: string): Promise<boolean> {
    const board = getBoard();
    const found = board && findElement(board, elementId);
    if (!board || !found) return false;

    setBoard(dropElement(board, elementId));
    try {
      await deleteElement(elementId);
      return true;
    } catch (error) {
      const current = getBoard();
      if (current) setBoard(putElement(current, found.element));
      setNotice(failureNotice(error));
      return false;
    }
  }

  /** ← / → : décale d'un module. */
  const move = (element: Element, delta: -1 | 1) =>
    enqueue(async () => {
      const board = getBoard();
      const current = (board && findElement(board, element.id)?.element) || element;
      const before: Place = { rowId: current.rowId, position: current.position };
      const after: Place = { rowId: current.rowId, position: current.position + delta };
      if (await applyMove(current.id, after)) {
        commit(
          record(historyRef.current, {
            kind: 'move',
            elementId: current.id,
            before,
            after,
            label: `Déplacement de « ${current.label} »`,
          }),
        );
        setNotice({
          tone: 'info',
          text: `« ${current.label} » : ${moduleRange(after.position, current.width)}.`,
        });
      }
    });

  /** Change de rangée en gardant la position la plus proche possible. */
  const changeRow = (element: Element, rowId: string) =>
    enqueue(async () => {
      const board = getBoard();
      const current = (board && findElement(board, element.id)?.element) || element;
      const target = board?.rows.find((r) => r.id === rowId);
      if (!board || !target) return;

      const position = nearestFreePosition(
        rowState(target),
        current.width,
        current.position,
        current.id,
      );
      if (position === null) {
        refuse(
          `Pas de place pour ${modules(current.width)} dans la rangée ${target.index + 1}.`,
          current.id,
        );
        return;
      }
      const before: Place = { rowId: current.rowId, position: current.position };
      const after: Place = { rowId, position };
      if (await applyMove(current.id, after)) {
        commit(
          record(historyRef.current, {
            kind: 'move',
            elementId: current.id,
            before,
            after,
            label: `Changement de rangée de « ${current.label} »`,
          }),
        );
        setNotice({
          tone: 'info',
          text: `« ${current.label} » : rangée ${target.index + 1}, ${moduleRange(position, current.width)}.`,
        });
      }
    });

  /** Ajoute un appareil sur un module libre. Retourne l'élément créé, ou `null` si refusé. */
  const add = (rowId: string, input: CreateElementInput) =>
    enqueue(async (): Promise<Element | null> => {
      const board = getBoard();
      const target = board?.rows.find((r) => r.id === rowId);
      if (!board || !target) {
        refuse('Rangée introuvable.');
        return null;
      }
      const problem = validateSpan(rowState(target), input);
      if (problem) {
        refuse(placementMessage(problem, board));
        return null;
      }
      try {
        const created = await createElement(rowId, input);
        const current = getBoard();
        if (current) setBoard(putElement(current, created));
        commit(
          record(historyRef.current, {
            kind: 'add',
            element: created,
            label: `Ajout de « ${created.label} »`,
          }),
        );
        setNotice({
          tone: 'info',
          text: `« ${created.label} » ajouté : ${moduleRange(created.position, created.width)}.`,
        });
        return created;
      } catch (error) {
        setNotice(failureNotice(error));
        return null;
      }
    });

  const remove = (element: Element) =>
    enqueue(async () => {
      if (!(await applyRemove(element.id))) return false;
      commit(
        record(historyRef.current, {
          kind: 'remove',
          element,
          label: `Suppression de « ${element.label} »`,
        }),
      );
      setNotice({ tone: 'info', text: `« ${element.label} » supprimé.` });
      return true;
    });

  const undo = () =>
    enqueue(async () => {
      const command = nextUndo(historyRef.current);
      if (!command) return;

      if (command.kind === 'move') {
        if (await applyMove(command.elementId, command.before)) {
          commit(afterUndo(historyRef.current, command));
          setNotice({ tone: 'info', text: `Annulé : ${command.label.toLowerCase()}.` });
        }
        return;
      }

      // Annuler un ajout : l'appareil est retiré.
      if (command.kind === 'add') {
        if (await applyRemove(command.element.id)) {
          commit(afterUndo(historyRef.current, command));
          setNotice({ tone: 'info', text: `Annulé : ${command.label.toLowerCase()}.` });
        }
        return;
      }

      // Restaurer un élément supprimé : il retrouve sa place s'il y en a encore une.
      const board = getBoard();
      const target = board?.rows.find((r) => r.id === command.element.rowId);
      if (!board || !target) {
        refuse('La rangée de cet élément n’existe plus.');
        return;
      }
      if (validateSpan(rowState(target), command.element)) {
        refuse('Impossible de restaurer : l’emplacement est occupé.');
        return;
      }
      try {
        const created = await createElement(target.id, createInput(command.element, board));
        const current = getBoard();
        if (current) setBoard(putElement(current, created));
        const remapped = remapElement(historyRef.current, command.element.id, created);
        commit(afterUndo(remapped, { ...command, element: created }));
        const lost = command.element.linkedFixtures;
        setNotice({
          tone: 'info',
          text:
            lost > 0
              ? `« ${created.label} » restauré. ${lost} ${plural(lost, 'liaison reste', 'liaisons restent')} « inconnue${lost > 1 ? 's' : ''} ».`
              : `« ${created.label} » restauré.`,
        });
      } catch (error) {
        setNotice(failureNotice(error));
      }
    });

  const redo = () =>
    enqueue(async () => {
      const command: Command | undefined = nextRedo(historyRef.current);
      if (!command) return;

      if (command.kind === 'add') {
        // Rétablir un ajout recrée l'appareil (nouvel identifiant) à sa place.
        const board = getBoard();
        const target = board?.rows.find((r) => r.id === command.element.rowId);
        if (!board || !target) {
          refuse('La rangée de cet élément n’existe plus.');
          return;
        }
        if (validateSpan(rowState(target), command.element)) {
          refuse('Impossible de rétablir : l’emplacement est occupé.');
          return;
        }
        try {
          const created = await createElement(target.id, createInput(command.element, board));
          const current = getBoard();
          if (current) setBoard(putElement(current, created));
          const remapped = remapElement(historyRef.current, command.element.id, created);
          commit(afterRedo(remapped, { ...command, element: created }));
          setNotice({ tone: 'info', text: `Rétabli : ${command.label.toLowerCase()}.` });
        } catch (error) {
          setNotice(failureNotice(error));
        }
        return;
      }

      const done =
        command.kind === 'move'
          ? await applyMove(command.elementId, command.after)
          : await applyRemove(command.element.id);
      if (done) {
        commit(afterRedo(historyRef.current, command));
        setNotice({ tone: 'info', text: `Rétabli : ${command.label.toLowerCase()}.` });
      }
    });

  return {
    move,
    changeRow,
    add,
    remove,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undoLabel: history.past.at(-1)?.label,
    redoLabel: history.future.at(-1)?.label,
    busy,
    notice,
    dismissNotice: () => setNotice(null),
    refusedId,
  };
}
