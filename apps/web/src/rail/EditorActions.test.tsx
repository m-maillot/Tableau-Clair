import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const audit = { createdAt: NOW, updatedAt: NOW, updatedBy: ID(1), version: 1 };

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
function createServer(
  options: {
    role?: 'owner' | 'viewer';
    failNext?: number;
    models?: {
      id: string;
      label: string;
      role: string | null;
      brand: string | null;
      model: string | null;
      width: number;
    }[];
    rejectCreate?: boolean;
  } = {},
) {
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
  const models: {
    id: string;
    label: string;
    role: string | null;
    brand: string | null;
    model: string | null;
    width: number;
  }[] = options.models ?? [];
  let modelSeq = 0;
  const linked: {
    id: string;
    label: string;
    kind: string;
    status: string;
    roomId: string;
    roomName: string;
    floorId: string;
    floorName: string;
  }[] = [
    {
      id: ID(801),
      label: 'Hotte',
      kind: 'appliance',
      status: 'verified',
      roomId: ID(811),
      roomName: 'Cuisine',
      floorId: ID(821),
      floorName: 'RDC',
    },
  ];

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
    if (url === '/api/custom-models' && method === 'GET')
      return json(models.map((m) => ({ ...audit, ...m })));
    if (url === '/api/custom-models' && method === 'POST') {
      modelSeq += 1;
      const made = {
        id: ID(700 + modelSeq),
        role: null,
        brand: null,
        model: null,
        ...(body as object),
      } as (typeof models)[number];
      models.push(made);
      return json({ ...audit, ...made }, 201);
    }
    const modelDelete = url.match(/^\/api\/custom-models\/([^/]+)$/);
    if (modelDelete && method === 'DELETE') {
      const index = models.findIndex((m) => m.id === modelDelete[1]);
      if (index >= 0) models.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    if (url.startsWith(`/api/properties/${PROPERTY_ID}/photos`)) {
      return json(
        {
          ...audit,
          id: ID(900),
          propertyId: PROPERTY_ID,
          usage: 'element',
          mimeType: 'image/webp',
          width: 10,
          height: 10,
          sizeBytes: 10,
          contentUrl: `/api/photos/${ID(900)}/content`,
        },
        201,
      );
    }
    const circuit = url.match(/^\/api\/elements\/([^/]+)\/circuit$/);
    if (circuit) {
      return json({
        breaker: {
          id: circuit[1],
          label: 'Disjoncteur',
          ratingA: 16,
          boardId: BOARD_ID,
          boardName: 'Tableau principal',
          rowIndex: 0,
          position: 0,
          linkedCount: linked.length,
          photoId: null,
        },
        fixtures: linked,
        lastModified: null,
      });
    }
    if (url === `/api/properties/${PROPERTY_ID}/plan`) {
      return json({
        breakers: [],
        floors: [
          {
            ...audit,
            id: ID(821),
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
                id: ID(811),
                floorId: ID(821),
                name: 'Cuisine',
                x: 0,
                y: 0,
                w: 300,
                h: 200,
              },
            ],
            fixtures: [
              {
                ...audit,
                id: ID(803),
                roomId: ID(811),
                kind: 'socket',
                label: 'Prise libre',
                x: 10,
                y: 10,
                notes: null,
                photoId: null,
                link: null,
              },
            ],
          },
        ],
      });
    }
    const linkUrl = url.match(/^\/api\/fixtures\/([^/]+)\/link$/);
    if (linkUrl && method === 'PUT') {
      linked.push({
        id: linkUrl[1]!,
        label: 'Prise libre',
        kind: 'socket',
        status: body!.status as string,
        roomId: ID(811),
        roomName: 'Cuisine',
        floorId: ID(821),
        floorName: 'RDC',
      });
      return json({
        ...audit,
        id: linkUrl[1],
        roomId: ID(811),
        kind: 'socket',
        label: 'Prise libre',
        x: 10,
        y: 10,
        notes: null,
        photoId: null,
        link: { breakerId: ID(502), status: body!.status },
      });
    }
    if (linkUrl && method === 'DELETE') {
      const index = linked.findIndex((f) => f.id === linkUrl[1]);
      if (index >= 0) linked.splice(index, 1);
      return json({
        ...audit,
        id: linkUrl[1],
        roomId: ID(811),
        kind: 'socket',
        label: 'Prise libre',
        x: 10,
        y: 10,
        notes: null,
        photoId: null,
        link: null,
      });
    }
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
      const fields = { ...body! };
      delete fields.version;
      Object.assign(target, fields);
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
      if (options.rejectCreate) return json({ code: 'overlap', message: 'x' }, 422);
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

  it('ouvre la comparaison en cas de conflit et garde ma version sur demande', async () => {
    const server = createServer();
    renderEditor();
    await select(/^Plaques/);
    const saved = server.elements.find((e) => e.label === 'Plaques')!;
    saved.version = 5; // modifié ailleurs
    saved.position = 5;

    await userEvent.click(right());
    const dialog = await screen.findByRole('dialog', {
      name: 'Cet élément a été modifié entre-temps',
    });
    expect(dialog).toHaveAccessibleDescription(/version enregistrée n° 5/);
    const row = within(dialog).getByRole('row', { name: /Module/ });
    expect(row).toHaveTextContent('module 5');
    expect(row).toHaveTextContent('module 6');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Garder ma version' }));
    await waitFor(() => expect(server.position('Plaques')).toBe(4));
    expect(server.writes().at(-1)).toMatchObject({ body: { version: 5, position: 4 } });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('recharge la version enregistrée et abandonne le déplacement', async () => {
    const server = createServer();
    renderEditor();
    await select(/^Plaques/);
    const saved = server.elements.find((e) => e.label === 'Plaques')!;
    saved.version = 5;
    saved.position = 5;

    await userEvent.click(right());
    const dialog = await screen.findByRole('dialog', {
      name: 'Cet élément a été modifié entre-temps',
    });
    const writes = server.writes().length;
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Recharger la version enregistrée' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(server.writes()).toHaveLength(writes);
    expect(screen.getByRole('button', { name: /^Plaques.*module 6$/ })).toBeInTheDocument();
  });

  it('propose de réessayer après un échec d’enregistrement', async () => {
    const server = createServer({ failNext: 1 });
    renderEditor();
    await select(/^Plaques/);
    await userEvent.click(right());
    expect(await screen.findByRole('alert')).toHaveTextContent('La modification a échoué');

    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(server.position('Plaques')).toBe(4));
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
    expect(dialog).toHaveTextContent('Le module 3 de la rangée 1 devient libre');
    expect(dialog).toHaveTextContent(
      '3 équipements perdent leur disjoncteur et passent à « inconnue »',
    );
    expect(await within(dialog).findByText('Hotte')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Aucun n’est supprimé');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer l’appareil' }));
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
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Supprimer l’appareil',
      }),
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

