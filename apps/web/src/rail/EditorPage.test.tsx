import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { SessionProvider } from '../auth/session';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BOARD_ID = ID(201);
const PROPERTY_ID = ID(101);
const audit = {
  createdAt: '2026-10-13T18:42:00.000Z',
  updatedAt: '2026-10-13T18:42:00.000Z',
  updatedBy: ID(1),
  version: 1,
};

let counter = 0;
function element(
  rowId: string,
  position: number,
  width: number,
  kind: string,
  label: string,
  extra = {},
) {
  return {
    ...audit,
    id: ID(500 + ++counter),
    rowId,
    position,
    width,
    kind,
    label,
    role: null,
    brand: null,
    model: null,
    notes: null,
    photoId: null,
    outgoingCables: null,
    cableSection: null,
    ratingA: null,
    poles: null,
    curve: null,
    sensitivityMa: null,
    rcdType: null,
    protectedByRcdId: null,
    ...extra,
  };
}

function makeBoard() {
  counter = 0;
  const r0 = ID(300);
  const r1 = ID(301);
  const row0 = [
    element(r0, 0, 2, 'rcd', 'Différentiel', { ratingA: 40, sensitivityMa: 30, rcdType: 'A' }),
    element(r0, 2, 1, 'breaker', 'Prises cuisine', {
      ratingA: 16,
      curve: 'C',
      poles: 2,
      brand: 'Legrand',
      model: 'DX3',
      cableSection: 2.5,
      outgoingCables: 2,
    }),
    element(r0, 3, 1, 'hphc_contactor', 'Chauffe-eau'),
    element(r0, 4, 1, 'impulse_relay', 'Couloir'),
    element(r0, 5, 2, 'surge_protector', 'Parafoudre'),
  ];
  const row1 = [
    element(r1, 0, 1, 'connected_module', 'Shelly', { brand: 'Shelly' }),
    element(r1, 1, 2, 'energy_meter', 'Compteur'),
    element(r1, 3, 2, 'spare', 'Réserve'),
  ];
  const row = (id: string, index: number, elements: ReturnType<typeof element>[]) => ({
    ...audit,
    id,
    boardId: BOARD_ID,
    index,
    capacity: 12,
    used: elements.reduce((n, e) => n + e.width, 0),
    elements,
  });
  return {
    ...audit,
    id: BOARD_ID,
    propertyId: PROPERTY_ID,
    name: 'Tableau principal',
    location: 'Garage',
    photoId: null,
    rowCount: 2,
    modulesPerRow: 12,
    notes: null,
    lastModified: { at: new Date(Date.now() - 24 * 3600_000).toISOString(), by: 'Martial' },
    rows: [row(r0, 0, row0), row(r1, 1, row1)],
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function mockServer(board: ReturnType<typeof makeBoard> | null = makeBoard()) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/me')
        return json({ id: ID(1), email: 'martial@racomach.fr', displayName: 'Martial' });
      if (url === '/api/properties') return json([]);
      if (url === '/api/custom-models') return json([]);
      if (url === `/api/boards/${BOARD_ID}`) {
        return board ? json(board) : json({ code: 'not_found', message: 'x' }, 404);
      }
      throw new Error(`appel inattendu : ${url}`);
    }),
  );
}

