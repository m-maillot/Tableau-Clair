import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { SessionProvider } from '../auth/session';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BOARD_ID = ID(201);
const PROPERTY_ID = ID(101);
const R0 = ID(300);
const R1 = ID(301);
const R2 = ID(302);
const NOW = '2026-10-14T10:00:00.000Z';

interface El {
  id: string;
  rowId: string;
  position: number;
  width: number;
  kind: string;
  label: string;
  version: number;
  ratingA: number | null;
  linkedFixtures: number;
}

const el = (
  id: number,
  rowId: string,
  position: number,
  width: number,
  label: string,
  extra: Partial<El> = {},
): El => ({
  id: ID(500 + id),
  rowId,
  position,
  width,
  kind: 'breaker',
  label,
  version: 1,
  ratingA: 16,
  linkedFixtures: 0,
  ...extra,
});

/** Serveur simulé et à état : applique les écritures, contrôle la version, journalise les appels. */
function createServer(options: { role?: 'owner' | 'viewer'; failNext?: number } = {}) {
  const capacity = 12;
  const elements: El[] = [
    el(1, R0, 0, 2, 'Différentiel', { kind: 'rcd', ratingA: 40 }),
    el(2, R0, 2, 1, 'Four', { linkedFixtures: 3 }),
    el(3, R0, 3, 1, 'Plaques'),
    el(4, R0, 6, 2, 'Parafoudre', { kind: 'surge_protector', ratingA: null }),
    el(5, R1, 0, 1, 'Garage'),
    el(6, R2, 0, 12, 'Plein'),
  ];
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  let created = 0;
  let failures = options.failNext ?? 0;

  const full = (e: El) => ({
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: ID(1),
    role: null,
    brand: null,
    model: null,
    notes: null,
    photoId: null,
    outgoingCables: null,
    cableSection: null,
    poles: null,
    curve: null,
    sensitivityMa: null,
    rcdType: null,
    protectedByRcdId: null,
    ...e,
  });
  const row = (id: string, index: number) => {
    const list = elements.filter((e) => e.rowId === id).sort((a, b) => a.position - b.position);
    return {
      createdAt: NOW,
      updatedAt: NOW,
      updatedBy: ID(1),
      version: 1,
      id,
      boardId: BOARD_ID,
      index,
      capacity,
      used: list.reduce((n, e) => n + e.width, 0),
      elements: list.map(full),
    };
  };
  const board = () => ({
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: ID(1),
    version: 1,
    id: BOARD_ID,
    propertyId: PROPERTY_ID,
    name: 'Tableau principal',
    location: 'Garage',
    photoId: null,
    rowCount: 3,
    modulesPerRow: capacity,
    notes: null,
    lastModified: { at: NOW, by: 'Martial' },
    rows: [row(R0, 0), row(R1, 1), row(R2, 2)],
  });

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    calls.push({ method, url, ...(body ? { body } : {}) });

    if (url === '/api/me')
      return json({ id: ID(1), email: 'martial@racomach.fr', displayName: 'Martial' });
    if (url === '/api/properties') {
      return json([
        {
          createdAt: NOW,
          updatedAt: NOW,
          updatedBy: ID(1),
          version: 1,
          id: PROPERTY_ID,
          name: 'Maison',
          address: null,
          notes: null,
          role: options.role ?? 'owner',
        },
      ]);
    }
    if (url === `/api/boards/${BOARD_ID}`) return json(board());
    if (url.startsWith(`/api/properties/${PROPERTY_ID}/`)) return json([]);

    const patch = url.match(/^\/api\/elements\/([^/]+)$/);
    if (patch && method === 'PATCH') {
      if (failures > 0) {
        failures -= 1;
        return json({ code: 'internal_error', message: 'boom' }, 500);
      }
      const target = elements.find((e) => e.id === patch[1]);
      if (!target) return json({ code: 'not_found', message: 'x' }, 404);
      if (body!.version !== target.version)
        return json({ code: 'version_conflict', message: 'x', details: full(target) }, 409);
      if (typeof body!.position === 'number') target.position = body!.position;
      if (typeof body!.rowId === 'string') target.rowId = body!.rowId;
      target.version += 1;
      return json(full(target));
    }
    if (patch && method === 'DELETE') {
      const index = elements.findIndex((e) => e.id === patch[1]);
      if (index >= 0) elements.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    const create = url.match(/^\/api\/rows\/([^/]+)\/elements$/);
    if (create && method === 'POST') {
      created += 1;
      const made = el(
        100 + created,
        create[1]!,
        body!.position as number,
        body!.width as number,
        body!.label as string,
        {
          kind: body!.kind as string,
          ratingA: (body!.ratingA as number | null) ?? null,
        },
      );
      elements.push(made);
      return json(full(made), 201);
    }
    throw new Error(`appel inattendu : ${method} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    calls,
    elements,
    writes: () => calls.filter((c) => c.method !== 'GET'),
    position: (label: string) => elements.find((e) => e.label === label)?.position,
  };
}

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/tableaux/${BOARD_ID}`]}>
        <SessionProvider>
          <AppRoutes />
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const select = async (name: RegExp) => {
  await userEvent.click(await screen.findByRole('button', { name }));
};
const right = () => screen.getByRole('button', { name: 'Déplacer à droite' });
const left = () => screen.getByRole('button', { name: 'Déplacer à gauche' });
const undoButton = () => screen.getByRole('button', { name: /^Annuler/ });
const redoButton = () => screen.getByRole('button', { name: /^Rétablir/ });

afterEach(() => vi.unstubAllGlobals());

describe('déplacement ← →', () => {
  it('décale d’un module, enregistre avec la version et annonce le résultat', async () => {
    const server = createServer();
    renderEditor();
    await select(/^Plaques/);
    await userEvent.click(right());

    expect(
      await screen.findByRole('button', { name: 'Plaques, Disjoncteur, 16 A, module 5' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('« Plaques » : module 5.');
    const patch = server.writes()[0]!;
    expect(patch).toMatchObject({ method: 'PATCH', body: { position: 4, version: 1 } });
    expect(server.position('Plaques')).toBe(4);
  });

  it('refuse sur un voisin, sans appel serveur, avec un message', async () => {
    const server = createServer();
    renderEditor();
    await select(/^Four/);
    await userEvent.click(right()); // « Plaques » est au module 4

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Emplacement occupé par « Plaques ».',
    );
    expect(server.writes()).toHaveLength(0);
    expect(undoButton()).toBeDisabled();
  });

  it('refuse au bord de la rangée', async () => {
    const server = createServer();
    renderEditor();
    await select(/^Différentiel/);
    await userEvent.click(left());

    expect(await screen.findByRole('alert')).toHaveTextContent('Bord de la rangée atteint');
    expect(server.writes()).toHaveLength(0);
  });

  it('marque visuellement l’élément refusé', async () => {
    createServer();
    renderEditor();
    await select(/^Four/);
    await userEvent.click(right());
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: /^Four/ }).className).toMatch(/refused/);
  });

  it('enchaîne plusieurs appuis rapides dans l’ordre, chacun avec la version à jour', async () => {
    const server = createServer();
    renderEditor();
    await select(/^Plaques/);

    await userEvent.click(right());
    await userEvent.click(right());
    await userEvent.click(right()); // module 4 → 7 : « Parafoudre » occupe 7–8, donc le 3e est refusé

    await waitFor(() => expect(server.writes().length).toBeGreaterThanOrEqual(2));
    const versions = server.writes().map((c) => c.body!.version);
    expect(versions).toEqual([1, 2]);
    expect(server.position('Plaques')).toBe(5);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Emplacement occupé par « Parafoudre »',
    );
  });

  it('annule le déplacement optimiste et le signale quand le serveur échoue', async () => {
    const server = createServer({ failNext: 1 });
    renderEditor();
    await select(/^Plaques/);
    await userEvent.click(right());

    expect(await screen.findByRole('alert')).toHaveTextContent('La modification a échoué');
    expect(screen.getByRole('button', { name: /^Plaques.*module 4$/ })).toBeInTheDocument();
    expect(server.position('Plaques')).toBe(3);
    expect(undoButton()).toBeDisabled();
  });

  it('signale un conflit de version', async () => {
    const server = createServer();
    renderEditor();
    await select(/^Plaques/);
    server.elements.find((e) => e.label === 'Plaques')!.version = 5; // modifié ailleurs

    await userEvent.click(right());
    expect(await screen.findByRole('alert')).toHaveTextContent('modifié ailleurs');
  });
});

