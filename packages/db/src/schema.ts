import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import {
  CURVES,
  ELEMENT_KINDS,
  FIXTURE_KINDS,
  PHOTO_USAGES,
  RCD_TYPES,
  ROLES,
  VERIFICATIONS,
} from '@tableau-clair/domain';

// --- Énumérations --------------------------------------------------------------------------

export const roleEnum = pgEnum('role', ROLES);
export const verificationEnum = pgEnum('verification', VERIFICATIONS);
export const elementKindEnum = pgEnum('element_kind', ELEMENT_KINDS);
export const fixtureKindEnum = pgEnum('fixture_kind', FIXTURE_KINDS);
export const curveEnum = pgEnum('curve', CURVES);
export const rcdTypeEnum = pgEnum('rcd_type', RCD_TYPES);
export const photoUsageEnum = pgEnum('photo_usage', PHOTO_USAGES);

// --- Colonnes communes ------------------------------------------------------------------------

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * Colonnes portées par toutes les entités (spec §5).
 * `updated_at` et `version` sont tenus à jour par un trigger (migration d'intégrité) :
 * l'API écrit avec `WHERE id = $1 AND version = $2` pour détecter les conflits d'édition.
 */
const audit = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
  version: integer('version').notNull().default(1),
});

// --- Comptes et partage -------------------------------------------------------------------------

/** Compte. Les identifiants de connexion sont gérés par la couche d'authentification (ticket 05). */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    displayName: text('display_name'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_unique').on(sql`lower(${t.email})`)],
);

/** Logement : unité de partage. */
export const properties = pgTable('properties', {
  ...audit(),
  name: text('name').notNull(),
  address: text('address'),
  notes: text('notes'),
});

