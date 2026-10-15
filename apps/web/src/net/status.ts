import { useSyncExternalStore } from 'react';

/**
 * État du réseau et heure du dernier état chargé, partagés par toute l'interface.
 * Hors ligne, l'application reste consultable (cache du service worker) mais jamais modifiable.
 */

const SYNC_KEY = 'tc-last-sync';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

let lastSync: string | null = null;
try {
  lastSync = window.localStorage.getItem(SYNC_KEY);
} catch {
  /* stockage indisponible : l'heure n'est alors pas conservée */
}

/** Enregistre qu'un état à jour vient d'être lu depuis le serveur. */
export function markSynced(now = new Date()) {
  lastSync = now.toISOString();
  try {
    window.localStorage.setItem(SYNC_KEY, lastSync);
  } catch {
    /* non critique */
  }
  notify();
}

export function clearSynced() {
  lastSync = null;
  try {
    window.localStorage.removeItem(SYNC_KEY);
  } catch {
    /* non critique */
  }
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

export function useLastSync(): Date | null {
  const iso = useSyncExternalStore(
    subscribe,
    () => lastSync,
    () => null,
  );
  return iso ? new Date(iso) : null;
}

/** Faux hors ligne : les écrans retirent leurs actions d'édition. */
export function useCanWrite(): boolean {
  return useOnline();
}
