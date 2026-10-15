import { useSyncExternalStore } from 'react';

/** Service worker, mise à jour disponible et invite d'installation. */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  updateReady: boolean;
  canInstall: boolean;
}

let state: PwaState = { updateReady: false, canInstall: false };
const listeners = new Set<() => void>();
let waiting: ServiceWorker | null = null;
let deferred: BeforeInstallPromptEvent | null = null;

function set(next: Partial<PwaState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** Enregistre le service worker (production uniquement : en dev il gênerait le rechargement). */
export function registerServiceWorker() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    set({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set({ canInstall: false });
  });

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  void navigator.serviceWorker.register('/sw.js').then((registration) => {
    const flag = (worker: ServiceWorker | null) => {
      if (worker && navigator.serviceWorker.controller) {
        waiting = worker;
        set({ updateReady: true });
      }
    };
    flag(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') flag(worker);
      });
    });
  });

  // Une fois la nouvelle version activée, on recharge pour la servir.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

export function applyUpdate() {
  waiting?.postMessage('SKIP_WAITING');
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null;
  set({ canInstall: false });
  return choice.outcome === 'accepted';
}

/** Déconnexion / suppression du compte : vide les données gardées pour la lecture hors ligne. */
export function clearOfflineData() {
  navigator.serviceWorker?.controller?.postMessage('CLEAR_DATA');
}

export function usePwa(): PwaState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

const DISMISSED_KEY = 'tc-install-dismissed';

export function installDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) !== null;
  } catch {
    return false;
  }
}

export function dismissInstall() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, new Date().toISOString());
  } catch {
    /* non critique */
  }
}

/** iPhone / iPad dans Safari, hors mode « écran d'accueil » : l'installation est manuelle. */
export function needsIosHint(): boolean {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true;
  return ios && !standalone;
}
