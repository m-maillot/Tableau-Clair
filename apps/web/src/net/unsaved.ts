import { useSyncExternalStore } from 'react';

/**
 * Modifications refusées parce que la session avait expiré : conservées sur l'appareil
 * pour être réappliquées après reconnexion (rien n'est perdu en silence).
 */

export interface UnsavedChange {
  id: string;
  method: string;
  path: string;
  body: string | null;
  at: string;
}

const KEY = 'tc-unsaved';
const MAX = 50;
const listeners = new Set<() => void>();

function read(): UnsavedChange[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as UnsavedChange[]) : [];
  } catch {
    return [];
  }
}

let cache = read();

function write(list: UnsavedChange[]) {
  cache = list;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* stockage plein ou indisponible : la liste reste au moins en mémoire */
  }
  listeners.forEach((l) => l());
}

export function saveUnsaved(change: Omit<UnsavedChange, 'id' | 'at'>) {
  const entry: UnsavedChange = {
    ...change,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
  };
  write([...cache, entry].slice(-MAX));
}

export function discardUnsaved(ids?: string[]) {
  write(ids ? cache.filter((c) => !ids.includes(c.id)) : []);
}

export function listUnsaved() {
  return cache;
}

/** Rejoue les modifications dans l'ordre ; retourne celles qui n'ont pas pu l'être. */
export async function replayUnsaved(): Promise<UnsavedChange[]> {
  const failed: UnsavedChange[] = [];
  for (const change of cache) {
    try {
      const response = await fetch(change.path, {
        method: change.method,
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        ...(change.body ? { body: change.body } : {}),
      });
      if (response.ok) discardUnsaved([change.id]);
      else failed.push(change);
    } catch {
      failed.push(change);
    }
  }
  return failed;
}

export function useUnsaved(): UnsavedChange[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => cache,
    () => [],
  );
}

/** Événement émis quand l'API répond 401 à une requête métier. */
export const SESSION_EXPIRED_EVENT = 'tc:session-expired';
const EXPIRED_FLAG = 'tc-session-expired';

export function flagExpired() {
  try {
    window.sessionStorage.setItem(EXPIRED_FLAG, '1');
  } catch {
    /* non critique */
  }
}

export function consumeExpired(): boolean {
  try {
    const set = window.sessionStorage.getItem(EXPIRED_FLAG) === '1';
    window.sessionStorage.removeItem(EXPIRED_FLAG);
    return set;
  } catch {
    return false;
  }
}