export const memberships = pgTable(
  'memberships',
  {
    ...audit(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
  },
  (t) => [
    uniqueIndex('memberships_property_user_unique').on(t.propertyId, t.userId),
    index('memberships_user_idx').on(t.userId),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    ...audit(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: roleEnum('role').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamptz('expires_at').notNull(),
    acceptedAt: timestamptz('accepted_at'),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('invitations_property_idx').on(t.propertyId),
    check('invitations_role_not_owner', sql`${t.role} <> 'owner'`),
  ],
);

// --- Photos (métadonnées ; fichiers sur S3) -----------------------------------------------------

export const photos = pgTable(
  'photos',
  {
    ...audit(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull().unique(),
    mimeType: text('mime_type').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    usage: photoUsageEnum('usage').notNull(),
  },
  (t) => [index('photos_property_idx').on(t.propertyId)],
);

// --- Tableau, rangées, éléments ---------------------------------------------------------------------

export const boards = pgTable(
  'boards',
  {
    ...audit(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    location: text('location'),
    photoId: uuid('photo_id').references(() => photos.id, { onDelete: 'set null' }),
    rows: integer('rows').notNull(),
    modulesPerRow: integer('modules_per_row').notNull(),
    notes: text('notes'),
  },
  (t) => [
    index('boards_property_idx').on(t.propertyId),
    check('boards_rows_positive', sql`${t.rows} >= 1`),
    check('boards_modules_positive', sql`${t.modulesPerRow} >= 1`),
  ],
);

export const boardRows = pgTable(
  'board_rows',
  {
    ...audit(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    /** 0 = rangée du haut. */
    index: integer('index').notNull(),
    capacity: integer('capacity').notNull(),
  },
  (t) => [
    uniqueIndex('board_rows_board_index_unique').on(t.boardId, t.index),
    check('board_rows_index_positive', sql`${t.index} >= 0`),
    check('board_rows_capacity_positive', sql`${t.capacity} >= 1`),
  ],
);

export const elements = pgTable(
  'elements',
  {
    ...audit(),
    rowId: uuid('row_id')
      .notNull()
      .references(() => boardRows.id, { onDelete: 'cascade' }),
    /** Module de départ, 0-indexé. */
    position: integer('position').notNull(),
    /** Nombre de modules occupés. */
    width: integer('width').notNull(),
    kind: elementKindEnum('kind').notNull(),
    label: text('label').notNull(),
    role: text('role'),
    brand: text('brand'),
    model: text('model'),
    notes: text('notes'),
    photoId: uuid('photo_id').references(() => photos.id, { onDelete: 'set null' }),
    outgoingCables: integer('outgoing_cables'),
    /** Section des câbles sortants, en mm². */
    cableSection: numeric('cable_section', { precision: 5, scale: 2 }),
    // Protections
    ratingA: integer('rating_a'),
    poles: integer('poles'),
    curve: curveEnum('curve'),
    sensitivityMa: integer('sensitivity_ma'),
    rcdType: rcdTypeEnum('rcd_type'),
    protectedByRcdId: uuid('protected_by_rcd_id').references((): AnyPgColumn => elements.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    index('elements_row_idx').on(t.rowId),
    check('elements_position_positive', sql`${t.position} >= 0`),
    check('elements_width_positive', sql`${t.width} >= 1`),
    check('elements_poles_range', sql`${t.poles} IS NULL OR ${t.poles} BETWEEN 1 AND 4`),
    check('elements_rating_positive', sql`${t.ratingA} IS NULL OR ${t.ratingA} > 0`),
    check('elements_section_positive', sql`${t.cableSection} IS NULL OR ${t.cableSection} > 0`),
    // Le non-chevauchement dans une rangée est une contrainte d'exclusion (migration d'intégrité).
  ],
);

// --- Plan du logement ------------------------------------------------------------------------------

export const floors = pgTable(
  'floors',
  {
    ...audit(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Ordre d'affichage des onglets d'étages. */
    index: integer('index').notNull(),
    backgroundImageId: uuid('background_image_id').references(() => photos.id, {
      onDelete: 'set null',
    }),
    backgroundOpacity: doublePrecision('background_opacity').notNull().default(1),
    backgroundX: doublePrecision('background_x').notNull().default(0),
    backgroundY: doublePrecision('background_y').notNull().default(0),
    backgroundScale: doublePrecision('background_scale').notNull().default(1),
    backgroundLocked: boolean('background_locked').notNull().default(false),
    /** Dimensions du canevas. */
    width: doublePrecision('width').notNull(),
    height: doublePrecision('height').notNull(),
  },
  (t) => [
    uniqueIndex('floors_property_index_unique').on(t.propertyId, t.index),
    check('floors_opacity_range', sql`${t.backgroundOpacity} BETWEEN 0 AND 1`),
    check('floors_scale_positive', sql`${t.backgroundScale} > 0`),
    check('floors_size_positive', sql`${t.width} > 0 AND ${t.height} > 0`),
  ],
);

export const rooms = pgTable(
  'rooms',
  {
    ...audit(),
    floorId: uuid('floor_id')
      .notNull()
      .references(() => floors.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    x: doublePrecision('x').notNull(),
    y: doublePrecision('y').notNull(),
    w: doublePrecision('w').notNull(),
    h: doublePrecision('h').notNull(),
  },
  (t) => [
    index('rooms_floor_idx').on(t.floorId),
    check('rooms_size_positive', sql`${t.w} > 0 AND ${t.h} > 0`),
  ],
);

export const fixtures = pgTable(
  'fixtures',
  {
    ...audit(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    kind: fixtureKindEnum('kind').notNull(),
    label: text('label').notNull(),
    x: doublePrecision('x').notNull(),
    y: doublePrecision('y').notNull(),
    notes: text('notes'),
    photoId: uuid('photo_id').references(() => photos.id, { onDelete: 'set null' }),
  },
  (t) => [index('fixtures_room_idx').on(t.roomId)],
);

// --- Circuits : lien équipement ↔ disjoncteur -------------------------------------------------------

/**
 * Un équipement n'est relié qu'à un seul disjoncteur (décision V1) : `fixture_id` est unique.
 * Quand le disjoncteur est supprimé, `breaker_id` passe à NULL et le statut à `unknown`
 * (trigger de la migration d'intégrité).
 */
export const circuits = pgTable(
  'circuits',
  {
    ...audit(),
    fixtureId: uuid('fixture_id')
      .notNull()
      .unique()
      .references(() => fixtures.id, { onDelete: 'cascade' }),
    breakerId: uuid('breaker_id').references(() => elements.id, { onDelete: 'set null' }),
    status: verificationEnum('status').notNull().default('unknown'),
    notes: text('notes'),
  },
  (t) => [
    index('circuits_breaker_idx').on(t.breakerId),
    check(
      'circuits_unlinked_is_unknown',
      sql`${t.breakerId} IS NOT NULL OR ${t.status} = 'unknown'`,
    ),
  ],
);

// --- Liens de consultation en lecture seule (V1.1) --------------------------------------------------

export const shareLinks = pgTable(
  'share_links',
  {
    ...audit(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamptz('expires_at'),
    revokedAt: timestamptz('revoked_at'),
  },
  (t) => [
    // Un seul lien actif par tableau : en régénérer un révoque le précédent.
    uniqueIndex('share_links_one_active_per_board')
      .on(t.boardId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);
