import type { Element, Row } from '@tableau-clair/contracts';
import { freeSlots } from '@tableau-clair/domain';
import { useEffect, useState, type DragEvent } from 'react';
import { appearanceOf, moduleRange } from './appearance';
import styles from './RailRow.module.css';

/** Largeur d'un module à l'écran, en px (cible tactile ≥ 44 px) + espace entre modules. */
const MODULE_PX = 44;
const GAP_PX = 3;

export interface SlotRef {
  rowIndex: number;
  position: number;
}

interface RailRowProps {
  row: Row;
  selectedElementId: string | null;
  selectedSlot: SlotRef | null;
  /** Élément dont le déplacement vient d'être refusé : il tremble et se cerne en rouge. */
  refusedId?: string | null;
  onSelectElement: (element: Element) => void;
  onSelectSlot: (slot: SlotRef) => void;
  /** Mode bureau : la rangée occupe toute la largeur (modules en `1fr`), sans défilement. */
  fluid?: boolean;
  /** Mode bureau : glisser un appareil ou un type de la palette sur un module libre. */
  dnd?: { onDrop: (position: number, payload: DragPayload) => void };
  /** Éléments mis en évidence par la recherche de la barre d'outils. */
  highlightIds?: ReadonlySet<string>;
}

export const ELEMENT_MIME = 'application/x-tableau-clair-element';
export const KIND_MIME = 'application/x-tableau-clair-kind';

export interface DragPayload {
  elementId?: string;
  kind?: string;
}

/**
 * Glisser en cours : largeur de l'appareil et module saisi (0 = bord gauche). Les navigateurs
 * ne donnent pas accès aux données du glisser avant le dépôt ; ce petit état sert à l'aperçu.
 */
let drag: { width: number; grab: number } | null = null;
export const beginDrag = (width: number, grab = 0) => {
  drag = { width, grab };
};
export const endDrag = () => {
  drag = null;
};

function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

