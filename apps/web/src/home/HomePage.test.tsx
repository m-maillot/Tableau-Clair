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
const NOW = new Date().toISOString();

const USER = { id: ID(1), email: 'martial@racomach.fr', displayName: 'Martial' };
const audit = { createdAt: NOW, updatedAt: NOW, updatedBy: ID(1), version: 1 };

const property = (n: number, name: string) => ({
  ...audit,
  id: ID(100 + n),
  name,
  address: null,
  notes: null,
  role: 'owner',
});
const board = (n: number, name: string, used: number, total: number, location: string | null) => ({
  ...audit,
  id: ID(200 + n),
  propertyId: ID(101),
  name,
  location,
  photoId: null,
  rowCount: 3,
  modulesPerRow: 24,
  notes: null,
  usedModules: used,
  totalModules: total,
});
const overview = (over: Partial<Record<string, unknown>> = {}) => ({
  boardCount: 2,
  reliability: { total: 52, verified: 38, assumed: 5, unknown: 9 },
  lastModified: { at: NOW, by: 'Martial' },
  ...over,
});

interface Server {
  properties: unknown[];
  boards?: Record<string, unknown[]>;
  overviews?: Record<string, unknown>;
  search?: (propertyId: string, q: string) => unknown;
}

function mockServer(server: Server) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url === '/api/me') return json(USER);
      if (url === '/api/properties' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string) as { name: string };
        const created = property(server.properties.length + 1, body.name);
        server.properties.push(created);
        return json(created, 201);
      }
      if (url === '/api/properties') return json(server.properties);
      const match = url.match(
        /^\/api\/properties\/([^/]+)\/(boards|overview|search)(?:\?q=(.*))?$/,
      );
      if (match) {
        const [, id, kind, q] = match as unknown as [string, string, string, string | undefined];
        if (kind === 'boards') return json(server.boards?.[id] ?? []);
        if (kind === 'overview') return json(server.overviews?.[id] ?? overview());
        return json(server.search?.(id, decodeURIComponent(q ?? '')) ?? []);
      }
      throw new Error(`appel inattendu : ${url}`);
    }),
  );
  return calls;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderApp(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <SessionProvider>
          <AppRoutes />
          <LocationProbe />
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('Accueil', () => {
  const full: Server = {
    properties: [property(1, 'Maison des Lilas')],
    boards: {
      [ID(101)]: [
        board(1, 'Tableau principal', 18, 72, 'Garage'),
        board(2, 'Tableau extension', 1, 48, null),
      ],
    },
  };

  it('affiche le logement, la fiabilité, les tableaux et l’alerte', async () => {
    mockServer(full);
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Bonjour, Martial' })).toBeInTheDocument();
    // La notion de logement n'est pas exposée : ni sélecteur ni nom de logement.
    expect(screen.queryByRole('button', { name: /Maison des Lilas/ })).not.toBeInTheDocument();

    const reliability = await screen.findByRole('region', { name: 'Fiabilité du repérage' });
    expect(reliability).toHaveTextContent('38 / 52');
    expect(reliability).toHaveTextContent('9 équipements');
    expect(reliability).toHaveTextContent('Supposée 5');
    expect(reliability).toHaveTextContent('Inconnue 9');
    expect(reliability).toHaveTextContent(/Modifié aujourd'hui par Martial/);

    const boards = await screen.findByRole('region', { name: 'Tableaux' });
    expect(within(boards).getByRole('link', { name: /Tableau principal/ })).toHaveTextContent(
      'Garage · 3 rangées · 18 / 72 modules',
    );
    expect(within(boards).getByRole('link', { name: /Tableau extension/ })).toHaveTextContent(
      '3 rangées · 1 / 48 modules',
    );

    const alert = screen.getByRole('complementary', { name: 'À vérifier' });
    expect(alert).toHaveTextContent("9 équipements n'ont pas encore de disjoncteur identifié.");
    expect(within(alert).getByRole('link', { name: 'Commencer à vérifier' })).toHaveAttribute(
      'href',
      '/verifier',
    );
  });

  it('accorde le singulier', async () => {
    mockServer({
      ...full,
      overviews: {
        [ID(101)]: overview({ reliability: { total: 4, verified: 3, assumed: 0, unknown: 1 } }),
      },
    });
    renderApp();
    expect(
      await screen.findByText("1 équipement n'a pas encore de disjoncteur identifié."),
    ).toBeInTheDocument();
  });

  it('félicite quand tout est vérifié et masque l’alerte', async () => {
    mockServer({
      ...full,
      overviews: {
        [ID(101)]: overview({ reliability: { total: 6, verified: 6, assumed: 0, unknown: 0 } }),
      },
    });
    renderApp();
    expect(await screen.findByText(/Tout est vérifié/)).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'À vérifier' })).not.toBeInTheDocument();
  });

  it('invite à dessiner le plan quand aucun équipement n’existe', async () => {
    mockServer({
      ...full,
      overviews: {
        [ID(101)]: overview({ reliability: { total: 0, verified: 0, assumed: 0, unknown: 0 } }),
      },
    });
    renderApp();
    expect(await screen.findByText(/Aucun équipement sur le plan/)).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'À vérifier' })).not.toBeInTheDocument();
  });

  it('propose d’ajouter un tableau quand il n’y en a pas', async () => {
    mockServer({ properties: [property(1, 'Maison')], boards: { [ID(101)]: [] } });
    renderApp();
    const link = await screen.findByRole('link', { name: 'Créer mon premier tableau' });
    expect(link).toHaveAttribute('href', '/tableaux/nouveau');
  });

  it('conduit à l’éditeur depuis un tableau', async () => {
    mockServer(full);
    renderApp();
    await userEvent.click(await screen.findByRole('link', { name: /Tableau principal/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/tableaux/${ID(201)}`);
  });

  it('signale une erreur de chargement et permet de réessayer', async () => {
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/me') return json(USER);
        if (url === '/api/properties') return fail ? json({}, 500) : json([property(1, 'Maison')]);
        return json([]);
      }),
    );
    renderApp();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de charger vos logements',
    );
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('region', { name: 'Tableaux' })).toBeInTheDocument();
  });
});

describe('Arrivée', () => {
  it('atterrit sur les tableaux, sans écran de logement', async () => {
    mockServer({ properties: [property(1, 'Mon logement')], boards: { [ID(101)]: [] } });
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Bonjour, Martial' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/tableaux');
    expect(screen.queryByRole('heading', { name: /premier logement/i })).not.toBeInTheDocument();
  });
});

describe('Recherche', () => {
  const withSearch: Server = {
    properties: [property(1, 'Maison')],
    boards: { [ID(101)]: [board(1, 'Tableau principal', 4, 24, null)] },
    search: (_id, q) =>
      q.toLowerCase() === 'prise'
        ? [
            {
              kind: 'fixture',
              id: ID(301),
              title: 'Prise du lave-vaisselle',
              subtitle: 'Cuisine · RDC',
              boardId: ID(201),
              breaker: {
                id: ID(401),
                label: 'Lave-vaisselle',
                boardId: ID(201),
                boardName: 'Tableau principal',
                rowIndex: 0,
                position: 3,
              },
              status: 'assumed',
            },
            {
              kind: 'fixture',
              id: ID(302),
              title: 'Prise mystère',
              subtitle: 'Cave · Sous-sol',
              boardId: null,
              breaker: null,
              status: 'unknown',
            },
          ]
        : [],
  };

  it('n’interroge pas le serveur sous deux caractères', async () => {
    const calls = mockServer(withSearch);
    renderApp();
    await screen.findByRole('region', { name: 'Fiabilité du repérage' });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher' }), 'p');
    await new Promise((r) => setTimeout(r, 350));
    expect(calls.filter((c) => c.includes('/search'))).toHaveLength(0);
  });

  it('affiche le disjoncteur à couper et le statut, et remplace le tableau de bord', async () => {
    mockServer(withSearch);
    renderApp();
    await screen.findByRole('region', { name: 'Fiabilité du repérage' });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher' }), 'prise');

    const list = await screen.findByRole('list', { name: 'Résultats de la recherche' });
    const [first, second] = within(list).getAllByRole('link');
    expect(first).toHaveTextContent('Prise du lave-vaisselle');
    expect(first).toHaveTextContent(
      'À couper : Lave-vaisselle · Tableau principal · Rangée 1 · module 4',
    );
    expect(first).toHaveTextContent('Supposée');
    expect(second).toHaveTextContent('Disjoncteur à identifier');
    expect(second).toHaveTextContent('Inconnue');

    expect(screen.queryByRole('region', { name: 'Fiabilité du repérage' })).not.toBeInTheDocument();
  });

  it('indique l’absence de résultat', async () => {
    mockServer(withSearch);
    renderApp();
    await screen.findByRole('region', { name: 'Fiabilité du repérage' });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher' }), 'introuvable');
    expect(await screen.findByText('Aucun résultat pour « introuvable ».')).toBeInTheDocument();
  });

  it('revient au tableau de bord quand la recherche est effacée', async () => {
    mockServer(withSearch);
    renderApp();
    await screen.findByRole('region', { name: 'Fiabilité du repérage' });

    const box = screen.getByRole('searchbox', { name: 'Rechercher' });
    await userEvent.type(box, 'prise');
    await screen.findByRole('list', { name: 'Résultats de la recherche' });
    await userEvent.clear(box);

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Fiabilité du repérage' })).toBeInTheDocument(),
    );
  });

  it('mène à l’équipement sur le plan depuis un résultat', async () => {
    mockServer(withSearch);
    renderApp();
    await screen.findByRole('region', { name: 'Fiabilité du repérage' });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher' }), 'prise');
    await userEvent.click(await screen.findByRole('link', { name: /Prise du lave-vaisselle/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/plan?fixture=${ID(301)}`);
  });
});

describe('Navigation', () => {
  it('affiche la barre d’onglets avec les tableaux actifs', async () => {
    mockServer({ properties: [property(1, 'Maison')] });
    renderApp();
    const nav = await screen.findByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByRole('link', { name: 'Tableaux' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).queryByRole('link', { name: 'Accueil' })).not.toBeInTheDocument();
    expect(within(nav).getAllByRole('link')).toHaveLength(3);
  });

  it('ne laisse aucun onglet mener à une page vide', async () => {
    mockServer({ properties: [property(1, 'Maison')] });
    renderApp();
    const nav = await screen.findByRole('navigation', { name: 'Navigation principale' });
    await userEvent.click(within(nav).getByRole('link', { name: /À vérifier/ }));
    expect(await screen.findByRole('heading', { name: 'À vérifier' })).toBeInTheDocument();
  });
});
