import type { Board } from '@tableau-clair/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhotoImportSheet } from './PhotoImportSheet';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BOARD_ID = ID(201);
const audit = {
  createdAt: '2026-10-27T10:00:00.000Z',
  updatedAt: '2026-10-27T10:00:00.000Z',
  updatedBy: ID(1),
  version: 1,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const quota = (used: number) => ({
  enabled: true,
  limit: 3,
  used,
  remaining: 3 - used,
  resetsAt: '2026-10-27T23:00:00.000Z',
});

const board = {
  ...audit,
  id: BOARD_ID,
  propertyId: ID(101),
  name: 'Tableau principal',
  location: null,
  photoId: null,
  rowCount: 1,
  modulesPerRow: 12,
  notes: null,
  lastModified: null,
  rows: [
    {
      ...audit,
      id: ID(300),
      boardId: BOARD_ID,
      index: 0,
      capacity: 12,
      used: 1,
      elements: [{ id: ID(500), position: 1, width: 1 }],
    },
  ],
} as unknown as Board;

const proposed = (position: number, label: string, conflict: 'overlap' | null = null) => ({
  position,
  width: 1,
  kind: 'breaker',
  label,
  ratingA: 16,
  confidence: position === 3 ? 'low' : 'high',
  conflict,
});

const analysis = {
  analysisId: ID(900),
  rows: [
    {
      index: 0,
      elements: [proposed(0, 'Éclairage'), proposed(1, 'Prises', 'overlap'), proposed(3, 'Four')],
    },
  ],
  detectedGeometry: null,
  remarks: ['Photo un peu sombre'],
  quota: quota(1),
};

let calls: { url: string; method: string; body: string | null }[];
let analysisResponse: () => Response;

beforeEach(() => {
  calls = [];
  analysisResponse = () => json(analysis);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? 'GET', body: (init.body as string) ?? null });
      if (url === '/api/ai/quota') return json(quota(0));
      if (url.endsWith('/photo-analysis')) return analysisResponse();
      if (url.endsWith('/elements/bulk')) return json({ elements: [] }, 201);
      return json({}, 404);
    }),
  );
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderSheet(onImported = vi.fn(), onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <PhotoImportSheet board={board} open onClose={onClose} onImported={onImported} />
    </QueryClientProvider>,
  );
  return { ...view, onImported, onClose };
}

const photo = () => new File(['x'], 'tableau.jpg', { type: 'image/jpeg' });
const fileInput = () =>
  document.body.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;

async function chooseAndAnalyze(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText(/il vous reste 3 analyses/i);
  await user.upload(fileInput(), photo());
  await user.click(screen.getByRole('button', { name: /analyser \(1 sur 3/i }));
}

describe('PhotoImportSheet', () => {
  it('annonce le quota et attend une photo avant d’analyser', async () => {
    renderSheet();
    expect(await screen.findByText(/il vous reste 3 analyses aujourd’hui/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^analyser/i })).toBeDisabled();
    expect(screen.getByText(/envoyée à anthropic/i)).toBeInTheDocument();
  });

  it('désactive l’analyse quand le quota du jour est épuisé', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) =>
      url === '/api/ai/quota' ? json(quota(3)) : json({}, 404),
    );
    const user = userEvent.setup();
    renderSheet();
    await user.upload(fileInput(), photo());
    expect(await screen.findByText(/limite atteinte \(3 analyses par jour\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^analyser/i })).toBeDisabled();
  });

  it('propose les appareils, décoche ceux en conflit et n’ajoute que la sélection', async () => {
    const user = userEvent.setup();
    const { onImported } = renderSheet();
    await chooseAndAnalyze(user);

    expect(
      await screen.findByRole('heading', { name: /vérifiez la proposition/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Photo un peu sombre')).toBeInTheDocument();
    expect(screen.getByText('À vérifier')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /ajouter « prises »/i })).not.toBeChecked();
    expect(screen.getByText(/chevauche un autre appareil/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /ajouter 2 appareils/i }));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(2));

    const bulk = calls.find((c) => c.url.endsWith('/elements/bulk'))!;
    expect(bulk.method).toBe('POST');
    const sent = JSON.parse(bulk.body!) as { elements: { label: string; rowIndex: number }[] };
    expect(sent.elements.map((e) => e.label)).toEqual(['Éclairage', 'Four']);
  });

  it('recalcule les conflits quand on corrige une position', async () => {
    const user = userEvent.setup();
    renderSheet();
    await chooseAndAnalyze(user);
    await screen.findByRole('heading', { name: /vérifiez la proposition/i });

    await user.click(screen.getByRole('checkbox', { name: /ajouter « prises »/i }));
    // Coché alors que le module 2 est occupé : le conflit retire l'appareil du lot.
    expect(screen.getByRole('button', { name: /ajouter 2 appareils/i })).toBeInTheDocument();
    expect(screen.getByText(/chevauche un autre appareil/i)).toBeInTheDocument();

    const module = screen.getAllByLabelText('Module')[1]!;
    await user.clear(module);
    await user.type(module, '6');
    expect(screen.getByRole('button', { name: /ajouter 3 appareils/i })).toBeInTheDocument();
  });

  it('revient au choix de la photo avec un message rassurant quand l’analyse échoue', async () => {
    analysisResponse = () =>
      json({ code: 'analysis_failed', message: 'x', details: quota(0) }, 502);
    const user = userEvent.setup();
    renderSheet();
    await chooseAndAnalyze(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/pas décomptée/i);
    expect(screen.getByRole('button', { name: /^analyser/i })).toBeEnabled();
  });

  it('signale l’absence d’appareil reconnu', async () => {
    analysisResponse = () => json({ ...analysis, rows: [], remarks: [] });
    const user = userEvent.setup();
    renderSheet();
    await chooseAndAnalyze(user);

    expect(await screen.findByText(/n’avons reconnu aucun appareil/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /aucun appareil à ajouter/i })).toBeDisabled();
  });
});
