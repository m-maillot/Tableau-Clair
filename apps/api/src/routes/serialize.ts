import type {
  Board,
  BoardSummary,
  Element,
  LastModified,
  Property,
  Row,
} from '@tableau-clair/contracts';
import type { boardRows, boards, elements, properties } from '@tableau-clair/db';
import type { Role } from '@tableau-clair/domain';

type PropertyRow = typeof properties.$inferSelect;
type BoardRow = typeof boards.$inferSelect;
type RailRow = typeof boardRows.$inferSelect;
type ElementRow = typeof elements.$inferSelect;

const iso = (date: Date) => date.toISOString();

export function toProperty(row: PropertyRow, role: Role): Property {
  return {
    id: row.id,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    updatedBy: row.updatedBy,
    version: row.version,
    name: row.name,
    address: row.address,
    notes: row.notes,
    role,
  };
}

export function toElement(row: ElementRow): Element {
  return {
    id: row.id,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    updatedBy: row.updatedBy,
    version: row.version,
    rowId: row.rowId,
    position: row.position,
    width: row.width,
    kind: row.kind,
    label: row.label,
    role: row.role,
    brand: row.brand,
    model: row.model,
    notes: row.notes,
    photoId: row.photoId,
    outgoingCables: row.outgoingCables,
    // `numeric` revient de PostgreSQL sous forme de chaîne.
    cableSection: row.cableSection === null ? null : Number(row.cableSection),
    ratingA: row.ratingA,
    poles: row.poles,
    curve: row.curve,
    sensitivityMa: row.sensitivityMa,
    rcdType: row.rcdType,
    protectedByRcdId: row.protectedByRcdId,
  };
}

export function toRow(row: RailRow, rowElements: ElementRow[]): Row {
  const sorted = [...rowElements].sort((a, b) => a.position - b.position);
  return {
    id: row.id,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    updatedBy: row.updatedBy,
    version: row.version,
    boardId: row.boardId,
    index: row.index,
    capacity: row.capacity,
    used: sorted.reduce((total, e) => total + e.width, 0),
    elements: sorted.map(toElement),
  };
}

function boardFields(row: BoardRow) {
  return {
    id: row.id,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    updatedBy: row.updatedBy,
    version: row.version,
    propertyId: row.propertyId,
    name: row.name,
    location: row.location,
    photoId: row.photoId,
    rowCount: row.rows,
    modulesPerRow: row.modulesPerRow,
    notes: row.notes,
  };
}

export function toBoard(row: BoardRow, rails: Row[], lastModified: LastModified): Board {
  return {
    ...boardFields(row),
    rows: [...rails].sort((a, b) => a.index - b.index),
    lastModified,
  };
}

export function toBoardSummary(row: BoardRow, rails: RailRow[], used: number): BoardSummary {
  return {
    ...boardFields(row),
    usedModules: used,
    totalModules: rails.reduce((total, r) => total + r.capacity, 0),
  };
}
