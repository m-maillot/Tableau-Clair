import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './TabBar.module.css';

export interface TabItem {
  id: string;
  label: string;
  icon: IconName;
  href: string;
  /** Pastille de comptage (ex. nombre de liaisons à vérifier). */
  badge?: number;
}

export interface TabLinkProps {
  href: string;
  className: string;
  'aria-current'?: 'page';
  children: ReactNode;
}

export interface TabBarProps {
  items: readonly TabItem[];
  current: string;
  label?: string;
  /** Rendu des liens : permet d'y brancher le routeur sans changer le composant. */
  renderLink?: (props: TabLinkProps) => ReactNode;
}

const defaultLink = ({ children, ...props }: TabLinkProps) => <a {...props}>{children}</a>;

/** Barre d'onglets mobile : 4 destinations, l'onglet actif en bleu et gras. */
export function TabBar({
  items,
  current,
  label = 'Navigation principale',
  renderLink = defaultLink,
}: TabBarProps) {
  return (
    <nav aria-label={label} className={styles.bar}>
      <ul className={styles.list}>
        {items.map((item) => {
          const active = item.id === current;
          return (
            <li key={item.id} className={styles.item}>
              {renderLink({
                href: item.href,
                className: `${styles.link} ${active ? styles.active : ''}`,
                ...(active ? { 'aria-current': 'page' as const } : {}),
                children: (
                  <>
                    <span className={styles.iconWrap}>
                      <Icon name={item.icon} size={24} />
                      {item.badge ? (
                        <span className={styles.badge}>
                          {item.badge}
                          <span className="sr-only"> à vérifier</span>
                        </span>
                      ) : null}
                    </span>
                    {item.label}
                  </>
                ),
              })}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
