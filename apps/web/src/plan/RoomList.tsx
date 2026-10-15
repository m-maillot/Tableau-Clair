import type { PlanFloor } from '@tableau-clair/contracts';
import { plural } from '../home/format';
import styles from './RoomList.module.css';

interface RoomListProps {
  floor: PlanFloor;
  selectedId: string | null;
  onPick: (roomId: string) => void;
}

/** Pièces de l'étage affiché, avec leur nombre d'équipements ; un clic sélectionne la pièce. */
export function RoomList({ floor, selectedId, onPick }: RoomListProps) {
  const rooms = [...floor.rooms].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const count = (roomId: string) => floor.fixtures.filter((f) => f.roomId === roomId).length;

  if (rooms.length === 0) {
    return <p className={styles.empty}>Aucune pièce sur cet étage.</p>;
  }
  return (
    <ul className={styles.list} aria-label={`Pièces de ${floor.name}`}>
      {rooms.map((room) => {
        const n = count(room.id);
        const selected = room.id === selectedId;
        return (
          <li key={room.id}>
            <button
              type="button"
              className={`${styles.item} ${selected ? styles.selected : ''}`}
              aria-pressed={selected}
              onClick={() => onPick(room.id)}
            >
              <span className={styles.name}>{room.name}</span>
              <span className={styles.count}>
                {n} {plural(n, 'équipement', 'équipements')}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