describe('modifier un appareil', () => {
  const open = async (name: RegExp, sheetName: string) => {
    await select(name);
    await userEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    return screen.findByRole('dialog', { name: new RegExp(`Modifier : ${sheetName}`) });
  };

  it('affiche les champs du disjoncteur et n’envoie que ce qui change', async () => {
    const server = createServer();
    renderEditor();
    const dialog = await open(/^Plaques/, 'Disjoncteur');

    expect(within(dialog).getByLabelText('Libellé')).toHaveValue('Plaques');
    expect(within(dialog).getByRole('group', { name: 'Calibre' })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: 'Courbe' })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: 'Pôles' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Différentiel en amont')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Enregistrer' })).toBeDisabled();

    await userEvent.clear(within(dialog).getByLabelText('Libellé'));
    await userEvent.type(within(dialog).getByLabelText('Libellé'), 'Plaques cuisson');
    await userEvent.click(within(dialog).getByRole('button', { name: '20' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'C' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(server.writes().at(-1)).toMatchObject({
        method: 'PATCH',
        body: { label: 'Plaques cuisson', ratingA: 20, curve: 'C', version: 1 },
      }),
    );
    expect(server.writes().at(-1)!.body).not.toHaveProperty('position');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('adapte les champs au type : pas de courbe sur un parafoudre', async () => {
    createServer();
    renderEditor();
    const dialog = await open(/^Parafoudre/, 'Parafoudre');
    expect(within(dialog).queryByRole('group', { name: 'Calibre' })).toBeNull();
    expect(within(dialog).queryByRole('group', { name: 'Courbe' })).toBeNull();
    expect(within(dialog).getByRole('group', { name: 'Pôles' })).toBeInTheDocument();
  });

  it('borne la largeur par le voisin et explique pourquoi', async () => {
    createServer();
    renderEditor();
    // « Four » est au module 3 ; « Plaques » occupe le module 4 : largeur maximale 1.
    const dialog = await open(/^Four/, 'Disjoncteur');
    const plus = within(dialog).getByRole('button', { name: 'Augmenter : Largeur' });
    expect(plus).toBeDisabled();
    expect(dialog).toHaveTextContent('Le module 4 est occupé : largeur maximale 1.');
  });

  it('déplace et change la largeur depuis le formulaire, en un seul enregistrement', async () => {
    const server = createServer();
    renderEditor();
    // « Parafoudre » : modules 7–8, libre à sa droite.
    const dialog = await open(/^Parafoudre/, 'Parafoudre');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Déplacer à droite' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(server.writes().at(-1)).toMatchObject({ method: 'PATCH', body: { position: 7 } }),
    );
  });

  it('annule la modification enregistrée', async () => {
    const server = createServer();
    renderEditor();
    const dialog = await open(/^Plaques/, 'Disjoncteur');
    await userEvent.clear(within(dialog).getByLabelText('Libellé'));
    await userEvent.type(within(dialog).getByLabelText('Libellé'), 'Cuisson');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(server.elements.find((e) => e.id === ID(503))!.label).toBe('Cuisson'),
    );

    await userEvent.click(undoButton());
    await waitFor(() =>
      expect(server.elements.find((e) => e.id === ID(503))!.label).toBe('Plaques'),
    );
  });

  it('ouvre la confirmation de suppression depuis le formulaire', async () => {
    createServer();
    renderEditor();
    const dialog = await open(/^Plaques/, 'Disjoncteur');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer l’appareil' }));
    expect(
      await screen.findByRole('dialog', { name: 'Supprimer « Plaques » ?' }),
    ).toBeInTheDocument();
  });

  it('ne propose pas la modification à un lecteur', async () => {
    createServer({ role: 'viewer' });
    renderEditor();
    await select(/^Plaques/);
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull();
  });
});

