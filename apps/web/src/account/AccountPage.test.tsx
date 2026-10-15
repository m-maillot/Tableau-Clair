import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { SessionProvider } from '../auth/session';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const EMAIL = 'martial@racomach.fr';

function createServer(options: { deleteStatus?: number } = {}) {
  let signedIn = true;
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined;
      calls.push({ method, url, ...(body ? { body } : {}) });

      if (url === '/api/me') {
        return signedIn
          ? json({ id: ID(1), email: EMAIL, displayName: 'Martial' })
          : json({ message: 'Non authentifié' }, 401);
      }
      if (url === '/api/account' && method === 'GET') {
        return json({
          email: EMAIL,
          displayName: 'Martial',
          deletedProperties: [
            { id: ID(2), name: 'Maison des Lilas', boardCount: 2, otherMembers: 1 },
          ],
          leftProperties: [{ id: ID(3), name: 'Chez les parents' }],
        });
      }
      if (url === '/api/account/export') {
        return new Response('{"exportedAt":"x"}', {
          headers: {
            'content-type': 'application/json',
            'content-disposition': 'attachment; filename="tableau-clair-export-2026-10-15.json"',
          },
        });
      }
      if (url === '/api/account' && method === 'DELETE') {
        if (options.deleteStatus)
          return json({ code: 'confirmation_mismatch', message: 'x' }, options.deleteStatus);
        signedIn = false;
        return new Response(null, { status: 204 });
      }
      if (url === '/api/auth/sign-out') {
        signedIn = false;
        return json({});
      }
      if (url === '/api/properties') return json([]);
      throw new Error(`appel inattendu : ${method} ${url}`);
    }),
  );
  return { calls };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderAccount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/compte']}>
        <SessionProvider>
          <AppRoutes />
          <LocationProbe />
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let clicked: HTMLAnchorElement[] = [];
beforeEach(() => {
  clicked = [];
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('page compte', () => {
  it('affiche l’identité et la mention d’information', async () => {
    createServer();
    renderAccount();
    const identity = await screen.findByRole('region', { name: 'Identité' });
    expect(identity).toHaveTextContent('Martial');
    expect(identity).toHaveTextContent(EMAIL);
    expect(screen.getByRole('region', { name: 'Vos données personnelles' })).toHaveTextContent(
      'Aucun traceur tiers',
    );
  });

  it('télécharge l’export JSON sous le nom donné par le serveur', async () => {
    createServer();
    renderAccount();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Exporter mes données (JSON)' }),
    );
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0]!.download).toBe('tableau-clair-export-2026-10-15.json');
  });

  it('se déconnecte', async () => {
    createServer();
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Se déconnecter' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/connexion'));
  });

  it('annonce ce que la suppression emporte et exige l’adresse exacte', async () => {
    const server = createServer();
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer mon compte…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Supprimer votre compte ?' });

    expect(await within(dialog).findByText('Maison des Lilas')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('2 tableaux');
    expect(dialog).toHaveTextContent('1 autre personne perd l’accès');
    expect(dialog).toHaveTextContent('Chez les parents');

    const confirm = within(dialog).getByRole('button', { name: 'Supprimer définitivement' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Pour confirmer/), 'autre@exemple.fr');
    expect(confirm).toBeDisabled();

    await userEvent.clear(within(dialog).getByLabelText(/Pour confirmer/));
    await userEvent.type(within(dialog).getByLabelText(/Pour confirmer/), EMAIL);
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);

    await waitFor(() =>
      expect(server.calls.find((c) => c.method === 'DELETE')).toMatchObject({
        url: '/api/account',
        body: { confirm: EMAIL },
      }),
    );
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/connexion'));
  });

  it('signale un refus du serveur sans fermer la feuille', async () => {
    createServer({ deleteStatus: 422 });
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer mon compte…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Supprimer votre compte ?' });
    await userEvent.type(within(dialog).getByLabelText(/Pour confirmer/), EMAIL);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer définitivement' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('ne correspond pas');
  });
});
