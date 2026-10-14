import type { PlanFloor } from '@tableau-clair/contracts';
import { Icon } from '../ui';
import styles from './FloorTabs.module.css';

interface FloorTabsProps {
  floors: PlanFloor[];
  currentId: string | null;
  canEdit: boolean;
  onSelect: (floorId: string) => void;
  onAdd: () => void;
  onSettings: () => void;
}

/** Onglets d'étages, avec ajout et réglages de l'étage affiché. */
export function FloorTabs({
  floors,
  currentId,
  canEdit,
  onSelect,
  onAdd,
  onSettings,
}: FloorTabsProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.tabs} role="tablist" aria-label="Étages">
        {floors.map((floor) => (
          <button
            key={floor.id}
            type="button"
            role="tab"
            aria-selected={floor.id === currentId}
            className={`${styles.tab} ${floor.id === currentId ? styles.active : ''}`}
            onClick={() => onSelect(floor.id)}
          >
            {floor.name}
          </button>
        ))}
        {canEdit && (
          <button
            type="button"
            className={styles.add}
            aria-label="Ajouter un étage"
            onClick={onAdd}
          >
            <Icon name="plus" size={18} strokeWidth={2.6} />
          </button>
        )}
      </div>
      {canEdit && currentId && (
        <button
          type="button"
          className={styles.settings}
          aria-label="Réglages de l’étage"
          onClick={onSettings}
        >
          <Icon name="settings" size={20} />
        </button>
      )}
    </div>
  );
}
