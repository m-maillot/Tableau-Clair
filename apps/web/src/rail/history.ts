import type { Element } from '@tableau-clair/contracts';

export interface Place {
  rowId: string;
  position: number;
}

export type Command =
  | { kind: 'move'; elementId: string; before: Place; after: Place; label: string }
  | { kind: 'remove'; element: Element; label: string }
  | { kind: 'add'; element: Element; label: string };

export interface History {
  past: Command[];
  future: Command[];
}

export const MAX_HISTORY = 50;
export const EMPTY_HISTORY: History = { past: [], future: [] };

/** Nouvelle action de l'utilisateur : elle devient la dernière et efface ce qui pouvait être rétabli. */
export function record(history: History, command: Command): History {
  return { past: [...history.past, command].slice(-MAX_HISTORY), future: [] };
}

export const nextUndo = (history: History): Command | undefined => history.past.at(-1);
export const nextRedo = (history: History): Command | undefined => history.future.at(-1);

/** À appeler une fois l'annulation appliquée : la commande passe côté « à rétablir ». */
export function afterUndo(history: History, command: Command): History {
  return { past: history.past.slice(0, -1), future: [...history.future, command] };
}

/** À appeler une fois le rétablissement appliqué : la commande revient côté « à annuler ». */
export function afterRedo(history: History, command: Command): History {
  return { past: [...history.past, command], future: history.future.slice(0, -1) };
}

/**
 * Restaurer un élément supprimé lui donne un nouvel identifiant : toutes les commandes
 * qui le concernent doivent pointer vers lui, sinon l'historique deviendrait incohérent.
 */
export function remapElement(history: History, oldId: string, restored: Element): History {
  const remap = (command: Command): Command => {
    if (command.kind === 'move' && command.elementId === oldId) {
      return { ...command, elementId: restored.id };
    }
    if ((command.kind === 'remove' || command.kind === 'add') && command.element.id === oldId) {
      return { ...command, element: restored };
    }
    return command;
  };
  return { past: history.past.map(remap), future: history.future.map(remap) };
}