describe('changement de rangée', () => {
  it('liste les autres rangées, grise celles sans place, et déplace à la position la plus proche', async () => {
    const server = createServer();
    renderEditor();
    await select(/^Parafoudre/); // 2 modules, position 6
    await userEvent.click(screen.getByRole('button', { name: 'Changer de rangée' }));

    const dialog = await screen.findByRole('dialog', { name: 'Changer de rangée' });
    const full = within(dialog).getByRole('button', { name: /Rangée 3/ });
    expect(full).toBeDisabled();
    expect(full).toHaveTextContent('pas de place');

    const second = within(dialog).getByRole('button', { name: /Rangée 2/ });
    expect(second).toHaveTextContent('au module 7');
    await userEvent.click(second);

    await waitFor(() => expect(server.writes()).toHaveLength(1));
    expect(server.writes()[0]!.body).toMatchObject({ rowId: R1, position: 6, version: 1 });
    expect(await screen.findByRole('status')).toHaveTextContent('rangée 2');
  });
});

describe('suppression', () => {
  it('demande confirmation, prévient des liaisons, supprime et ferme la feuille', async () => {
    const server = createServer();
    renderEditor();
    await select(/^Four/);
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer l’élément' }));

    const dialog = await screen.findByRole('dialog', { name: 'Supprimer « Four » ?' });
    expect(dialog).toHaveTextContent('3 équipements du plan sont reliés');
    expect(dialog).toHaveTextContent('inconnues');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Four/ })).not.toBeInTheDocument(),
    );
    expect(server.writes()[0]).toMatchObject({ method: 'DELETE' });
    expect(screen.queryByRole('region', { name: 'Four' })).not.toBeInTheDocument();
    expect(undoButton()).toBeEnabled();
  });

  it('n’envoie rien si l’on annule la confirmation', async () => {
    const server = createServer();
    renderEditor();
    await select(/^Plaques/);
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer l’élément' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).not.toHaveTextContent('reliés');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(server.writes()).toHaveLength(0);
  });
});

