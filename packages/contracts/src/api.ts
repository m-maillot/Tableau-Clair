import {
  CURVES,
  ELEMENT_KINDS,
  FIXTURE_KINDS,
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
  /** Équipements du plan reliés à cet élément (disjoncteur) : « 4 équipements liés ». */
  linkedFixtures: z.number().int().min(0).default(0),
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

/** Dernière modification d'un ensemble d'entités : quand, et par qui (nom affiché, à défaut adresse). */
export const lastModifiedSchema = z
  .object({ at: z.string(), by: z.string().nullable() })
  .nullable();
export type LastModified = z.infer<typeof lastModifiedSchema>;

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
export const boardSchema = z.object({
  ...boardFields,
  rows: z.array(rowSchema),
  /** Dernière modification du tableau, de ses rangées ou de ses éléments. */
  lastModified: lastModifiedSchema,
});
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

/** Duplication : le nom de la copie est facultatif (par défaut « <nom> (copie) »). */
export const duplicateBoardSchema = z.object({ name: name.optional() }).strict();
export type DuplicateBoardInput = z.infer<typeof duplicateBoardSchema>;

/** Ce que la suppression d'un tableau supprime et conserve (écran de confirmation). */
export const boardImpactSchema = z.object({
  rowCount: z.number().int(),
  elementCount: z.number().int(),
  hasPhoto: z.boolean(),
  /** Équipements du plan du logement, tous tableaux confondus : ils sont conservés. */
  fixtureCount: z.number().int(),
  /** Parmi eux, ceux dont le disjoncteur est dans ce tableau : leur liaison passe à « inconnue ». */
  fixturesToUnlink: z.number().int(),
});
export type BoardImpact = z.infer<typeof boardImpactSchema>;

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
  lastModified: lastModifiedSchema,
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

// --- Modèles personnalisés ----------------------------------------------------------------------------------

export const customModelSchema = z.object({
  ...auditFields,
  label: z.string(),
  role: z.string().nullable(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  width: z.number().int().min(1),
});
export type CustomModel = z.infer<typeof customModelSchema>;

export const createCustomModelSchema = z
  .object({
    label: name,
    role: optionalText,
    brand: optionalText,
    model: optionalText,
    width: z.number().int().min(1).max(LIMITS.maxModulesPerRow),
  })
  .strict();
export type CreateCustomModelInput = z.infer<typeof createCustomModelSchema>;

// --- Plan : étages, pièces, équipements -------------------------------------------------------------------------

/** Dimensions par défaut du canevas d'un étage, en unités de plan. */
export const FLOOR_DEFAULTS = { width: 1000, height: 700 } as const;
export const PLAN_LIMITS = { maxCanvas: 4000, minCanvas: 200 } as const;

export const fixtureKindSchema = z.enum(FIXTURE_KINDS);

export const floorSchema = z.object({
  ...auditFields,
  propertyId: z.string().uuid(),
  name: z.string(),
  index: z.number().int(),
  width: z.number(),
  height: z.number(),
  backgroundImageId: z.string().uuid().nullable(),
  backgroundOpacity: z.number(),
  backgroundX: z.number(),
  backgroundY: z.number(),
  backgroundScale: z.number(),
  backgroundLocked: z.boolean(),
});
export type Floor = z.infer<typeof floorSchema>;

export const roomSchema = z.object({
  ...auditFields,
  floorId: z.string().uuid(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type Room = z.infer<typeof roomSchema>;

export const fixtureLinkSchema = z.object({
  breakerId: z.string().uuid().nullable(),
  status: verificationSchema,
});
export type FixtureLink = z.infer<typeof fixtureLinkSchema>;

export const fixtureSchema = z.object({
  ...auditFields,
  roomId: z.string().uuid(),
  kind: fixtureKindSchema,
  label: z.string(),
  x: z.number(),
  y: z.number(),
  notes: z.string().nullable(),
  photoId: z.string().uuid().nullable(),
  /** Disjoncteur qui l'alimente (`null` : aucun lien, « à identifier »). */
  link: fixtureLinkSchema.nullable(),
});
export type Fixture = z.infer<typeof fixtureSchema>;

export const planFloorSchema = floorSchema.extend({
  /** Dimensions de l'image de fond (pour la cadrer), si elle existe. */
  background: z.object({ width: z.number().int(), height: z.number().int() }).nullable(),
  rooms: z.array(roomSchema),
  fixtures: z.array(fixtureSchema),
});
export type PlanFloor = z.infer<typeof planFloorSchema>;

/** Disjoncteur du logement, tel qu'utile au plan (bandeau du circuit, choix d'un circuit). */
export const planBreakerSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  ratingA: z.number().int().nullable(),
  boardId: z.string().uuid(),
  boardName: z.string(),
  rowIndex: z.number().int(),
  position: z.number().int(),
  linkedCount: z.number().int(),
  /** Photo du disjoncteur, pour le reconnaître devant le tableau. */
  photoId: z.string().uuid().nullable(),
});
export type PlanBreaker = z.infer<typeof planBreakerSchema>;

export const planSchema = z.object({
  floors: z.array(planFloorSchema),
  breakers: z.array(planBreakerSchema),
});
export type Plan = z.infer<typeof planSchema>;

const coordinate = z.number().finite().min(-PLAN_LIMITS.maxCanvas).max(PLAN_LIMITS.maxCanvas);
const canvasSize = z.number().min(PLAN_LIMITS.minCanvas).max(PLAN_LIMITS.maxCanvas);

/** Relie un équipement à un disjoncteur (remplace la liaison existante). */
export const setFixtureLinkSchema = z
  .object({ breakerId: z.string().uuid(), status: verificationSchema })
  .strict();
export type SetFixtureLinkInput = z.infer<typeof setFixtureLinkSchema>;

/** Circuit d'un disjoncteur : les équipements qu'il alimente, avec leur emplacement. */
export const breakerCircuitSchema = z.object({
  breaker: planBreakerSchema,
  fixtures: z.array(
    z.object({
      id: z.string().uuid(),
      label: z.string(),
      kind: fixtureKindSchema,
      status: verificationSchema,
      roomId: z.string().uuid(),
      roomName: z.string(),
      floorId: z.string().uuid(),
      floorName: z.string(),
    }),
  ),
  /** Dernière modification du disjoncteur ou d'une de ses liaisons. */
  lastModified: lastModifiedSchema,
});
export type BreakerCircuit = z.infer<typeof breakerCircuitSchema>;

export const createFloorSchema = z.object({ name }).strict();
export type CreateFloorInput = z.infer<typeof createFloorSchema>;

export const updateFloorSchema = z
  .object({
    name: name.optional(),
    width: canvasSize.optional(),
    height: canvasSize.optional(),
    backgroundImageId: z.string().uuid().nullable().optional(),
    backgroundOpacity: z.number().min(0).max(1).optional(),
    backgroundX: coordinate.optional(),
    backgroundY: coordinate.optional(),
    backgroundScale: z.number().min(0.05).max(10).optional(),
    backgroundLocked: z.boolean().optional(),
    ...versioned,
  })
  .strict();
export type UpdateFloorInput = z.infer<typeof updateFloorSchema>;

export const reorderFloorsSchema = z.object({ ids: z.array(z.string().uuid()).min(1) }).strict();
export type ReorderFloorsInput = z.infer<typeof reorderFloorsSchema>;

export const createRoomSchema = z
  .object({
    name,
    x: coordinate,
    y: coordinate,
    w: z.number().positive(),
    h: z.number().positive(),
  })
  .strict();
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const updateRoomSchema = z
  .object({
    name: name.optional(),
    x: coordinate.optional(),
    y: coordinate.optional(),
    w: z.number().positive().optional(),
    h: z.number().positive().optional(),
    ...versioned,
  })
  .strict();
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

export const createFixtureSchema = z
  .object({
    kind: fixtureKindSchema,
    label: name,
    x: coordinate,
    y: coordinate,
    notes: optionalText,
    photoId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type CreateFixtureInput = z.infer<typeof createFixtureSchema>;

export const updateFixtureSchema = z
  .object({
    kind: fixtureKindSchema.optional(),
    label: name.optional(),
    x: coordinate.optional(),
    y: coordinate.optional(),
    /** Déplacement vers une autre pièce du même logement. */
    roomId: z.string().uuid().optional(),
    notes: optionalText,
    photoId: z.string().uuid().nullable().optional(),
    ...versioned,
  })
  .strict();
export type UpdateFixtureInput = z.infer<typeof updateFixtureSchema>;

// --- Compte : export et suppression (spec §7.9) ----------------------------------------------------------------

/** Ce que la suppression du compte retire, pour la confirmation explicite. */
export const accountSummarySchema = z.object({
  email: z.string(),
  displayName: z.string().nullable(),
  /** Logements dont la personne est la seule propriétaire : supprimés avec le compte. */
  deletedProperties: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      boardCount: z.number().int(),
      /** Autres membres qui perdraient l'accès. */
      otherMembers: z.number().int(),
    }),
  ),
  /** Logements partagés avec d'autres propriétaires, ou dont elle n'est pas propriétaire : quittés. */
  leftProperties: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
});
export type AccountSummary = z.infer<typeof accountSummarySchema>;

/** Suppression du compte : l'adresse e-mail doit être retapée à l'identique. */
export const deleteAccountSchema = z.object({ confirm: z.string().min(1) }).strict();
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