/** Une rangée de rail DIN : N modules de 44 px, à faire défiler horizontalement. */
export function RailRow({
  row,
  selectedElementId,
  selectedSlot,
  refusedId = null,
  onSelectElement,
  onSelectSlot,
  fluid = false,
  dnd,
  highlightIds,
}: RailRowProps) {
  const windowWidth = useWindowWidth();
  const stripWidth = row.capacity * (MODULE_PX + GAP_PX);
  // Le carton de la rangée est un peu moins large que l'écran (marges et paddings).
  const scrolls = !fluid && stripWidth > windowWidth - 56;

  const [hover, setHover] = useState<{ start: number; width: number } | null>(null);

  /** Module visé par le pointeur, d'après sa position dans le rail (ou la case survolée). */
  const moduleAt = (event: DragEvent<HTMLElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    let position: number;
    if (rect.width > 0) {
      position = Math.floor(((event.clientX - rect.left) / rect.width) * row.capacity);
    } else {
      const slot = (event.target as HTMLElement).closest<HTMLElement>('[data-slot]');
      position = slot ? Number(slot.dataset.slot) : 0;
    }
    const start = position - (drag?.grab ?? 0);
    return Math.min(Math.max(start, 0), row.capacity - 1);
  };

  const freeModules = freeSlots(row).flatMap((slot) =>
    Array.from({ length: slot.width }, (_, k) => slot.position + k),
  );

  return (
    <section className={styles.row} aria-labelledby={`row-${row.id}`}>
      <header className={styles.header}>
        <h2 id={`row-${row.id}`} className={styles.title}>
          Rangée {row.index + 1}
        </h2>
        <p className={styles.count}>
          {row.used} / {row.capacity} modules{scrolls ? ' · glisser →' : ''}
        </p>
      </header>

      <div
        className={`${styles.scroller} ${fluid ? styles.fluid : ''}`}
        role="group"
        aria-label={`Rail de la rangée ${row.index + 1}`}
        // Une zone qui défile doit être atteignable au clavier.
        tabIndex={0}
      >
        <div
          className={styles.strip}
          onDragOver={
            dnd
              ? (event) => {
                  // Le navigateur n'accepte le dépôt que si l'effet demandé correspond à l'effet permis.
                  const isKind = Array.from(event.dataTransfer.types ?? []).includes(KIND_MIME);
                  event.preventDefault();
                  event.dataTransfer.dropEffect = isKind ? 'copy' : 'move';
                  const start = moduleAt(event);
                  const width = Math.min(drag?.width ?? 1, row.capacity - start);
                  setHover((current) =>
                    current?.start === start && current.width === width
                      ? current
                      : { start, width },
                  );
                }
              : undefined
          }
          onDragLeave={
            dnd
              ? (event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setHover(null);
                  }
                }
              : undefined
          }
          onDrop={
            dnd
              ? (event) => {
                  event.preventDefault();
                  const position = moduleAt(event);
                  setHover(null);
                  const elementId = event.dataTransfer.getData(ELEMENT_MIME);
                  const kind = event.dataTransfer.getData(KIND_MIME);
                  endDrag();
                  if (elementId || kind) {
                    dnd.onDrop(position, {
                      ...(elementId ? { elementId } : {}),
                      ...(kind ? { kind } : {}),
                    });
                  }
                }
              : undefined
          }
          style={{
            gridTemplateColumns: fluid
              ? `repeat(${row.capacity}, minmax(0, 1fr))`
              : `repeat(${row.capacity}, ${MODULE_PX}px)`,
            ...(fluid ? { width: '100%' } : {}),
          }}
        >
          {row.elements.map((element) => {
            const look = appearanceOf(element);
            const selected = element.id === selectedElementId;
            const span = `${element.position + 1} / span ${element.width}`;
            return (
              <div
                key={element.id}
                // Un <button> ne se glisse pas sous Firefox : une zone `role="button"` le permet partout.
                role="button"
                tabIndex={0}
                data-element-id={element.id}
                aria-pressed={selected}
                aria-label={[
                  element.label,
                  look.kindLabel,
                  element.ratingA ? `${element.ratingA} A` : null,
                  moduleRange(element.position, element.width),
                ]
                  .filter(Boolean)
                  .join(', ')}
                className={`${styles.cell} ${styles[look.tone]} ${selected ? styles.selected : ''} ${
                  element.id === refusedId ? styles.refused : ''
                } ${highlightIds?.has(element.id) ? styles.found : ''}`}
                style={{ gridColumn: span }}
                draggable={dnd ? true : undefined}
                onDragStart={
                  dnd
                    ? (event) => {
                        event.dataTransfer.setData(ELEMENT_MIME, element.id);
                        event.dataTransfer.effectAllowed = 'move';
                        const box = event.currentTarget.getBoundingClientRect();
                        const grab =
                          box.width > 0
                            ? Math.floor(((event.clientX - box.left) / box.width) * element.width)
                            : 0;
                        beginDrag(element.width, Math.min(Math.max(grab, 0), element.width - 1));
                      }
                    : undefined
                }
                onDragEnd={dnd ? () => (endDrag(), setHover(null)) : undefined}
                onClick={() => onSelectElement(element)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectElement(element);
                  }
                }}
              >
                {look.tone === 'spare' ? (
                  <span className={styles.spareText}>{element.label || 'Réserve'}</span>
                ) : (
                  <>
                    <b className={styles.top}>{look.top}</b>
                    <span className={styles.label}>{element.label}</span>
                  </>
                )}
              </div>
            );
          })}

          {freeModules.map((position) => {
            const selected =
              selectedSlot?.rowIndex === row.index && selectedSlot.position === position;
            return (
              <button
                key={`free-${position}`}
                type="button"
                aria-pressed={selected}
                aria-label={`Rangée ${row.index + 1}, module libre ${position + 1}, ajouter un appareil`}
                className={`${styles.cell} ${styles.free} ${selected ? styles.freeSelected : ''}`}
                style={{ gridColumn: position + 1 }}
                data-slot={position}
                onClick={() => onSelectSlot({ rowIndex: row.index, position })}
              >
                <span className={styles.plus} aria-hidden="true">
                  +
                </span>
                <span className={styles.number} aria-hidden="true">
                  {position + 1}
                </span>
              </button>
            );
          })}
          {hover && (
            <div
              className={styles.dropHint}
              aria-hidden="true"
              style={{ gridColumn: `${hover.start + 1} / span ${hover.width}` }}
            />
          )}
        </div>
      </div>
    </section>
  );
}
