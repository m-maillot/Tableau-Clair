import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { SessionProvider } from '../auth/session';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PROPERTY_ID = ID(101);
const NOW = '2026-10-14T10:00:00.000Z';
const audit = { createdAt: NOW, updatedAt: NOW, updatedBy: ID(1), version: 1 };

const B_KITCHEN = ID(401);
const B_IDLE = ID(402);

const fixture = (n: number, label: string, link: unknown) => ({
  ...audit,
  id: ID(500 + n),
  roomId: ID(301),
  kind: 'socket',
  label,
  x: 150,
  y: 150,
  notes: null,
  photoId: null,
  link,
});

function createServer(role: 'owner' | 'viewer' = 'owner', allVerified = false) {
  const fixtures = allVerified
    ? [fixture(1, 'Prise four', { breakerId: B_KITCHEN, status: 'verified' })]
    : [
        fixture(1, 'Prise four', { breakerId: B_KITCHEN, status: 'assumed' }),
        fixture(2, 'Prise mystère', null),
        fixture(3, 'Prise vérifiée', { breakerId: B_KITCHEN, status: 'verified' }),
      ];
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  const breaker = (id: string, label: string, position: number, count: number) => ({
    id,
    label,
    ratingA: 16,
    boardId: ID(201),
    boardName: 'Tableau principal',
    rowIndex: 0,
    position,
    linkedCount: count,
    photoId: null,
  });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined;
      calls.push({ method, url, ...(body ? { body } : {}) });
      if (url === '/api/me')
        return json({ id: ID(1), email: 'martial@racomach.fr', displayName: 'Martial' });
      if (url === '/api/properties')
        return json([
          { ...audit, id: PROPERTY_ID, name: 'Maison', address: null, notes: null, role },
        ]);
      if (url === `/api/properties/${PROPERTY_ID}/plan`) {
        return json({
          breakers: [
            breaker(B_KITCHEN, 'Prises cuisine', 3, 2),
            ...(allVerified ? [] : [breaker(B_IDLE, 'Garage', 5, 0)]),
          ],
          floors: [
            {
              ...audit,
              id: ID(201),
              propertyId: PROPERTY_ID,
              index: 0,
              name: 'RDC',
              width: 1000,
              height: 700,
              backgroundImageId: null,
              backgroundOpacity: 1,
              backgroundX: 0,
              backgroundY: 0,
              backgroundScale: 1,
              backgroundLocked: false,
              background: null,
              rooms: [
                {
                  ...audit,
                  id: ID(301),
                  floorId: ID(201),
                  name: 'Cuisine',
                  x: 100,
                  y: 100,
                  w: 300,
                  h: 200,
                },
              ],
              fixtures,
            },
          ],
        });
      }
      const put = url.match(/^\/api\/fixtures\/([^/]+)\/link$/);
      if (put && method === 'PUT') {
        const target = fixtures.find((f) => f.id === put[1])!;
        target.link = { breakerId: body!.breakerId as string, status: body!.status as string };
        return json(target);
      }
      if (url === `/api/properties/${PROPERTY_ID}/overview`)
        return json({
          boardCount: 1,
          reliability: { total: 0, verified: 0, assumed: 0, unknown: 0 },
          lastModified: null,
        });
      throw new Error(`appel inattendu : ${method} ${url}`);
    }),
  );
  return { calls, writes: () => calls.filter((c) => c.method !== 'GET') };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderReview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/verifier']}>
        <SessionProvider>
          <AppRoutes />
          <LocationProbe />
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('écran À vérifier', () => {
  it('résume ce qu’il reste à confirmer et liste les cartes', async () => {
    createServer();
    renderReview();
    const banner = await screen.findByRole('region', { name: 'Bilan' });
    expect(banner).toHaveTextContent('2 liaisons à confirmer');
    expect(banner).toHaveTextContent(
      '1 supposée · 1 sans disjoncteur · 1 disjoncteur sans équipement',
    );

    const cards = screen.getByRole('list', { name: 'Éléments à vérifier' });
    expect(within(cards).getAllByRole('listitem')).toHaveLength(3);
    expect(cards).toHaveTextContent('Prise four');
    expect(cards).toHaveTextContent('Prises cuisine · 16 A');
    expect(cards).toHaveTextContent('Prise mystère');
    expect(cards).toHaveTextContent('Garage · 16 A');
    expect(cards).not.toHaveTextContent('Prise vérifiée');
  });

  it('filtre les supposées et les éléments sans lien', async () => {
    createServer();
    renderReview();
    await screen.findByText('Prise four');

    await userEvent.click(screen.getByRole('button', { name: 'Supposées' }));
    expect(screen.getByText('Prise four')).toBeInTheDocument();
    expect(screen.queryByText('Prise mystère')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sans lien' }));
    expect(screen.queryByText('Prise four')).not.toBeInTheDocument();
    expect(screen.getByText('Prise mystère')).toBeInTheDocument();
    expect(screen.getByText(/Garage/)).toBeInTheDocument();
  });

  it('confirme une liaison supposée', async () => {
    const server = createServer();
    renderReview();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmer' }));
    await waitFor(() =>
      expect(server.writes().at(-1)).toMatchObject({
        method: 'PUT',
        url: `/api/fixtures/${ID(501)}/link`,
        body: { breakerId: B_KITCHEN, status: 'verified' },
      }),
    );
  });

  it('choisit un disjoncteur pour un équipement sans lien', async () => {
    const server = createServer();
    renderReview();
    await userEvent.click(await screen.findByRole('button', { name: 'Choisir un disjoncteur' }));
    const picker = await screen.findByRole('dialog', { name: 'Quel disjoncteur l’alimente ?' });
    await userEvent.click(within(picker).getByRole('button', { name: /Prises cuisine/ }));
    await waitFor(() =>
      expect(server.writes().at(-1)).toMatchObject({
        url: `/api/fixtures/${ID(502)}/link`,
        body: { breakerId: B_KITCHEN, status: 'assumed' },
      }),
    );
  });

  it('vérifie un disjoncteur sans équipement en le coupant', async () => {
    const server = createServer();
    renderReview();
    await userEvent.click(await screen.findByRole('button', { name: 'Je viens de le couper' }));
    const dialog = await screen.findByRole('dialog', { name: 'Qu’est-ce qui est tombé ?' });
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Prise mystère/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmer 1 équipement' }));
    await waitFor(() =>
      expect(server.writes().at(-1)).toMatchObject({
        url: `/api/fixtures/${ID(502)}/link`,
        body: { breakerId: B_IDLE, status: 'verified' },
      }),
    );
  });

  it('mène au plan sur l’équipement concerné', async () => {
    createServer();
    renderReview();
    const cards = await screen.findByRole('list', { name: 'Éléments à vérifier' });
    await userEvent.click(within(cards).getAllByRole('button', { name: 'Voir sur le plan' })[0]!);
    // La page du plan consomme le paramètre et sélectionne l’équipement.
    expect(await screen.findByRole('region', { name: 'Prise four' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/plan');
  });

  it('ne propose aucune action de modification à un lecteur', async () => {
    createServer('viewer');
    renderReview();
    await screen.findByText('Prise four');
    expect(screen.queryByRole('button', { name: 'Confirmer' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Choisir un disjoncteur' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Je viens de le couper' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Voir sur le plan' }).length).toBeGreaterThan(0);
  });

  it('retire les actions d’édition hors ligne', async () => {
    createServer();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    try {
      renderReview();
      await screen.findByText('Prise four');
      expect(screen.queryByRole('button', { name: 'Confirmer' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Choisir un disjoncteur' }),
      ).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Voir sur le plan' }).length).toBeGreaterThan(0);
      expect(screen.getByText('Hors ligne · lecture seule')).toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    }
  });

  it('félicite quand tout est vérifié', async () => {
    createServer('owner', true);
    renderReview();
    expect(await screen.findByText('Tout est vérifié : rien à signaler.')).toBeInTheDocument();
  });
});
