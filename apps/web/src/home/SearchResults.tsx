import type { SearchResult } from '@tableau-clair/contracts';
import { Link } from 'react-router';
import { Icon, StatusChip, type IconName } from '../ui';
import styles from './SearchResults.module.css';

const ICON: Record<SearchResult['kind'], IconName> = {
  board: 'boards',
  element: 'bolt',
  room: 'plan',
  fixture: 'socket',
};

function target(result: SearchResult): string {
  switch (result.kind) {
    case 'board':
      return `/tableaux/${result.id}`;
    case 'element':
      return `/tableaux/${result.boardId}?element=${result.id}`;
    case 'room':
      return `/plan?room=${result.id}`;
    case 'fixture':
      return `/plan?fixture=${result.id}`;
  }
}

export function SearchResults({ results }: { results: SearchResult[] }) {
  return (
    <ul className={styles.list} aria-label="Résultats de la recherche">
      {results.map((result) => (
        <li key={`${result.kind}-${result.id}`}>
          <Link to={target(result)} className={styles.item}>
            <span className={styles.icon}>
              <Icon name={ICON[result.kind]} size={20} />
            </span>
            <span className={styles.text}>
              <span className={styles.title}>{result.title}</span>
              <span className={styles.subtitle}>{result.subtitle}</span>
              {result.kind === 'fixture' && (
                <span className={styles.breaker}>
                  {result.breaker
                    ? `À couper : ${result.breaker.label} · ${result.breaker.boardName} · Rangée ${
                        result.breaker.rowIndex + 1
                      } · module ${result.breaker.position + 1}`
                    : 'Disjoncteur à identifier'}
                </span>
              )}
            </span>
            {result.status && <StatusChip status={result.status} />}
          </Link>
        </li>
      ))}
    </ul>
  );
}
