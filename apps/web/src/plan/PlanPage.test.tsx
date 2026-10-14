import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { SessionProvider } from '../auth/session';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PROPERTY_ID = ID(101);
const NOW = '2026-10-14T10:00:00.000Z';
const audit = { createdAt: NOW, updatedAt: NOW, updatedBy: ID(1), version: 1 };

interface Floor {
  id: string;
  index: number;
  name: string;
  width: number;
  height: number;
  backgroundImageId: string | null;
  backgroundOpacity: number;
  backgroundX: number;
  backgroundY: number;
  backgroundScale: number;
  backgroundLocked: boolean;
  version: number;
  background: { width: number; height: number } | null;
}
interface Room {
  id: string;
  floorId: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  version: number;
}
interface Fixture {
  id: string;
  roomId: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  notes: string | null;
  photoId: string | null;
  version: number;
  link: { breakerId: string | null; status: string } | null;
}

const BREAKER = ID(400);

function seed() {
  const floors: Floor[] = [
    {
      id: ID(201),
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
      version: 1,
      background: null,
    },
    {
      id: ID(202),
      index: 1,
      name: 'Étage',
      width: 1000,
      height: 700,
      backgroundImageId: null,
      backgroundOpacity: 1,
      backgroundX: 0,
      backgroundY: 0,
      backgroundScale: 1,
      backgroundLocked: false,
      version: 1,
      background: null,
    },
  ];
  const rooms: Room[] = [
    { id: ID(301), floorId: ID(201), name: 'Cuisine', x: 100, y: 100, w: 300, h: 200, version: 1 },
    { id: ID(302), floorId: ID(201), name: 'Salon', x: 500, y: 100, w: 300, h: 200, version: 1 },
    { id: ID(303), floorId: ID(202), name: 'Chambre', x: 100, y: 100, w: 300, h: 200, version: 1 },
  ];
  const fixtures: Fixture[] = [
    {
      id: ID(501),
      roomId: ID(301),
      kind: 'socket',
      label: 'Prise plan de travail',
      x: 150,
      y: 150,
      notes: null,
      photoId: null,
      version: 1,
      link: { breakerId: BREAKER, status: 'verified' },
    },
    {
      id: ID(502),
      roomId: ID(301),
      kind: 'light',
      label: 'Plafonnier',
      x: 300,
      y: 200,
      notes: null,
      photoId: null,
      version: 1,
      link: { breakerId: ID(401), status: 'assumed' },
    },
    {
      id: ID(503),
      roomId: ID(302),
      kind: 'socket',
      label: 'Prise mystère',
      x: 600,
      y: 150,
      notes: null,
      photoId: null,
      version: 1,
      link: null,
    },
    {
      id: ID(504),
      roomId: ID(303),
      kind: 'light',
      label: 'Applique',
      x: 200,
      y: 200,
      notes: null,
      photoId: null,
      version: 1,
      link: null,
    },
  ];
  return { floors, rooms, fixtures };
}

type State = ReturnType<typeof seed>;

