import type { PlanBreaker } from '@tableau-clair/contracts';
import { useMemo, useState } from 'react';
import { plural } from '../home/format';
import { BottomSheet, TextField } from '../ui';
import styles from './link.module.css';
import { breakerName, placeOf } from './place';

interface BreakerPickerSheetProps {
  open: boolean;
  breakers: PlanBreaker[];
  /** Disjoncteur actuel de l'équipement, repéré dans la liste. */
  currentId: string | null;
  onPick: (breakerId: string) => void;
  onClose: () => void;
}

const norm = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Choix du disjoncteur qui alimente un équipement, avec filtre sur le libellé ou le tableau. */
export function BreakerPickerSheet({
  open,
  breakers,
  currentId,
  onPick,
  onClose,
}: BreakerPickerSheetProps) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const needle = norm(query.trim());
    if (!needle) return breakers;
    return breakers.filter((b) =>
      norm(`${b.label} ${b.boardName} ${b.ratingA ?? ''}`).includes(needle),
    );
  }, [breakers, query]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Quel disjoncteur l’alimente ?"
      description={`${breakers.length} ${plural(breakers.length, 'disjoncteur', 'disjoncteurs')} dans ce logement`}
    >
      {breakers.length === 0 ? (
        <p className={styles.empty}>
          Aucun disjoncteur : ajoutez-en dans l’éditeur de tableau, puis revenez ici.
        </p>
      ) : (
        <>
          <div className={styles.search}>
            <TextField
              label="Filtrer"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Libellé, calibre, tableau…"
            />
          </div>
          {shown.length === 0 ? (
            <p className={styles.empty}>Aucun disjoncteur ne correspond.</p>
          ) : (
            <ul className={styles.list}>
              {shown.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    className={styles.pick}
                    aria-pressed={b.id === currentId}
                    onClick={() => onPick(b.id)}
                  >
                    <span className={styles.text}>
                      <span className={styles.title}>{breakerName(b)}</span>
                      <span className={styles.sub}>{placeOf(b)}</span>
                    </span>
                    <span className={styles.sub}>
                      {b.linkedCount} {plural(b.linkedCount, 'équipement', 'équipements')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </BottomSheet>
  );
}