function renderEditor(search = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/tableaux/${BOARD_ID}${search}`]}>
        <SessionProvider>
          <AppRoutes />
          <LocationProbe />
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('éditeur de rail — affichage', () => {
  it('affiche le titre, l’emplacement et la dernière modification', async () => {
    mockServer();
    renderEditor();
    expect(
      await screen.findByRole('heading', { name: 'Tableau principal', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Garage · modifié hier par Martial')).toBeInTheDocument();
  });

  it('affiche une rangée par carte avec son occupation', async () => {
    mockServer();
    renderEditor();
    const row1 = await screen.findByRole('region', { name: 'Rangée 1' });
    const row2 = screen.getByRole('region', { name: 'Rangée 2' });
    // Rangée 1 : 2 + 1 + 1 + 1 + 2 = 7 modules ; rangée 2 : 1 + 2 + 2 = 5 modules.
    expect(within(row1).getByText(/7 \/ 12 modules/)).toBeInTheDocument();
    expect(within(row2).getByText(/5 \/ 12 modules/)).toBeInTheDocument();
  });

  it('rend chaque type avec son calibre ou son sigle', async () => {
    mockServer();
    renderEditor();
    const row1 = await screen.findByRole('region', { name: 'Rangée 1' });
    const row2 = screen.getByRole('region', { name: 'Rangée 2' });

    for (const text of ['40 A', '16', 'HC', 'TL', 'PF']) {
      expect(within(row1).getByText(text)).toBeInTheDocument();
    }
    expect(within(row2).getByText('S')).toBeInTheDocument();
    expect(within(row2).getByText('kWh')).toBeInTheDocument();
  });

  it('nomme chaque élément pour les lecteurs d’écran, avec sa position', async () => {
    mockServer();
    renderEditor();
    expect(
      await screen.findByRole('button', { name: 'Prises cuisine, Disjoncteur, 16 A, module 3' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Parafoudre, Parafoudre, modules 6–7' }),
    ).toBeInTheDocument();
  });

  it('fait de chaque module libre une case cliquable numérotée', async () => {
    mockServer();
    renderEditor();
    const row1 = await screen.findByRole('region', { name: 'Rangée 1' });
    const row2 = screen.getByRole('region', { name: 'Rangée 2' });

    // 12 modules − 7 occupés = 5 libres (8 à 12) ; 12 − 5 = 7 libres (6 à 12).
    expect(within(row1).getAllByRole('button', { name: /module libre/ })).toHaveLength(5);
    expect(within(row2).getAllByRole('button', { name: /module libre/ })).toHaveLength(7);
    expect(
      within(row1).getByRole('button', { name: 'Rangée 1, module libre 8, ajouter un appareil' }),
    ).toBeInTheDocument();
  });

  it('place les éléments sur leurs modules (colonnes de la grille)', async () => {
    mockServer();
    renderEditor();
    const parafoudre = await screen.findByRole('button', { name: /Parafoudre, Parafoudre/ });
    expect(parafoudre).toHaveStyle({ gridColumn: '6 / span 2' });
    const slot = screen.getByRole('button', {
      name: 'Rangée 1, module libre 8, ajouter un appareil',
    });
    expect(slot).toHaveStyle({ gridColumn: '8' });
  });

  it('rend le rail défilable au clavier et indique de le faire glisser', async () => {
    mockServer();
    renderEditor();
    const rail = await screen.findByRole('group', { name: 'Rail de la rangée 1' });
    expect(rail).toHaveAttribute('tabindex', '0');
  });

  it('indique un tableau introuvable', async () => {
    mockServer(null);
    renderEditor();
    expect(await screen.findByText('Ce tableau est introuvable.')).toBeInTheDocument();
  });
});

describe('éditeur de rail — sélection', () => {
  it('ouvre la feuille de détail d’un élément et affiche ses caractéristiques', async () => {
    mockServer();
    renderEditor();
    const button = await screen.findByRole('button', { name: /Prises cuisine/ });
    await userEvent.click(button);

    expect(button).toHaveAttribute('aria-pressed', 'true');
    const sheet = screen.getByRole('region', { name: 'Prises cuisine' });
    expect(sheet).toHaveAccessibleDescription('Rangée 1 · module 3');
    expect(within(sheet).getByText('Disjoncteur')).toBeInTheDocument();
    expect(within(sheet).getByText('16 A')).toBeInTheDocument();
    expect(within(sheet).getByText('C')).toBeInTheDocument(); // courbe
    expect(within(sheet).getByText('Legrand')).toBeInTheDocument();
    expect(within(sheet).getByText('2,5 mm²')).toBeInTheDocument();
  });

  it('reflète la sélection dans l’adresse et se désélectionne au second clic', async () => {
    mockServer();
    renderEditor();
    const button = await screen.findByRole('button', { name: /Prises cuisine/ });

    await userEvent.click(button);
    expect(screen.getByTestId('location')).toHaveTextContent(`?element=${ID(502)}`);

    await userEvent.click(button);
    expect(screen.queryByRole('region', { name: 'Prises cuisine' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).not.toHaveTextContent('element=');
  });

  it('ferme la feuille avec le bouton Fermer', async () => {
    mockServer();
    renderEditor();
    await userEvent.click(await screen.findByRole('button', { name: /Prises cuisine/ }));
    const sheet = screen.getByRole('region', { name: 'Prises cuisine' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('region', { name: 'Prises cuisine' })).not.toBeInTheDocument();
  });

  it('sélectionne l’élément indiqué dans l’adresse (arrivée depuis la recherche)', async () => {
    mockServer();
    renderEditor(`?element=${ID(505)}`);
    expect(await screen.findByRole('region', { name: 'Parafoudre' })).toBeInTheDocument();
  });

  it('ignore un élément inconnu dans l’adresse', async () => {
    mockServer();
    renderEditor(`?element=${ID(999)}`);
    await screen.findByRole('heading', { name: 'Tableau principal', level: 1 });
    expect(screen.queryByRole('region', { name: /Parafoudre|Prises/ })).not.toBeInTheDocument();
  });

  it('un module libre ouvre l’ajout avec l’espace disponible', async () => {
    mockServer();
    renderEditor();
    const slot = await screen.findByRole('button', {
      name: 'Rangée 1, module libre 8, ajouter un appareil',
    });
    await userEvent.click(slot);

    expect(slot).toHaveAttribute('aria-pressed', 'true');
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un appareil' });
    expect(dialog).toHaveAccessibleDescription('Rangée 1 · module 8 · 5 modules disponibles');
  });

  it('passer d’un module libre à un élément ferme l’ajout', async () => {
    mockServer();
    renderEditor();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Rangée 1, module libre 8, ajouter un appareil' }),
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: /Prises cuisine/ }));

    expect(screen.queryByRole('dialog', { name: 'Ajouter un appareil' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Prises cuisine' })).toBeInTheDocument();
  });
});

describe('éditeur de rail — navigation', () => {
  it('mène aux paramètres et revient à la liste', async () => {
    mockServer();
    renderEditor();
    await userEvent.click(await screen.findByRole('button', { name: 'Paramètres du tableau' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/tableaux/${BOARD_ID}/parametres`);
  });

  it('le bouton retour mène à la liste des tableaux', async () => {
    mockServer();
    renderEditor();
    await userEvent.click(await screen.findByRole('button', { name: 'Retour aux tableaux' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/tableaux');
  });
});