function createServer(
  options: { role?: 'owner' | 'viewer'; empty?: boolean; withBackground?: boolean } = {},
) {
  const state: State = options.empty ? { floors: [], rooms: [], fixtures: [] } : seed();
  if (options.withBackground) {
    Object.assign(state.floors[0]!, {
      backgroundImageId: ID(900),
      background: { width: 2000, height: 1400 },
      backgroundScale: 0.5,
      backgroundOpacity: 0.6,
    });
  }
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  let seq = 0;

  const planBody = () => ({
    breakers: [
      {
        id: BREAKER,
        label: 'Prises cuisine',
        ratingA: 16,
        boardId: ID(1),
        boardName: 'Tableau principal',
        rowIndex: 0,
        position: 3,
        linkedCount: 1,
        photoId: null,
      },
      {
        id: ID(401),
        label: 'Éclairage RDC',
        ratingA: 10,
        boardId: ID(1),
        boardName: 'Tableau principal',
        rowIndex: 0,
        position: 4,
        linkedCount: 1,
        photoId: null,
      },
    ],
    floors: state.floors
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((f) => {
        const floorRooms = state.rooms.filter((r) => r.floorId === f.id);
        const ids = new Set(floorRooms.map((r) => r.id));
        return {
          ...audit,
          ...f,
          propertyId: PROPERTY_ID,
          rooms: floorRooms.map((r) => ({ ...audit, ...r })),
          fixtures: state.fixtures
            .filter((x) => ids.has(x.roomId))
            .map((x) => ({ ...audit, ...x })),
        };
      }),
  });

  const entity = <T extends { version: number }>(e: T) => ({ ...audit, ...e });

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
          ...audit,
          id: PROPERTY_ID,
          name: 'Maison',
          address: null,
          notes: null,
          role: options.role ?? 'owner',
        },
      ]);
    }
    if (url === `/api/properties/${PROPERTY_ID}/plan`) return json(planBody());
    if (url === `/api/properties/${PROPERTY_ID}/overview`) {
      return json({
        boardCount: 0,
        reliability: { total: 0, verified: 0, assumed: 0, unknown: 0 },
        lastModified: null,
      });
    }

    if (url === `/api/properties/${PROPERTY_ID}/floors` && method === 'POST') {
      const floor: Floor = {
        id: ID(250 + ++seq),
        index: state.floors.length,
        name: body!.name as string,
        width: 1000,
        height: 700,
        backgroundImageId: null,
        backgroundOpacity: 1,
        backgroundX: 0,
        backgroundY: 0,
        backgroundScale: 1,
        backgroundLocked: false,
        version: 1,
        background: null,
      };
      state.floors.push(floor);
      return json({ ...audit, ...floor, propertyId: PROPERTY_ID }, 201);
    }
    if (url === `/api/properties/${PROPERTY_ID}/floors/order` && method === 'PUT') {
      (body!.ids as string[]).forEach((id, index) => {
        state.floors.find((f) => f.id === id)!.index = index;
      });
      return json(state.floors.map((f) => ({ ...audit, ...f, propertyId: PROPERTY_ID })));
    }
    let m = url.match(/^\/api\/floors\/([^/]+)$/);
    if (m && method === 'PATCH') {
      const floor = state.floors.find((f) => f.id === m![1])!;
      const change = { ...body! };
      delete change.version;
      Object.assign(floor, change);
      floor.version += 1;
      return json({ ...audit, ...floor, propertyId: PROPERTY_ID });
    }
    if (m && method === 'DELETE') {
      const id = m[1];
      state.floors = state.floors.filter((f) => f.id !== id);
      state.rooms = state.rooms.filter((r) => r.floorId !== id);
      return new Response(null, { status: 204 });
    }
    m = url.match(/^\/api\/floors\/([^/]+)\/rooms$/);
    if (m && method === 'POST') {
      const room: Room = {
        id: ID(350 + ++seq),
        floorId: m[1]!,
        name: body!.name as string,
        x: body!.x as number,
        y: body!.y as number,
        w: body!.w as number,
        h: body!.h as number,
        version: 1,
      };
      state.rooms.push(room);
      return json(entity(room), 201);
    }
    m = url.match(/^\/api\/rooms\/([^/]+)$/);
    if (m && method === 'PATCH') {
      const room = state.rooms.find((r) => r.id === m![1])!;
      const before = { ...room };
      const change = { ...body! };
      delete change.version;
      Object.assign(room, change);
      room.version += 1;
      // Le serveur déplace les équipements avec leur pièce.
      for (const f of state.fixtures.filter((x) => x.roomId === room.id)) {
        f.x += room.x - before.x;
        f.y += room.y - before.y;
      }
      return json(entity(room));
    }
    if (m && method === 'DELETE') {
      state.rooms = state.rooms.filter((r) => r.id !== m![1]);
      state.fixtures = state.fixtures.filter((f) => f.roomId !== m![1]);
      return new Response(null, { status: 204 });
    }
    m = url.match(/^\/api\/rooms\/([^/]+)\/fixtures$/);
    if (m && method === 'POST') {
      const fixture: Fixture = {
        id: ID(550 + ++seq),
        roomId: m[1]!,
        kind: body!.kind as string,
        label: body!.label as string,
        x: body!.x as number,
        y: body!.y as number,
        notes: null,
        photoId: null,
        version: 1,
        link: null,
      };
      state.fixtures.push(fixture);
      return json(entity(fixture), 201);
    }
    m = url.match(/^\/api\/fixtures\/([^/]+)\/link$/);
    if (m && method === 'PUT') {
      const fixture = state.fixtures.find((f) => f.id === m![1])!;
      fixture.link = { breakerId: body!.breakerId as string, status: body!.status as string };
      return json(entity(fixture));
    }
    if (m && method === 'DELETE') {
      const fixture = state.fixtures.find((f) => f.id === m![1])!;
      fixture.link = null;
      return json(entity(fixture));
    }
    m = url.match(/^\/api\/fixtures\/([^/]+)$/);
    if (m && method === 'PATCH') {
      const fixture = state.fixtures.find((f) => f.id === m![1])!;
      const change = { ...body! };
      delete change.version;
      Object.assign(fixture, change);
      fixture.version += 1;
      return json(entity(fixture));
    }
    if (m && method === 'DELETE') {
      state.fixtures = state.fixtures.filter((f) => f.id !== m![1]);
      return new Response(null, { status: 204 });
    }
    if (url.startsWith(`/api/properties/${PROPERTY_ID}/photos`)) {
      return json(
        {
          ...audit,
          id: ID(900),
          propertyId: PROPERTY_ID,
          usage: 'floor_background',
          mimeType: 'image/webp',
          width: 2000,
          height: 1400,
          sizeBytes: 10,
          contentUrl: `/api/photos/${ID(900)}/content`,
        },
        201,
      );
    }
    throw new Error(`appel inattendu : ${method} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    state,
    calls,
    writes: () => calls.filter((c) => c.method !== 'GET'),
    lastWrite: () => calls.filter((c) => c.method !== 'GET').at(-1),
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderPlan(search = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/plan${search}`]}>
        <SessionProvider>
          <AppRoutes />
          <LocationProbe />
        </SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const canvas = async () => (await screen.findByRole('application')) as unknown as SVGSVGElement;

