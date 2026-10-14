import {
  CURVES,
  ELEMENT_KINDS,
  PHOTO_USAGES,
  RCD_TYPES,
  ROLES,
  VERIFICATIONS,
} from '@tableau-clair/domain';
import { z } from 'zod';

// --- Limites -------------------------------------------------------------------------------------------

export const LIMITS = {
  maxBoardRows: 12,
  maxModulesPerRow: 48,
  maxNameLength: 120,
  maxTextLength: 2000,
} as const;

const name = z.string().trim().min(1).max(LIMITS.maxNameLength);
const text = z.string().trim().max(LIMITS.maxTextLength);
/** Champ texte facultatif : `null` efface la valeur. */
const optionalText = text.nullable().optional();

// --- Erreurs ------------------------------------------------------------------------------------------------

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

// --- Champs communs --------------------------------------------------------------------------------------

/** Présents sur toutes les entités (spec §5). */
const auditFields = {
  id: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string().uuid().nullable(),
  /** À renvoyer à la modification : en cas de décalage, l'API répond 409. */
  version: z.number().int().positive(),
};

const versioned = { version: z.number().int().positive() };

// --- Logements -------------------------------------------------------------------------------------------------

export const roleSchema = z.enum(ROLES);

export const propertySchema = z.object({
  ...auditFields,
  name: z.string(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  /** Rôle de l'utilisateur courant sur ce logement. */
  role: roleSchema,
});
export type Property = z.infer<typeof propertySchema>;

export const createPropertySchema = z.object({
  name,
  address: optionalText,
  notes: optionalText,
});
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = z
  .object({ name: name.optional(), address: optionalText, notes: optionalText, ...versioned })
  .strict();
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

// --- Éléments ----------------------------------------------------------------------------------------------------

export const elementKindSchema = z.enum(ELEMENT_KINDS);

const elementEditable = {
  label: name,
  role: optionalText,
  brand: optionalText,
  model: optionalText,
  notes: optionalText,
  photoId: z.string().uuid().nullable().optional(),
  outgoingCables: z.number().int().min(0).max(99).nullable().optional(),
  /** Section des câbles sortants, en mm². */
  cableSection: z.number().positive().max(999).nullable().optional(),
  ratingA: z.number().int().positive().max(1000).nullable().optional(),
  poles: z.number().int().min(1).max(4).nullable().optional(),
  curve: z.enum(CURVES).nullable().optional(),
  sensitivityMa: z.number().int().positive().max(10_000).nullable().optional(),
  rcdType: z.enum(RCD_TYPES).nullable().optional(),
  protectedByRcdId: z.string().uuid().nullable().optional(),
};

export const elementSchema = z.object({
  ...auditFields,
  rowId: z.string().uuid(),
  position: z.number().int().min(0),
  width: z.number().int().min(1),
  kind: elementKindSchema,
  label: z.string(),
  role: z.string().nullable(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  notes: z.string().nullable(),
  photoId: z.string().uuid().nullable(),
  outgoingCables: z.number().int().nullable(),
  cableSection: z.number().nullable(),
  ratingA: z.number().int().nullable(),
  poles: z.number().int().nullable(),
  curve: z.enum(CURVES).nullable(),
  sensitivityMa: z.number().int().nullable(),
  rcdType: z.enum(RCD_TYPES).nullable(),
  protectedByRcdId: z.string().uuid().nullable(),
});
export type Element = z.infer<typeof elementSchema>;

export const createElementSchema = z
  .object({
    position: z.number().int().min(0),
    width: z.number().int().min(1),
    kind: elementKindSchema,
    ...elementEditable,
  })
  .strict();
export type CreateElementInput = z.infer<typeof createElementSchema>;

export const updateElementSchema = z
  .object({
    /** Déplacement vers une autre rangée du même tableau. */
    rowId: z.string().uuid().optional(),
    position: z.number().int().min(0).optional(),
    width: z.number().int().min(1).optional(),
    kind: elementKindSchema.optional(),
    ...partialEditable(),
    ...versioned,
  })
  .strict();
export type UpdateElementInput = z.infer<typeof updateElementSchema>;

function partialEditable() {
  return { ...elementEditable, label: name.optional() };
}

// --- Rangées -------------------------------------------------------------------------------------------------------

export const rowSchema = z.object({
  ...auditFields,
  boardId: z.string().uuid(),
  index: z.number().int().min(0),
  capacity: z.number().int().min(1),
  /** Modules occupés, réserves comprises. */
  used: z.number().int().min(0),
  elements: z.array(elementSchema),
});
export type Row = z.infer<typeof rowSchema>;

export const updateRowSchema = z
  .object({ capacity: z.number().int().min(1).max(LIMITS.maxModulesPerRow), ...versioned })
  .strict();
export type UpdateRowInput = z.infer<typeof updateRowSchema>;

// --- Tableaux ----------------------------------------------------------------------------------------------------------

const boardFields = {
  ...auditFields,
  propertyId: z.string().uuid(),
  name: z.string(),
  location: z.string().nullable(),
  photoId: z.string().uuid().nullable(),
  rowCount: z.number().int(),
  modulesPerRow: z.number().int(),
  notes: z.string().nullable(),
};

/** Tableau avec sa composition complète : rangées et éléments. */
export const boardSchema = z.object({ ...boardFields, rows: z.array(rowSchema) });
export type Board = z.infer<typeof boardSchema>;

/** Tableau en liste : sans le détail des éléments. */
export const boardSummarySchema = z.object({
  ...boardFields,
  usedModules: z.number().int(),
  totalModules: z.number().int(),
});
export type BoardSummary = z.infer<typeof boardSummarySchema>;

export const createBoardSchema = z
  .object({
    name,
    location: optionalText,
    photoId: z.string().uuid().nullable().optional(),
    rowCount: z.number().int().min(1).max(LIMITS.maxBoardRows),
    modulesPerRow: z.number().int().min(1).max(LIMITS.maxModulesPerRow),
    notes: optionalText,
  })
  .strict();
export type CreateBoardInput = z.infer<typeof createBoardSchema>;

export const updateBoardSchema = z
  .object({
    name: name.optional(),
    location: optionalText,
    photoId: z.string().uuid().nullable().optional(),
    rowCount: z.number().int().min(1).max(LIMITS.maxBoardRows).optional(),
    modulesPerRow: z.number().int().min(1).max(LIMITS.maxModulesPerRow).optional(),
    notes: optionalText,
    ...versioned,
  })
  .strict();
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;

// --- Photos et images de plan -----------------------------------------------------------------------------

export const PHOTO_LIMITS = {
  /** Taille maximale du fichier envoyé, avant réduction. */
  maxUploadBytes: 15 * 1024 * 1024,
} as const;

export const photoUsageSchema = z.enum(PHOTO_USAGES);

export const photoSchema = z.object({
  ...auditFields,
  propertyId: z.string().uuid(),
  usage: photoUsageSchema,
  mimeType: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  sizeBytes: z.number().int(),
  /** Adresse de lecture : redirige vers une URL signée après contrôle des droits. */
  contentUrl: z.string(),
});
export type Photo = z.infer<typeof photoSchema>;

// --- Vue d'ensemble d'un logement et recherche ---------------------------------------------------------------

export const verificationSchema = z.enum(VERIFICATIONS);

export const overviewSchema = z.object({
  boardCount: z.number().int(),
  /** Fiabilité du repérage : un équipement sans disjoncteur compte comme « inconnu ». */
  reliability: z.object({
    total: z.number().int(),
    verified: z.number().int(),
    assumed: z.number().int(),
    unknown: z.number().int(),
  }),
  /** Dernière modification de n'importe quel élément du logement. */
  lastModified: z
    .object({
      at: z.string(),
      /** Nom affiché (à défaut, adresse) de la personne. */
      by: z.string().nullable(),
    })
    .nullable(),
});
export type Overview = z.infer<typeof overviewSchema>;

export const SEARCH_LIMITS = { minLength: 2, maxLength: 100, maxResults: 30 } as const;

export const searchResultSchema = z.object({
  kind: z.enum(['board', 'element', 'room', 'fixture']),
  id: z.string().uuid(),
  title: z.string(),
  /** Où le trouver : « Tableau principal · Rangée 1 · module 4 », « Cuisine · RDC »… */
  subtitle: z.string(),
  boardId: z.string().uuid().nullable(),
  /** Pour un équipement du plan : le disjoncteur à couper. */
  breaker: z
    .object({
      id: z.string().uuid(),
      label: z.string(),
      boardId: z.string().uuid(),
      boardName: z.string(),
      rowIndex: z.number().int(),
      position: z.number().int(),
    })
    .nullable(),
  status: verificationSchema.nullable(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;
