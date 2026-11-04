import { describe, expect, it, vi } from 'vitest';
import {
  AnalysisError,
  createAnthropicAnalyzer,
  OUTPUT_JSON_SCHEMA,
  parseModelOutput,
} from './analyzer';

const element = (overrides: Record<string, unknown> = {}) => ({
  position: 0,
  width: 1,
  kind: 'breaker',
  label: 'Prises cuisine',
  ratingA: 20,
  poles: null,
  curve: 'C',
  sensitivityMa: null,
  rcdType: null,
  brand: null,
  model: null,
  confidence: 'high',
  ...overrides,
});

const output = (elements: unknown[] = [element()]) =>
  JSON.stringify({
    rows: [{ index: 0, elements }],
    detectedGeometry: { rowCount: 2, modulesPerRow: 24 },
    remarks: ['Rangée du bas partiellement masquée'],
  });

describe('parseModelOutput', () => {
  it('convertit les champs null en champs absents', () => {
    const { rows, detectedGeometry, remarks } = parseModelOutput(output());
    expect(rows[0]!.elements[0]).toMatchObject({ kind: 'breaker', ratingA: 20, curve: 'C' });
    expect(rows[0]!.elements[0]!.poles).toBeUndefined();
    expect(detectedGeometry).toEqual({ rowCount: 2, modulesPerRow: 24 });
    expect(remarks).toHaveLength(1);
  });

  it('ignore un champ facultatif invalide sans perdre l’appareil', () => {
    const { rows } = parseModelOutput(output([element({ curve: 'Z', ratingA: -4 })]));
    expect(rows[0]!.elements[0]).toMatchObject({ kind: 'breaker', label: 'Prises cuisine' });
    expect(rows[0]!.elements[0]!.curve).toBeUndefined();
    expect(rows[0]!.elements[0]!.ratingA).toBeUndefined();
  });

  it('écarte un appareil au type inconnu sans rejeter les autres', () => {
    const { rows } = parseModelOutput(
      output([element({ kind: 'flux-capacitor' }), element({ position: 3 })]),
    );
    expect(rows[0]!.elements.map((e) => e.position)).toEqual([3]);
  });

  it('abaisse la confiance inconnue à « low »', () => {
    const { rows } = parseModelOutput(output([element({ confidence: 'certain' })]));
    expect(rows[0]!.elements[0]!.confidence).toBe('low');
  });

  it('rejette une réponse qui n’est pas du JSON ou qui n’a pas la bonne forme', () => {
    expect(() => parseModelOutput('désolé')).toThrow(AnalysisError);
    expect(() => parseModelOutput(JSON.stringify({ rows: 'non' }))).toThrow(AnalysisError);
  });
});

describe('OUTPUT_JSON_SCHEMA', () => {
  it('liste le type de chaque champ requis de l’appareil', () => {
    const required = OUTPUT_JSON_SCHEMA.properties.rows.items.properties.elements.items.required;
    expect(required).toContain('kind');
    expect(required).toContain('confidence');
  });
});

describe('createAnthropicAnalyzer', () => {
  const input = {
    image: Buffer.from('image'),
    mimeType: 'image/webp' as const,
    rowCount: 2,
    modulesPerRow: 24,
  };
  const analyzerWith = (create: () => unknown) =>
    createAnthropicAnalyzer({
      apiKey: 'test',
      model: 'test-model',
      client: { messages: { create } } as never,
    });

  it('envoie l’image et le schéma, et renvoie la proposition avec les jetons', async () => {
    const create = vi.fn(async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: output() }],
      usage: { input_tokens: 1200, output_tokens: 300 },
    }));
    const result = await analyzerWith(create).analyze(input);

    expect(result).toMatchObject({ inputTokens: 1200, outputTokens: 300 });
    const [body] = create.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(body).toMatchObject({
      model: 'test-model',
      output_config: { format: { type: 'json_schema' } },
    });
    expect((body.messages as { content: unknown[] }[])[0]!.content[0]).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/webp' },
    });
  });

  it.each([
    ['un refus', { stop_reason: 'refusal', content: [], usage: {} }],
    ['une réponse tronquée', { stop_reason: 'max_tokens', content: [], usage: {} }],
    ['une réponse vide', { stop_reason: 'end_turn', content: [], usage: {} }],
  ])('échoue proprement sur %s', async (_label, response) => {
    await expect(analyzerWith(async () => response).analyze(input)).rejects.toBeInstanceOf(
      AnalysisError,
    );
  });

  it('enveloppe une erreur réseau sans relayer son message', async () => {
    const analyzer = analyzerWith(async () => {
      throw new Error('boom contenant la clé sk-secret');
    });
    const error = await analyzer.analyze(input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnalysisError);
    expect((error as Error).message).not.toContain('sk-secret');
  });
});