beforeEach(() => {
  window.localStorage.clear();
  // jsdom ne fait aucune mise en page : le canevas mesure 1000 × 700 px, soit 1 px par unité de plan.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1000,
    bottom: 700,
    width: 1000,
    height: 700,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('affichage', () => {
  it('propose de créer le premier étage quand le plan est vide', async () => {
    const server = createServer({ empty: true });
    renderPlan();

    expect(
      await screen.findByRole('heading', { name: 'Dessinez le plan de votre logement' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Créer le premier étage' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel étage' });
    expect(within(dialog).getByLabelText('Nom de l’étage')).toHaveValue('Rez-de-chaussée');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Créer l’étage' }));

    await waitFor(() =>
      expect(server.writes()[0]).toMatchObject({
        method: 'POST',
        body: { name: 'Rez-de-chaussée' },
      }),
    );
    expect(
      await screen.findByRole('tab', { name: 'Rez-de-chaussée', selected: true }),
    ).toBeInTheDocument();
  });

  it('affiche les onglets d’étages, les pièces, les équipements et la légende', async () => {
    createServer();
    renderPlan();

    expect(await screen.findByRole('tab', { name: 'RDC', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Étage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pièce Cuisine' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pièce Salon' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pièce Chambre' })).not.toBeInTheDocument();

    const legend = screen.getByRole('list', { name: 'Légende' });
    expect(legend).toHaveTextContent('Ce circuit');
    expect(legend).toHaveTextContent('Autre circuit');
    expect(legend).toHaveTextContent('À identifier (1)');
  });

  it('change d’étage', async () => {
    createServer();
    renderPlan();
    await userEvent.click(await screen.findByRole('tab', { name: 'Étage' }));
    expect(screen.getByRole('button', { name: 'Pièce Chambre' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pièce Cuisine' })).not.toBeInTheDocument();
  });

  it('distingue ce circuit, un autre circuit et un équipement à identifier', async () => {
    createServer();
    renderPlan(`?breaker=${BREAKER}`);

    const banner = await screen.findByText(/Prises cuisine · 16 A/);
    expect(banner.closest('[role=status]')).toHaveTextContent('1 équipement');

    expect(
      screen.getByRole('button', { name: /Prise plan de travail.*sur le circuit sélectionné/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Plafonnier.*sur un autre circuit/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Prise mystère.*disjoncteur à identifier/ }),
    ).toBeInTheDocument();
  });

  it('retire la mise en évidence du circuit', async () => {
    createServer();
    renderPlan(`?breaker=${BREAKER}`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Retirer la mise en évidence du circuit' }),
    );
    expect(screen.getByTestId('location')).not.toHaveTextContent('breaker=');
    expect(screen.queryByText(/Prises cuisine · 16 A/)).not.toBeInTheDocument();
  });

  it('sélectionne un équipement indiqué dans l’adresse, sur le bon étage', async () => {
    createServer();
    renderPlan(`?fixture=${ID(504)}`);
    expect(await screen.findByRole('region', { name: 'Applique' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Étage', selected: true })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('fixture='));
  });
});

describe('équipement sélectionné', () => {
  async function open(label: RegExp) {
    await userEvent.click(await screen.findByRole('button', { name: label }));
    return screen.findByRole('region', { name: /Prise plan de travail|Plafonnier|Prise mystère/ });
  }

  it('montre son disjoncteur et son statut, et mène au circuit', async () => {
    createServer();
    renderPlan();
    const sheet = await open(/Prise plan de travail/);
    expect(sheet).toHaveTextContent('Prises cuisine · 16 A');
    expect(sheet).toHaveTextContent('Vérifiée');

    await userEvent.click(within(sheet).getByRole('button', { name: 'Voir le circuit' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`breaker=${BREAKER}`);
  });

  it('indique « à identifier » quand il n’a pas de disjoncteur', async () => {
    createServer();
    renderPlan();
    const sheet = await open(/Prise mystère/);
    expect(sheet).toHaveTextContent('Disjoncteur à identifier');
  });

  it('le renomme à la validation', async () => {
    const server = createServer();
    renderPlan();
    const sheet = await open(/Plafonnier/);
    const field = within(sheet).getByLabelText('Libellé');
    await userEvent.clear(field);
    await userEvent.type(field, 'Suspension{Enter}');

    await waitFor(() =>
      expect(server.lastWrite()).toMatchObject({
        method: 'PATCH',
        body: { label: 'Suspension', version: 1 },
      }),
    );
    expect(await screen.findByRole('button', { name: /Suspension/ })).toBeInTheDocument();
  });

  it('change son type', async () => {
    const server = createServer();
    renderPlan();
    const sheet = await open(/Prise plan de travail/);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Appareil dédié' }));
    await waitFor(() => expect(server.lastWrite()!.body).toMatchObject({ kind: 'appliance' }));
  });

  it('le déplace par petits pas, sans sortir de la pièce', async () => {
    const server = createServer();
    renderPlan();
    const sheet = await open(/Prise plan de travail/); // x 150, y 150
    await userEvent.click(within(sheet).getByRole('button', { name: 'Déplacer à droite' }));
    await waitFor(() => expect(server.lastWrite()!.body).toMatchObject({ x: 160, y: 150 }));

    // En haut à gauche de la pièce (100, 100) : un pas de plus vers le haut est ramené au bord.
    for (let i = 0; i < 6; i++)
      await userEvent.click(within(sheet).getByRole('button', { name: 'Déplacer vers le haut' }));
    await waitFor(() => expect(server.lastWrite()!.body!.y).toBe(100));
  });

  it('le supprime après confirmation', async () => {
    const server = createServer();
    renderPlan();
    const sheet = await open(/Prise mystère/);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Supprimer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Supprimer « Prise mystère » ?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer l’équipement' }));

    await waitFor(() => expect(server.lastWrite()).toMatchObject({ method: 'DELETE' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Prise mystère/ })).not.toBeInTheDocument(),
    );
  });
});

describe('liaison avec un disjoncteur', () => {
  async function open(label: RegExp) {
    await userEvent.click(await screen.findByRole('button', { name: label }));
    return screen.findByRole('region', { name: /Prise plan de travail|Plafonnier|Prise mystère/ });
  }

  it('relie un équipement à identifier au disjoncteur choisi, à confirmer', async () => {
    const server = createServer();
    renderPlan();
    const sheet = await open(/Prise mystère/);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Choisir le disjoncteur' }));

    const picker = await screen.findByRole('dialog', { name: 'Quel disjoncteur l’alimente ?' });
    await userEvent.click(within(picker).getByRole('button', { name: /Prises cuisine · 16 A/ }));

    await waitFor(() =>
      expect(server.writes().at(-1)).toMatchObject({
        method: 'PUT',
        url: `/api/fixtures/${ID(503)}/link`,
        body: { breakerId: BREAKER, status: 'assumed' },
      }),
    );
    await waitFor(() => expect(sheet).toHaveTextContent('Supposée'));
    expect(sheet).toHaveTextContent('Prises cuisine · 16 A');
  });

  it('filtre les disjoncteurs par libellé', async () => {
    createServer();
    renderPlan();
    const sheet = await open(/Prise mystère/);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Choisir le disjoncteur' }));
    const picker = await screen.findByRole('dialog', { name: 'Quel disjoncteur l’alimente ?' });

    await userEvent.type(within(picker).getByLabelText('Filtrer'), 'eclairage');
    expect(within(picker).getByRole('button', { name: /Éclairage RDC/ })).toBeInTheDocument();
    expect(
      within(picker).queryByRole('button', { name: /Prises cuisine/ }),
    ).not.toBeInTheDocument();
  });

  it('change le statut d’une liaison, par exemple après l’avoir testée', async () => {
    const server = createServer();
    renderPlan();
    const sheet = await open(/Plafonnier/);
    expect(sheet).toHaveTextContent('Supposée');

    await userEvent.click(within(sheet).getByRole('button', { name: 'Vérifiée' }));
    await waitFor(() =>
      expect(server.writes().at(-1)).toMatchObject({
        method: 'PUT',
        body: { breakerId: ID(401), status: 'verified' },
      }),
    );
  });

  it('délie un équipement : il repasse à identifier', async () => {
    const server = createServer();
    renderPlan();
    const sheet = await open(/Prise plan de travail/);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Délier' }));

    await waitFor(() =>
      expect(server.writes().at(-1)).toMatchObject({
        method: 'DELETE',
        url: `/api/fixtures/${ID(501)}/link`,
      }),
    );
    await waitFor(() => expect(sheet).toHaveTextContent('Disjoncteur à identifier'));
    expect(within(sheet).queryByRole('button', { name: 'Délier' })).not.toBeInTheDocument();
  });

  it('ne propose pas de lier à un lecteur', async () => {
    createServer({ role: 'viewer' });
    renderPlan();
    const sheet = await open(/Prise plan de travail/);
    expect(sheet).toHaveTextContent('Prises cuisine · 16 A');
    expect(within(sheet).queryByRole('button', { name: 'Délier' })).not.toBeInTheDocument();
    expect(
      within(sheet).queryByRole('button', { name: 'Changer de disjoncteur' }),
    ).not.toBeInTheDocument();
    // Il peut en revanche voir le circuit.
    expect(within(sheet).getByRole('button', { name: 'Voir le circuit' })).toBeInTheDocument();
  });

  it('indique, depuis une pièce, les disjoncteurs à couper', async () => {
    createServer();
    renderPlan();
    await userEvent.click(await screen.findByRole('button', { name: 'Pièce Cuisine' }));
    const sheet = await screen.findByRole('region', { name: 'Cuisine' });
    expect(sheet).toHaveTextContent('À couper pour cette pièce');

    await userEvent.click(within(sheet).getByRole('button', { name: /Éclairage RDC · 10 A/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(`breaker=${ID(401)}`);
  });

  it('signale les équipements d’une pièce sans disjoncteur', async () => {
    createServer();
    renderPlan();
    await userEvent.click(await screen.findByRole('tab', { name: 'Étage' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Pièce Chambre' }));
    const sheet = await screen.findByRole('region', { name: 'Chambre' });
    expect(sheet).toHaveTextContent('Aucun disjoncteur identifié');
    expect(sheet).toHaveTextContent('1 équipement à identifier');
  });
});

describe('ajout d’équipements', () => {
  it('ajoute au centre de la pièce sélectionnée depuis la palette', async () => {
    const server = createServer();
    renderPlan();
    await userEvent.click(await screen.findByRole('button', { name: 'Pièce Salon' }));
    await userEvent.click(screen.getByRole('button', { name: 'Équipement' }));

    const palette = await screen.findByRole('dialog', { name: 'Ajouter un équipement' });
    // Au clavier : Entrée ajoute directement.
    within(palette).getByRole('button', { name: 'Point lumineux' }).focus();
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(server.lastWrite()).toMatchObject({ method: 'POST' }));
    expect(server.lastWrite()!.url).toBe(`/api/rooms/${ID(302)}/fixtures`);
    expect(server.lastWrite()!.body).toMatchObject({
      kind: 'light',
      x: 650,
      y: 200,
      label: 'Point lumineux 1',
    });
    expect(await screen.findByRole('region', { name: 'Point lumineux 1' })).toBeInTheDocument();
  });

  it('un appui sur un type de la palette ajoute aussi', async () => {
    const server = createServer();
    renderPlan();
    await userEvent.click(await screen.findByRole('button', { name: 'Équipement' }));
    const palette = await screen.findByRole('dialog', { name: 'Ajouter un équipement' });

    const item = within(palette).getByRole('button', { name: 'Prise' });
    fireEvent.pointerDown(item, { clientX: 50, clientY: 50, pointerId: 1 });
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 50, clientY: 50 }));

    await waitFor(() => expect(server.lastWrite()).toMatchObject({ method: 'POST' }));
    // Pas de pièce active : la première pièce de l'étage reçoit l'équipement.
    expect(server.lastWrite()!.url).toBe(`/api/rooms/${ID(301)}/fixtures`);
  });

  it('dépose un équipement glissé depuis la palette dans la pièce visée', async () => {
    const server = createServer();
    renderPlan();
    await canvas();
    await userEvent.click(screen.getByRole('button', { name: 'Équipement' }));
    const palette = await screen.findByRole('dialog', { name: 'Ajouter un équipement' });

    const item = within(palette).getByRole('button', { name: 'Appareil dédié' });
    fireEvent.pointerDown(item, { clientX: 20, clientY: 20, pointerId: 1 });
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, clientY: 400 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 650, clientY: 220 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 650, clientY: 220 }));

    await waitFor(() => expect(server.lastWrite()).toMatchObject({ method: 'POST' }));
    expect(server.lastWrite()!.url).toBe(`/api/rooms/${ID(302)}/fixtures`); // Salon
    expect(server.lastWrite()!.body).toMatchObject({ kind: 'appliance', x: 650, y: 220 });
  });

  it('refuse un dépôt hors de toute pièce', async () => {
    const server = createServer();
    renderPlan();
    await canvas();
    await userEvent.click(screen.getByRole('button', { name: 'Équipement' }));
    const palette = await screen.findByRole('dialog', { name: 'Ajouter un équipement' });

    fireEvent.pointerDown(within(palette).getByRole('button', { name: 'Prise' }), {
      clientX: 20,
      clientY: 20,
      pointerId: 1,
    });
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 900, clientY: 600 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 900, clientY: 600 }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Déposez l’équipement à l’intérieur d’une pièce',
    );
    expect(server.writes()).toHaveLength(0);
  });

  it('demande de dessiner une pièce quand l’étage n’en a pas', async () => {
    const server = createServer();
    server.state.rooms = [];
    server.state.fixtures = [];
    renderPlan();
    expect(
      await screen.findByText(/Aucune pièce : choisissez « Dessiner une pièce »/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Équipement' }));
    const palette = await screen.findByRole('dialog', { name: 'Ajouter un équipement' });
    within(palette).getByRole('button', { name: 'Prise' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Dessinez d’abord une pièce');
    expect(server.writes()).toHaveLength(0);
  });
});

describe('gestes sur le plan', () => {
  it('déplace un équipement par glisser-déposer dans une autre pièce', async () => {
    const server = createServer();
    renderPlan();
    const svg = await canvas();
    const fixture = screen.getByRole('button', { name: /Plafonnier/ }); // (300, 200) dans Cuisine

    fireEvent.pointerDown(fixture, { clientX: 300, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 500, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 700, clientY: 180, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 700, clientY: 180, pointerId: 1 });

    await waitFor(() => expect(server.lastWrite()).toMatchObject({ method: 'PATCH' }));
    expect(server.lastWrite()!.url).toBe(`/api/fixtures/${ID(502)}`);
    expect(server.lastWrite()!.body).toMatchObject({ x: 700, y: 180, roomId: ID(302), version: 1 });
  });

  it('refuse de poser un équipement hors des pièces', async () => {
    const server = createServer();
    renderPlan();
    const svg = await canvas();
    const fixture = screen.getByRole('button', { name: /Plafonnier/ });

    fireEvent.pointerDown(fixture, { clientX: 300, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 900, clientY: 600, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 900, clientY: 600, pointerId: 1 });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Déposez l’équipement à l’intérieur d’une pièce',
    );
    expect(server.writes()).toHaveLength(0);
  });

  it('un simple appui sélectionne sans rien envoyer', async () => {
    const server = createServer();
    renderPlan();
    const svg = await canvas();
    const fixture = screen.getByRole('button', { name: /Plafonnier/ });

    fireEvent.pointerDown(fixture, { clientX: 300, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 300, clientY: 200, pointerId: 1 });

    expect(await screen.findByRole('region', { name: 'Plafonnier' })).toBeInTheDocument();
    expect(server.writes()).toHaveLength(0);
  });

  it('déplace une pièce, et ses équipements la suivent', async () => {
    const server = createServer();
    renderPlan();
    const svg = await canvas();
    const room = screen.getByRole('button', { name: 'Pièce Cuisine' });

    fireEvent.pointerDown(room, { clientX: 200, clientY: 250, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 250, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 250, clientY: 300, pointerId: 1 });

    await waitFor(() => expect(server.lastWrite()).toMatchObject({ method: 'PATCH' }));
    expect(server.lastWrite()!.body).toMatchObject({ x: 150, y: 150, w: 300, h: 200 });
    // Après relecture, les équipements ont suivi.
    await waitFor(() => expect(server.state.fixtures.find((f) => f.id === ID(501))!.x).toBe(200));
  });

  it('redimensionne une pièce par une poignée', async () => {
    const server = createServer();
    renderPlan();
    const svg = await canvas();
    await userEvent.click(screen.getByRole('button', { name: 'Pièce Cuisine' }));

    // Poignée bas-droite : (400, 300).
    const handles = svg.querySelectorAll('g[role=presentation]');
    expect(handles).toHaveLength(4);
    const se = handles[3]!;
    fireEvent.pointerDown(se, { clientX: 400, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 480, clientY: 340, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 480, clientY: 340, pointerId: 1 });

    await waitFor(() => expect(server.lastWrite()).toMatchObject({ method: 'PATCH' }));
    expect(server.lastWrite()!.body).toMatchObject({ x: 100, y: 100, w: 380, h: 240 });
  });

  it('dessine une pièce, la nomme et la crée', async () => {
    const server = createServer();
    renderPlan();
    const svg = await canvas();
    await userEvent.click(screen.getByRole('button', { name: 'Dessiner une pièce' }));

    fireEvent.pointerDown(svg.querySelector('rect')!, { clientX: 100, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 300, clientY: 550, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 300, clientY: 550, pointerId: 1 });

    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle pièce' });
    const name = within(dialog).getByLabelText('Nom de la pièce');
    expect(name).toHaveValue('Pièce 3');
    await userEvent.clear(name);
    await userEvent.type(name, 'Garage');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Créer la pièce' }));

    await waitFor(() => expect(server.lastWrite()).toMatchObject({ method: 'POST' }));
    expect(server.lastWrite()!.url).toBe(`/api/floors/${ID(201)}/rooms`);
    expect(server.lastWrite()!.body).toEqual({ name: 'Garage', x: 100, y: 400, w: 200, h: 150 });
    expect(await screen.findByRole('button', { name: 'Pièce Garage' })).toBeInTheDocument();
  });

  it('refuse une pièce trop petite', async () => {
    const server = createServer();
    renderPlan();
    const svg = await canvas();
    await userEvent.click(screen.getByRole('button', { name: 'Dessiner une pièce' }));

    fireEvent.pointerDown(svg.querySelector('rect')!, { clientX: 100, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 110, clientY: 410, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 110, clientY: 410, pointerId: 1 });

    expect(await screen.findByRole('alert')).toHaveTextContent('Pièce trop petite');
    expect(server.writes()).toHaveLength(0);
  });
});

describe('pièce sélectionnée', () => {
  it('se renomme, se redimensionne par pas, et se supprime avec ses équipements', async () => {
    const server = createServer();
    renderPlan();
    await userEvent.click(await screen.findByRole('button', { name: 'Pièce Cuisine' }));
    const sheet = await screen.findByRole('region', { name: 'Cuisine' });
    expect(sheet).toHaveAccessibleDescription('2 équipements');

    const name = within(sheet).getByLabelText('Nom de la pièce');
    await userEvent.clear(name);
    await userEvent.type(name, 'Cuisine ouverte{Enter}');
    await waitFor(() =>
      expect(server.lastWrite()!.body).toMatchObject({ name: 'Cuisine ouverte' }),
    );

    await userEvent.click(
      within(sheet).getByRole('button', { name: 'Augmenter : Largeur de la pièce' }),
    );
    await waitFor(() => expect(server.lastWrite()!.body).toMatchObject({ w: 310 }));

    await userEvent.click(within(sheet).getByRole('button', { name: 'Supprimer' }));
    const dialog = await screen.findByRole('dialog', { name: /Supprimer « Cuisine ouverte »/ });
    expect(dialog).toHaveTextContent('2 équipement(s) de cette pièce seront supprimés');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer la pièce' }));
    await waitFor(() => expect(server.lastWrite()).toMatchObject({ method: 'DELETE' }));
  });
});

describe('réglages de l’étage', () => {
  it('renomme l’étage et change l’ordre des onglets', async () => {
    const server = createServer();
    renderPlan();
    await userEvent.click(await screen.findByRole('button', { name: 'Réglages de l’étage' }));
    const dialog = await screen.findByRole('dialog', { name: 'Réglages de l’étage' });

    const name = within(dialog).getByLabelText('Nom de l’étage');
    await userEvent.clear(name);
    await userEvent.type(name, 'Rez-de-chaussée{Enter}');
    await waitFor(() =>
      expect(server.lastWrite()!.body).toMatchObject({ name: 'Rez-de-chaussée' }),
    );

    expect(within(dialog).getByRole('button', { name: 'Avant' })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Après' }));
    await waitFor(() => expect(server.lastWrite()).toMatchObject({ method: 'PUT' }));
    expect(server.lastWrite()!.body).toEqual({ ids: [ID(202), ID(201)] });
  });

  it('importe une image de fond, cadrée dans le plan', async () => {
    const server = createServer();
    renderPlan();
    await userEvent.click(await screen.findByRole('button', { name: 'Réglages de l’étage' }));
    const dialog = await screen.findByRole('dialog', { name: 'Réglages de l’étage' });

    await userEvent.upload(
      within(dialog).getByLabelText('Fichier : Image de fond'),
      new File([new Uint8Array([1])], 'plan.jpg', { type: 'image/jpeg' }),
    );
    await waitFor(() => expect(server.lastWrite()).toMatchObject({ method: 'PATCH' }));
    // 2000 × 1400 dans 1000 × 700 : échelle 0,5.
    expect(server.lastWrite()!.body).toMatchObject({
      backgroundImageId: ID(900),
      backgroundScale: 0.5,
      backgroundX: 0,
      backgroundY: 0,
      backgroundLocked: false,
    });
  });

  it('règle l’opacité et verrouille l’image', async () => {
    const server = createServer({ withBackground: true });
    renderPlan();
    await userEvent.click(await screen.findByRole('button', { name: 'Réglages de l’étage' }));
    const dialog = await screen.findByRole('dialog', { name: 'Réglages de l’étage' });

    fireEvent.change(within(dialog).getByLabelText('Opacité'), { target: { value: '30' } });
    await waitFor(
      () => expect(server.lastWrite()!.body).toMatchObject({ backgroundOpacity: 0.3 }),
      { timeout: 2000 },
    );

    await userEvent.click(within(dialog).getByLabelText(/Verrouiller l’image/));
    await waitFor(() => expect(server.lastWrite()!.body).toMatchObject({ backgroundLocked: true }));
  });

  it('déplace l’image en la faisant glisser quand elle est déverrouillée', async () => {
    const server = createServer({ withBackground: true });
    renderPlan();
    const svg = await canvas();
    expect(screen.getByTestId('plan-background')).toBeInTheDocument();

    fireEvent.pointerDown(svg.querySelector('rect')!, { clientX: 50, clientY: 600, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 90, clientY: 640, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 90, clientY: 640, pointerId: 1 });

    await waitFor(() =>
      expect(server.lastWrite()!.body).toMatchObject({ backgroundX: 40, backgroundY: 40 }),
    );
  });

  it('ne déplace pas l’image verrouillée', async () => {
    const server = createServer({ withBackground: true });
    Object.assign(server.state.floors[0]!, { backgroundLocked: true });
    renderPlan();
    const svg = await canvas();

    fireEvent.pointerDown(svg.querySelector('rect')!, { clientX: 50, clientY: 600, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 90, clientY: 640, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 90, clientY: 640, pointerId: 1 });

    expect(server.writes()).toHaveLength(0);
  });

  it('supprime un étage après avoir annoncé ce qu’il contient', async () => {
    const server = createServer();
    renderPlan();
    await userEvent.click(await screen.findByRole('button', { name: 'Réglages de l’étage' }));
    const dialog = await screen.findByRole('dialog', { name: 'Réglages de l’étage' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer l’étage…' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('2 pièces et 3 équipements');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer l’étage' }));

    await waitFor(() => expect(server.lastWrite()).toMatchObject({ method: 'DELETE' }));
    expect(await screen.findByRole('tab', { name: 'Étage', selected: true })).toBeInTheDocument();
  });
});

describe('droits', () => {
  it('ne propose aucune modification à un lecteur', async () => {
    createServer({ role: 'viewer' });
    renderPlan();
    await screen.findByRole('tab', { name: 'RDC' });

    expect(screen.queryByRole('button', { name: 'Équipement' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dessiner une pièce' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter un étage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réglages de l’étage' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Plafonnier/ }));
    const sheet = await screen.findByRole('region', { name: 'Plafonnier' });
    expect(within(sheet).queryByLabelText('Libellé')).not.toBeInTheDocument();
  });
});