describe('circuit d’un disjoncteur', () => {
  it('délie un équipement depuis la fiche du disjoncteur', async () => {
    const server = createServer();
    renderEditor();
    await select(/^Four/);
    const circuit = await screen.findByRole('region', { name: 'Circuit alimenté' });
    expect(circuit).toHaveTextContent('Hotte');

    await userEvent.click(within(circuit).getByRole('button', { name: 'Délier Hotte' }));
    await waitFor(() =>
      expect(server.writes().at(-1)).toMatchObject({
        method: 'DELETE',
        url: `/api/fixtures/${ID(801)}/link`,
      }),
    );
    expect(await screen.findByText('Aucun équipement relié')).toBeInTheDocument();
  });

  it('relie un équipement du plan, à confirmer', async () => {
    const server = createServer();
    renderEditor();
    await select(/^Four/);
    const circuit = await screen.findByRole('region', { name: 'Circuit alimenté' });
    await userEvent.click(within(circuit).getByRole('button', { name: 'Lier un équipement' }));

    const picker = await screen.findByRole('dialog', {
      name: 'Quel équipement ce disjoncteur alimente-t-il ?',
    });
    await userEvent.click(within(picker).getByRole('button', { name: /Prise libre/ }));

    await waitFor(() =>
      expect(server.writes().at(-1)).toMatchObject({
        method: 'PUT',
        url: `/api/fixtures/${ID(803)}/link`,
        body: { breakerId: ID(502), status: 'assumed' },
      }),
    );
    await waitFor(() => expect(circuit).toHaveTextContent('Prise libre'));
  });

  it('confirme comme vérifiées les liaisons de ce qui est tombé', async () => {
    const server = createServer();
    renderEditor();
    await select(/^Four/);
    const circuit = await screen.findByRole('region', { name: 'Circuit alimenté' });
    await userEvent.click(within(circuit).getByRole('button', { name: 'Je viens de le couper' }));

    const dialog = await screen.findByRole('dialog', { name: 'Qu’est-ce qui est tombé ?' });
    const confirm = within(dialog).getByRole('button', { name: 'Confirmer' });
    expect(confirm).toBeDisabled();

    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Hotte/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmer 1 équipement' }));
    await waitFor(() =>
      expect(server.writes().at(-1)).toMatchObject({
        method: 'PUT',
        url: `/api/fixtures/${ID(801)}/link`,
        body: { breakerId: ID(502), status: 'verified' },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Qu’est-ce qui est tombé ?' })).toBeNull(),
    );
  });

  it('ne propose ni lier ni délier à un lecteur', async () => {
    createServer({ role: 'viewer' });
    renderEditor();
    await select(/^Four/);
    const circuit = await screen.findByRole('region', { name: 'Circuit alimenté' });
    expect(circuit).toHaveTextContent('Hotte');
    expect(within(circuit).queryByRole('button', { name: 'Lier un équipement' })).toBeNull();
    expect(within(circuit).queryByRole('button', { name: 'Délier Hotte' })).toBeNull();
    expect(within(circuit).queryByRole('button', { name: 'Je viens de le couper' })).toBeNull();
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

describe('ajout d’un appareil', () => {
  const openSlot = async (name: string) => {
    await userEvent.click(await screen.findByRole('button', { name }));
    return screen.findByRole('dialog', { name: 'Ajouter un appareil' });
  };
  const SLOT_5 = 'Rangée 1, module libre 5, ajouter un appareil'; // 2 modules libres (5 et 6)
  const SLOT_6 = 'Rangée 1, module libre 6, ajouter un appareil'; // 1 module libre

  it('propose les types avec leur largeur et grise ceux qui ne tiennent pas', async () => {
    createServer();
    renderEditor();
    const dialog = await openSlot(SLOT_6);
    expect(dialog).toHaveAccessibleDescription('Rangée 1 · module 6 · 1 module disponible');

    expect(within(dialog).getByRole('button', { name: 'Disjoncteur · 1' })).toBeEnabled();
    const rcd = within(dialog).getByRole('button', { name: /Différentiel · 2/ });
    expect(rcd).toBeDisabled();
    expect(rcd).toHaveAccessibleName(/2 modules requis, 1 disponible/);
    expect(within(dialog).getByRole('button', { name: /Parafoudre · 2/ })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: /Réserve · 1/ })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Autre appareil…' })).toBeEnabled();
  });

  it('active les types de 2 modules quand la place suffit', async () => {
    createServer();
    renderEditor();
    const dialog = await openSlot(SLOT_5);
    expect(within(dialog).getByRole('button', { name: /Différentiel · 2/ })).toBeEnabled();
  });

  it('ajoute un disjoncteur avec libellé et calibre, puis le sélectionne', async () => {
    const server = createServer();
    renderEditor();
    const dialog = await openSlot(SLOT_5);

    const submit = within(dialog).getByRole('button', { name: 'Ajouter au module 5' });
    expect(submit).toBeDisabled(); // le libellé est obligatoire

    await userEvent.type(within(dialog).getByLabelText('Libellé'), 'Prises garage');
    await userEvent.click(within(dialog).getByRole('button', { name: '20' }));
    await userEvent.click(submit);

    expect(await screen.findByRole('region', { name: 'Prises garage' })).toBeInTheDocument();
    expect(server.writes()[0]).toMatchObject({
      method: 'POST',
      body: { position: 4, width: 1, kind: 'breaker', label: 'Prises garage', ratingA: 20 },
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      '« Prises garage » ajouté : module 5.',
    );
    expect(screen.queryByRole('dialog', { name: 'Ajouter un appareil' })).not.toBeInTheDocument();
  });

  it('borne la largeur à l’espace disponible', async () => {
    createServer();
    renderEditor();
    const dialog = await openSlot(SLOT_5);

    const more = within(dialog).getByRole('button', { name: 'Augmenter : Largeur' });
    await userEvent.click(more);
    expect(within(dialog).getByRole('status')).toHaveTextContent('2');
    expect(more).toBeDisabled();
  });

  it('pose un différentiel sur 2 modules avec son calibre', async () => {
    const server = createServer();
    renderEditor();
    const dialog = await openSlot(SLOT_5);

    await userEvent.click(within(dialog).getByRole('button', { name: /Différentiel · 2/ }));
    await userEvent.type(within(dialog).getByLabelText('Libellé'), 'Différentiel 40 A');
    await userEvent.click(within(dialog).getByRole('button', { name: '40' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter au module 5' }));

    await waitFor(() => expect(server.writes()).toHaveLength(1));
    expect(server.writes()[0]!.body).toMatchObject({ kind: 'rcd', width: 2, ratingA: 40 });
  });

  it('accepte une réserve sans libellé', async () => {
    const server = createServer();
    renderEditor();
    const dialog = await openSlot(SLOT_6);

    await userEvent.click(within(dialog).getByRole('button', { name: /Réserve · 1/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter au module 6' }));

    await waitFor(() => expect(server.writes()).toHaveLength(1));
    expect(server.writes()[0]!.body).toMatchObject({ kind: 'spare', label: 'Réserve' });
  });

  it('crée un appareil personnalisé avec ses champs', async () => {
    const server = createServer();
    renderEditor();
    const dialog = await openSlot(SLOT_5);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Autre appareil…' }));
    await userEvent.type(within(dialog).getByLabelText('Nom'), 'Borne de recharge');
    await userEvent.type(within(dialog).getByLabelText('Rôle'), 'Voiture électrique');
    await userEvent.type(within(dialog).getByLabelText('Marque'), 'Wallbox');
    await userEvent.type(within(dialog).getByLabelText('Modèle / référence'), 'Pulsar');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter au module 5' }));

    await waitFor(() => expect(server.writes()).toHaveLength(1));
    expect(server.writes()[0]!.body).toMatchObject({
      kind: 'custom',
      label: 'Borne de recharge',
      role: 'Voiture électrique',
      brand: 'Wallbox',
      model: 'Pulsar',
    });
    expect(server.writes().some((c) => c.url === '/api/custom-models')).toBe(false); // pas enregistré
  });

  it('enregistre le modèle dans le compte quand on le demande', async () => {
    const server = createServer();
    renderEditor();
    const dialog = await openSlot(SLOT_5);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Autre appareil…' }));
    await userEvent.type(within(dialog).getByLabelText('Nom'), 'Alarme');
    await userEvent.click(
      within(dialog).getByLabelText('Enregistrer comme modèle réutilisable dans mon compte'),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter au module 5' }));

    await waitFor(() => expect(server.writes()).toHaveLength(2));
    expect(server.writes()[0]).toMatchObject({
      url: '/api/custom-models',
      body: { label: 'Alarme', width: 1 },
    });
    expect(server.writes()[1]!.url).toMatch(/\/elements$/);
  });

  it('réutilise un modèle enregistré, et permet de le supprimer', async () => {
    const server = createServer({
      models: [
        {
          id: ID(701),
          label: 'Borne VE',
          role: 'Recharge',
          brand: 'Wallbox',
          model: 'Pulsar',
          width: 2,
        },
      ],
    });
    renderEditor();
    const dialog = await openSlot(SLOT_5);

    const chip = await within(dialog).findByRole('button', { name: 'Borne VE · 2' });
    await userEvent.click(chip);
    expect(within(dialog).getByLabelText('Nom')).toHaveValue('Borne VE');
    expect(within(dialog).getByLabelText('Marque')).toHaveValue('Wallbox');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer ce modèle' }));
    await waitFor(() =>
      expect(
        server.calls.some((c) => c.method === 'DELETE' && c.url.includes('custom-models')),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        within(dialog).queryByRole('button', { name: 'Borne VE · 2' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('ajoute une photo facultative', async () => {
    const server = createServer();
    renderEditor();
    const dialog = await openSlot(SLOT_5);

    await userEvent.type(within(dialog).getByLabelText('Libellé'), 'Prises garage');
    await userEvent.upload(
      within(dialog).getByLabelText("Fichier : Photo de l'appareil"),
      new File([new Uint8Array([1])], 'p.jpg', { type: 'image/jpeg' }),
    );
    await within(dialog).findByRole('img', { name: "Photo de l'appareil" });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter au module 5' }));

    await waitFor(() =>
      expect(server.writes().some((c) => c.url.endsWith('/elements'))).toBe(true),
    );
    const post = server.writes().find((c) => c.url.endsWith('/elements'))!;
    expect(post.body).toMatchObject({ photoId: ID(900) });
    expect(server.calls.some((c) => c.url.includes('/photos?usage=element'))).toBe(true);
  });

  it('annule puis rétablit un ajout', async () => {
    const server = createServer();
    renderEditor();
    const dialog = await openSlot(SLOT_5);
    await userEvent.type(within(dialog).getByLabelText('Libellé'), 'Prises garage');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter au module 5' }));
    await screen.findByRole('region', { name: 'Prises garage' });

    await userEvent.click(undoButton());
    await waitFor(() =>
      expect(server.elements.some((e) => e.label === 'Prises garage')).toBe(false),
    );
    expect(server.writes().at(-1)).toMatchObject({ method: 'DELETE' });

    await userEvent.click(redoButton());
    await waitFor(() =>
      expect(server.elements.some((e) => e.label === 'Prises garage')).toBe(true),
    );
    expect(server.writes().filter((c) => c.method === 'POST')).toHaveLength(2);
  });

  it('signale un refus du serveur sans rien ajouter', async () => {
    createServer({ rejectCreate: true });
    renderEditor();
    const dialog = await openSlot(SLOT_5);
    await userEvent.type(within(dialog).getByLabelText('Libellé'), 'Prises garage');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter au module 5' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('refusé cette modification');
    expect(screen.queryByRole('button', { name: /^Prises garage/ })).not.toBeInTheDocument();
  });

  it('ferme l’ajout avec Annuler sans rien envoyer', async () => {
    const server = createServer();
    renderEditor();
    const dialog = await openSlot(SLOT_5);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(server.writes()).toHaveLength(0);
  });
});

describe('mode bureau', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('min-width: 1024px'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
  });

  /** DataTransfer minimal : jsdom n'en fournit pas. */
  const transfer = () => {
    const store = new Map<string, string>();
    return {
      setData: (type: string, value: string) => void store.set(type, value),
      getData: (type: string) => store.get(type) ?? '',
      get types() {
        return [...store.keys()];
      },
      effectAllowed: 'all',
      dropEffect: 'none',
    };
  };
  const slot = (n: number) =>
    screen.getByRole('button', { name: `Rangée 1, module libre ${n}, ajouter un appareil` });

  it('affiche la sidebar avec le badge, la palette et la barre d’outils', async () => {
    createServer();
    renderEditor();
    const nav = await screen.findByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByRole('link', { name: /Tableaux/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await within(nav).findByLabelText('1 à vérifier')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /Onglets|Navigation mobile/ })).toBeNull();

    expect(screen.getByRole('region', { name: 'Ajouter sur le rail' })).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Outils du tableau' })).toBeInTheDocument();
  });

  it('montre la fiche dans un panneau latéral, pas dans une feuille', async () => {
    createServer();
    renderEditor();
    await select(/^Four/);
    const panel = await screen.findByRole('region', { name: 'Four' });
    expect(within(panel).getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('déplace un appareil par glisser-déposer sur un module libre', async () => {
    const server = createServer();
    renderEditor();
    const plaques = await screen.findByRole('button', { name: /^Plaques/ });
    const data = transfer();
    fireEvent.dragStart(plaques, { dataTransfer: data });
    fireEvent.dragOver(slot(5), { dataTransfer: data });
    expect(data.dropEffect).toBe('move');
    fireEvent.drop(slot(5), { dataTransfer: data });

    await waitFor(() =>
      expect(server.writes().at(-1)).toMatchObject({ method: 'PATCH', body: { position: 4 } }),
    );
  });

  it('ajoute un type de la palette déposé sur un module libre', async () => {
    const server = createServer();
    renderEditor();
    const palette = await screen.findByRole('region', { name: 'Ajouter sur le rail' });
    const chip = within(palette).getByRole('button', { name: /^Différentiel/ });
    const data = transfer();
    fireEvent.dragStart(chip, { dataTransfer: data });
    // Le navigateur refuse le dépôt si l'effet annoncé ne correspond pas à l'effet permis (copie).
    fireEvent.dragOver(slot(9), { dataTransfer: data });
    expect(data.dropEffect).toBe('copy');
    fireEvent.drop(slot(9), { dataTransfer: data });

    await waitFor(() =>
      expect(server.writes().at(-1)).toMatchObject({
        method: 'POST',
        body: { position: 8, width: 2, kind: 'rcd', label: 'Différentiel' },
      }),
    );
  });

  it('arme un type de la palette puis l’ajoute d’un clic sur un module libre', async () => {
    const server = createServer();
    renderEditor();
    const palette = await screen.findByRole('region', { name: 'Ajouter sur le rail' });
    await userEvent.click(within(palette).getByRole('button', { name: /^Disjoncteur/ }));
    await userEvent.click(slot(9));
    await waitFor(() =>
      expect(server.writes().at(-1)).toMatchObject({
        method: 'POST',
        body: { position: 8, width: 1, kind: 'breaker' },
      }),
    );
  });

  it('cherche dans le tableau et sélectionne le premier résultat', async () => {
    createServer();
    renderEditor();
    const input = await screen.findByLabelText('Rechercher dans ce tableau');
    await userEvent.type(input, 'plaq');
    expect(await screen.findByText('1 appareil')).toBeInTheDocument();
    await userEvent.type(input, '{Enter}');
    expect(await screen.findByRole('region', { name: 'Plaques' })).toBeInTheDocument();
  });

  it('ne propose pas la palette à un lecteur', async () => {
    createServer({ role: 'viewer' });
    renderEditor();
    await screen.findByRole('button', { name: /^Plaques/ });
    expect(screen.queryByRole('region', { name: 'Ajouter sur le rail' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Annuler/ })).toBeNull();
  });
});
