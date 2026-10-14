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
const NOW = '2026-10-14T10:00:00.000Z';
const USER = { id: ID(1), email: 'martial@racomach.fr', displayName: 'Martial' };
const PROPERTY_ID = ID(101);
const BOARD_ID = ID(201);
const audit = { createdAt: NOW, updatedAt: NOW, updatedBy: ID(1), version: 1 };

const property = {
  ...audit,
  id: PROPERTY_ID,
  name: 'Maison des Lilas',
  address: null,
  notes: null,
  role: 'owner',
};

const element = (
  n: number,
  rowId: string,
  position: number,
  width: number,
  kind: string,
  label: string,
) => ({
  ...audit,
  id: ID(500 + n),
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
});

function makeBoard(overrides: Record<string, unknown> = {}) {
  const row = (index: number, elements: unknown[], used: number) => ({
    ...audit,
    id: ID(300 + index),
    boardId: BOARD_ID,
    index,
    capacity: 24,
    used,
    elements,
  });
  return {
    ...audit,
    id: BOARD_ID,
    propertyId: PROPERTY_ID,
    name: 'Tableau principal',
    location: 'Garage',
    photoId: null,
    rowCount: 3,
    modulesPerRow: 24,
    notes: 'Coffret refait en 2019.',
    lastModified: { at: NOW, by: 'Martial' },
    rows: [
      row(
        0,
        [
          element(1, ID(300), 0, 2, 'rcd', 'Différentiel 40 A'),
          element(2, ID(300), 16, 2, 'surge_protector', 'Parafoudre'),
        ],
        4,
      ),
      row(1, [element(3, ID(301), 0, 4, 'breaker', 'Cuisine')], 4),
      row(2, [], 0),
    ],
    ...overrides,
  };
}

interface Handlers {
  board?: ReturnType<typeof makeBoard>;
  patch?: (body: Record<string, unknown>) => Response;
  impact?: Record<string, unknown>;
  upload?: () => Response;
}

