import type { BoardSummary } from '@tableau-clair/contracts';
import { Link } from 'react-router';
import { Icon } from '../ui';
import { plural } from './format';
import styles from './BoardCard.module.css';

export function BoardCard({ board }: { board: BoardSummary }) {
  const details = [
    board.location,
    `${board.rowCount} ${plural(board.rowCount, 'rangée', 'rangées')}`,
    `${board.usedModules} / ${board.totalModules} modules`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link to={`/tableaux/${board.id}`} className={styles.card}>
      <span className={styles.icon}>
        <Icon name="boards" size={24} />
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{board.name}</span>
        <span className={styles.details}>{details}</span>
      </span>
      <Icon name="chevron-right" size={20} strokeWidth={2.4} />
    </Link>
  );
}