describe('annuler / rétablir', () => {
  it('annule un déplacement puis le rétablit', async () => {
    const server = createServer();
    renderEditor();
    await select(/^Plaques/);
    await userEvent.click(right());
    await waitFor(() => expect(server.position('Plaques')).toBe(4));

    await userEvent.click(undoButton());
    await waitFor(() => expect(server.position('Plaques')).toBe(3));
    expect(await screen.findByRole('button', { name: /^Plaques.*module 4$/ })).toBeInTheDocument();
    expect(redoButton()).toBeEnabled();

    await userEvent.click(redoButton());
    await waitFor(() => expect(server.position('Plaques')).toBe(4));
    expect(undoButton()).toBeEnabled();
  });

  it('annule une suppression : l’élément revient, et les liaisons perdues sont signalées', async () => {
    const server = createServer();
    renderEditor();
    await select(/^Four/);
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer l’élément' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Supprimer' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Four/ })).not.toBeInTheDocument(),
    );

    await userEvent.click(undoButton());
    expect(
      await screen.findByRole('button', { name: /^Four, Disjoncteur, 16 A, module 3$/ }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('3 liaisons restent « inconnues »');

    const post = server.writes().find((c) => c.method === 'POST')!;
    expect(post.body).toMatchObject({ position: 2, width: 1, label: 'Four', kind: 'breaker' });

    // Rétablir supprime l'élément restauré (nouvel identifiant), pas l'ancien.
    await userEvent.click(redoButton());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Four/ })).not.toBeInTheDocument(),
    );
    const deletes = server.writes().filter((c) => c.method === 'DELETE');
    expect(deletes).toHaveLength(2);
    expect(deletes[1]!.url).not.toBe(deletes[0]!.url);
  });

  it('une nouvelle action efface ce qui pouvait être rétabli', async () => {
    createServer();
    renderEditor();
    await select(/^Plaques/);
    await userEvent.click(right());
    await userEvent.click(await screen.findByRole('button', { name: /Annuler :/ }));
    await waitFor(() => expect(redoButton()).toBeEnabled());

    await userEvent.click(right());
    await waitFor(() => expect(redoButton()).toBeDisabled());
  });

  it('répond à Ctrl+Z', async () => {
    const server = createServer();
    renderEditor();
    await select(/^Plaques/);
    await userEvent.click(right());
    await waitFor(() => expect(server.position('Plaques')).toBe(4));

    await userEvent.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(server.position('Plaques')).toBe(3));
  });
});

describe('droits', () => {
  it('ne propose aucune modification à un lecteur', async () => {
    createServer({ role: 'viewer' });
    renderEditor();
    await select(/^Plaques/);

    expect(screen.getByRole('region', { name: 'Plaques' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Déplacer à droite' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer l’élément' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Annuler/ })).not.toBeInTheDocument();
  });
});