function mockServer(h: Handlers = {}) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const board = h.board ?? makeBoard();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      let body: unknown;
      if (typeof init?.body === 'string') body = JSON.parse(init.body);
      calls.push({ method, url, body });

      if (url === '/api/me') return json(USER);
      if (url === '/api/properties' && method === 'GET') return json([property]);
      if (url === `/api/properties/${PROPERTY_ID}/boards` && method === 'GET') return json([]);
      if (url === `/api/properties/${PROPERTY_ID}/overview`) {
        return json({
          boardCount: 1,
          reliability: { total: 0, verified: 0, assumed: 0, unknown: 0 },
          lastModified: null,
        });
      }
      if (url === `/api/properties/${PROPERTY_ID}/boards` && method === 'POST') {
        return json({ ...makeBoard({ id: ID(299), ...(body as object) }), rows: [] }, 201);
      }
      if (url === `/api/boards/${BOARD_ID}` && method === 'GET') return json(board);
      if (url === `/api/boards/${BOARD_ID}` && method === 'PATCH') {
        return h.patch
          ? h.patch(body as Record<string, unknown>)
          : json({ ...board, ...(body as object), version: 2 });
      }
      if (url === `/api/boards/${BOARD_ID}` && method === 'DELETE')
        return new Response(null, { status: 204 });
      if (url === `/api/boards/${BOARD_ID}/impact`) {
        return json(
          h.impact ?? {
            rowCount: 3,
            elementCount: 31,
            hasPhoto: true,
            fixtureCount: 52,
            fixturesToUnlink: 14,
          },
        );
      }
      if (url === `/api/boards/${BOARD_ID}/duplicate`) {
        return json(makeBoard({ id: ID(298), name: (body as { name: string }).name }), 201);
      }
      if (url.startsWith(`/api/properties/${PROPERTY_ID}/photos`)) {
        return h.upload
          ? h.upload()
          : json(
              {
                ...audit,
                id: ID(900),
                propertyId: PROPERTY_ID,
                usage: 'board',
                mimeType: 'image/webp',
                width: 10,
                height: 10,
                sizeBytes: 10,
                contentUrl: `/api/photos/${ID(900)}/content`,
              },
              201,
            );
      }
      if (url.startsWith('/api/photos/') && method === 'DELETE')
        return new Response(null, { status: 204 });
      throw new Error(`appel inattendu : ${method} ${url}`);
    }),
  );
  return calls;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderAt(path: string) {
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

const settings = () => renderAt(`/tableaux/${BOARD_ID}/parametres`);
const modulesDown = () => screen.getByRole('button', { name: 'Diminuer : Modules par rangée' });
const rowsDown = () => screen.getByRole('button', { name: 'Diminuer : Rangées' });
const save = () => screen.getByRole('button', { name: 'Enregistrer' });

beforeEach(() => {
  window.localStorage.clear();
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
  // jsdom n'implémente pas la navigation déclenchée par le clic sur le lien de téléchargement.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('création', () => {
  it('propose les valeurs par défaut et crée le tableau dans le logement actif', async () => {
    const calls = mockServer();
    renderAt('/tableaux/nouveau');

    expect(await screen.findByRole('heading', { name: 'Nouveau tableau' })).toBeInTheDocument();
    expect(screen.getByText('Maison des Lilas')).toBeInTheDocument();

    const submit = screen.getByRole('button', { name: 'Créer le tableau' });
    expect(submit).toBeDisabled();
    // Pas de duplication ni de suppression avant que le tableau existe.
    expect(screen.queryByRole('heading', { name: 'Dupliquer ce tableau' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Supprimer le tableau' })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Nom'), 'Tableau garage');
    await userEvent.type(screen.getByLabelText('Emplacement'), 'Garage');
    await userEvent.click(screen.getByRole('button', { name: 'Augmenter : Modules par rangée' }));
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/tableaux/'));
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/boards'))!;
    expect(post.body).toEqual({
      name: 'Tableau garage',
      location: 'Garage',
      notes: null,
      photoId: null,
      rowCount: 3,
      modulesPerRow: 25,
    });
  });

  it('exige un nom', async () => {
    mockServer();
    renderAt('/tableaux/nouveau');
    const name = await screen.findByLabelText('Nom');
    await userEvent.click(name);
    await userEvent.tab();
    expect(screen.getByText('Le nom du tableau est obligatoire.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer le tableau' })).toBeDisabled();
  });
});

describe('modification', () => {
  it('pré-remplit le formulaire et n’active « Enregistrer » qu’après un changement', async () => {
    mockServer();
    settings();

    expect(await screen.findByLabelText('Nom')).toHaveValue('Tableau principal');
    expect(screen.getByLabelText('Emplacement')).toHaveValue('Garage');
    expect(screen.getByLabelText('Notes')).toHaveValue('Coffret refait en 2019.');
    expect(save()).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Nom'), ' bis');
    expect(save()).toBeEnabled();
  });

  it('enregistre avec la version courante et retourne sur le tableau', async () => {
    const calls = mockServer();
    settings();
    await screen.findByLabelText('Nom');

    await userEvent.clear(screen.getByLabelText('Emplacement'));
    await userEvent.type(screen.getByLabelText('Emplacement'), 'Cave');
    await userEvent.click(save());

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(`/tableaux/${BOARD_ID}`),
    );
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.body).toMatchObject({
      location: 'Cave',
      version: 1,
      rowCount: 3,
      modulesPerRow: 24,
    });
  });

  it('affiche l’occupation actuelle de chaque rangée', async () => {
    mockServer();
    settings();
    const list = await screen.findByRole('list', { name: 'Occupation actuelle' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Rangée 1');
    expect(items[0]).toHaveTextContent('18 / 24');
    expect(items[1]).toHaveTextContent('4 / 24');
    expect(items[2]).toHaveTextContent('0 / 24');
  });
});

describe('réduction sous l’occupation', () => {
  it('refuse, cite la rangée, le minimum et l’élément, et bloque l’enregistrement', async () => {
    mockServer();
    settings();
    await screen.findByLabelText('Nom');

    // 24 → 17 : le parafoudre occupe les positions 17–18.
    for (let i = 0; i < 7; i++) await userEvent.click(modulesDown());

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Impossible de descendre sous 18 modules.');
    expect(alert).toHaveTextContent('La rangée 1 en occupe 18');
    expect(alert).toHaveTextContent('« Parafoudre » en position 17–18');

    const stepper = screen.getByRole('group', { name: 'Modules par rangée' });
    expect(stepper).toHaveAttribute('aria-invalid', 'true');
    expect(stepper).toHaveAccessibleDescription(/Impossible de descendre sous 18 modules/);
    expect(save()).toBeDisabled();
  });

  it('accepte exactement le minimum', async () => {
    mockServer();
    settings();
    await screen.findByLabelText('Nom');

    for (let i = 0; i < 6; i++) await userEvent.click(modulesDown()); // 24 → 18
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it('refuse de retirer une rangée qui contient des éléments', async () => {
    mockServer();
    settings();
    await screen.findByLabelText('Nom');

    // Rangées : 3 → 2 est permis (la rangée 3 est vide), 2 → 1 ne l'est pas.
    await userEvent.click(rowsDown());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(rowsDown());

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Impossible de descendre sous 2 rangées.');
    expect(alert).toHaveTextContent('La rangée 2 contient 1 élément');
    expect(save()).toBeDisabled();
  });

  it('montre un aperçu où l’élément fautif est signalé', async () => {
    mockServer();
    settings();
    await screen.findByLabelText('Nom');

    for (let i = 0; i < 8; i++) await userEvent.click(modulesDown()); // 24 → 16
    const preview = screen.getByRole('region', { name: 'Aperçu à 16 modules' });
    expect(preview).toHaveTextContent('Rangée 1');
    expect(preview).toHaveTextContent('18 / 16 — dépasse');
    expect(preview).toHaveTextContent('Zone hachurée');
  });

  it('un retour à une valeur valide retire le message', async () => {
    mockServer();
    settings();
    await screen.findByLabelText('Nom');

    for (let i = 0; i < 7; i++) await userEvent.click(modulesDown());
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Augmenter : Modules par rangée' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(save()).toBeEnabled();
  });
});

describe('échecs à l’enregistrement', () => {
  it('signale un conflit de version et propose de recharger', async () => {
    mockServer({
      patch: () =>
        json({ code: 'version_conflict', message: 'Modifié', details: makeBoard() }, 409),
    });
    settings();
    await screen.findByLabelText('Nom');

    await userEvent.type(screen.getByLabelText('Nom'), ' bis');
    await userEvent.click(save());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ce tableau a été modifié depuis son ouverture');
    expect(within(alert).getByRole('button', { name: 'Recharger' })).toBeInTheDocument();
  });

  it('signale un refus du serveur', async () => {
    mockServer({
      patch: () =>
        json(
          { code: 'capacity_below_content', message: 'x', details: { rowIndex: 0, minimum: 18 } },
          422,
        ),
    });
    settings();
    await screen.findByLabelText('Nom');

    await userEvent.type(screen.getByLabelText('Nom'), ' bis');
    await userEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'le serveur a refusé'.replace('le', 'Le'),
    );
  });

  it('signale une erreur réseau sans perdre la saisie', async () => {
    mockServer();
    settings();
    await screen.findByLabelText('Nom');
    await userEvent.type(screen.getByLabelText('Nom'), ' bis');

    const original = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await userEvent.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent('Serveur injoignable');
    expect(screen.getByLabelText('Nom')).toHaveValue('Tableau principal bis');
    vi.stubGlobal('fetch', original);
  });
});

describe('photo', () => {
  const file = () => new File([new Uint8Array([1, 2, 3])], 'coffret.jpg', { type: 'image/jpeg' });

  it('envoie la photo, l’affiche et la rattache à l’enregistrement', async () => {
    const calls = mockServer();
    settings();
    await screen.findByLabelText('Nom');

    await userEvent.upload(screen.getByLabelText('Fichier de la photo du tableau'), file());
    const image = await screen.findByRole('img', { name: 'Photo du tableau' });
    expect(image).toHaveAttribute('src', `/api/photos/${ID(900)}/content`);
    expect(calls.some((c) => c.url.includes('/photos?usage=board'))).toBe(true);

    await userEvent.click(save());
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')).toBeDefined());
    expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ photoId: ID(900) });
  });

  it('explique un format refusé', async () => {
    mockServer({ upload: () => json({ code: 'unsupported_format', message: 'x' }, 415) });
    settings();
    await screen.findByLabelText('Nom');

    await userEvent.upload(screen.getByLabelText('Fichier de la photo du tableau'), file());
    expect(await screen.findByText(/JPEG, PNG ou WebP/)).toBeInTheDocument();
  });

  it('supprime la photo envoyée si le formulaire est abandonné', async () => {
    const calls = mockServer();
    settings();
    await screen.findByLabelText('Nom');

    await userEvent.upload(screen.getByLabelText('Fichier de la photo du tableau'), file());
    await screen.findByRole('img', { name: 'Photo du tableau' });
    await userEvent.click(screen.getAllByRole('button', { name: 'Annuler' })[0]!);

    await waitFor(() =>
      expect(calls.some((c) => c.method === 'DELETE' && c.url === `/api/photos/${ID(900)}`)).toBe(
        true,
      ),
    );
  });
});

