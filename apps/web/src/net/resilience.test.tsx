import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteFixture } from '../api/client';
import { PwaPrompts } from '../pwa/PwaPrompts';
import { registerServiceWorker } from '../pwa/pwa';
import { OfflineBanner } from '../shell/OfflineBanner';
import { UnsavedBanner } from '../shell/UnsavedBanner';
import { ErrorState } from '../ui';
import { markSynced } from './status';
import { discardUnsaved, listUnsaved, SESSION_EXPIRED_EVENT } from './unsaved';

const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  discardUnsaved();
});
afterEach(() => {
  vi.unstubAllGlobals();
  setOnline(true);
});

describe('hors ligne', () => {
  it('affiche le bandeau lecture seule avec l’heure du dernier état', () => {
    markSynced(new Date(2026, 9, 15, 14, 32));
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => setOnline(false));
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Hors ligne · lecture seule');
    expect(banner).toHaveTextContent('14:32');

    act(() => setOnline(true));
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('session expirée', () => {
  it('garde la modification refusée et prévient l’application', async () => {
    const expired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ message: 'Non authentifié' }), { status: 401 }),
      ),
    );

    await expect(deleteFixture('abc')).rejects.toBeTruthy();
    window.removeEventListener(SESSION_EXPIRED_EVENT, expired);

    expect(expired).toHaveBeenCalled();
    expect(listUnsaved()).toMatchObject([{ method: 'DELETE', path: '/api/fixtures/abc' }]);
    expect(window.sessionStorage.getItem('tc-session-expired')).toBe('1');
  });

  it('propose de réappliquer, puis de vider, les modifications gardées', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/elements/e1') return new Response('{}', { status: 200 });
        return new Response('{}', { status: 409 });
      }),
    );
    const { saveUnsaved } = await import('./unsaved');
    saveUnsaved({ method: 'PATCH', path: '/api/elements/e1', body: '{"position":3,"version":1}' });
    saveUnsaved({ method: 'PATCH', path: '/api/elements/e2', body: '{"position":4,"version":1}' });

    render(<UnsavedBanner />);
    expect(screen.getByText('2 modifications non enregistrées')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Réappliquer' }));
    // La première passe, la seconde est en conflit : elle reste, avec une explication.
    await waitFor(() => expect(listUnsaved()).toHaveLength(1));
    expect(await screen.findByText(/n’a pas pu être réappliquée/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ignorer' }));
    expect(listUnsaved()).toHaveLength(0);
    expect(screen.queryByText(/modification/)).toBeNull();
  });
});

describe('installation PWA', () => {
  it('propose l’installation quand le navigateur la permet', async () => {
    registerServiceWorker();
    const prompt = vi.fn(async () => undefined);
    render(
      <MemoryRouter>
        <PwaPrompts />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    act(() => void window.dispatchEvent(event));

    const dialog = await screen.findByRole('dialog', { name: 'Installer Tableau Clair' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Installer' }));
    expect(prompt).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('erreur de chargement', () => {
  it('annonce l’erreur et propose de réessayer', async () => {
    const retry = vi.fn();
    render(<ErrorState title="Impossible de charger le plan." onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Impossible de charger le plan.');
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(retry).toHaveBeenCalled();
  });
});