describe('duplication', () => {
  it('propose « <nom> (copie) », crée la copie avec le nom choisi et l’ouvre', async () => {
    const calls = mockServer();
    settings();
    await screen.findByLabelText('Nom');

    const field = screen.getByLabelText('Nom de la copie');
    expect(field).toHaveValue('Tableau principal (copie)');

    await userEvent.clear(field);
    await userEvent.type(field, 'Sauvegarde');
    await userEvent.click(screen.getByRole('button', { name: 'Créer la copie' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(`/tableaux/${ID(298)}/parametres`),
    );
    expect(calls.find((c) => c.url.endsWith('/duplicate'))!.body).toEqual({ name: 'Sauvegarde' });
  });
});

describe('suppression', () => {
  async function openDelete() {
    mockServer();
    settings();
    await screen.findByLabelText('Nom');
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer le tableau…' }));
    return screen.findByRole('dialog', { name: 'Supprimer « Tableau principal » ?' });
  }

  it('liste ce qui est supprimé et ce qui est conservé', async () => {
    const dialog = await openDelete();
    expect(await within(dialog).findByText(/3 rangées et 31 éléments du rail/)).toBeInTheDocument();
    expect(within(dialog).getByText('La photo du tableau')).toBeInTheDocument();
    expect(within(dialog).getByText(/Les équipements du plan \(52\)/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/14 équipements deviendront « à identifier »/),
    ).toBeInTheDocument();
  });

  it('exige la saisie du nom avant d’activer le bouton', async () => {
    const dialog = await openDelete();
    const button = within(dialog).getByRole('button', { name: 'Supprimer définitivement' });
    expect(button).toBeDisabled();

    const input = within(dialog).getByLabelText('Saisissez le nom du tableau pour confirmer');
    await userEvent.type(input, 'Tableau princip');
    expect(button).toBeDisabled();
    await userEvent.type(input, 'al');
    expect(button).toBeEnabled();
  });

  it('supprime puis retourne à la liste', async () => {
    const dialog = await openDelete();
    await userEvent.type(
      within(dialog).getByLabelText('Saisissez le nom du tableau pour confirmer'),
      'Tableau principal',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer définitivement' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/tableaux'));
    expect(screen.getByTestId('location')).not.toHaveTextContent(BOARD_ID);
  });

  it('propose l’export JSON avant la suppression', async () => {
    const dialog = await openDelete();
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Exporter ce tableau avant/ }),
    );
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  });

  it('annule sans rien supprimer', async () => {
    const dialog = await openDelete();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(`/tableaux/${BOARD_ID}/parametres`);
  });
});

describe('liste et accès', () => {
  it('affiche « introuvable » pour un tableau inconnu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/me') return json(USER);
        if (url === '/api/properties') return json([property]);
        return json({ code: 'not_found', message: 'x' }, 404);
      }),
    );
    settings();
    expect(await screen.findByText('Ce tableau est introuvable.')).toBeInTheDocument();
  });
});
