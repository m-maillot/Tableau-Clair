import { NavLink } from 'react-router';
import { Icon, type IconName } from '../ui';
import styles from './SidebarNav.module.css';

export interface NavEntry {
  id: string;
  label: string;
  icon: IconName;
  href: string;
}

interface SidebarNavProps {
  items: NavEntry[];
  current: string;
  /** Compteur affiché sur « À vérifier ». */
  badge: number;
  /** Nom du logement actif et de la personne connectée. */
  property?: string;
  account?: string;
}

/** Navigation du mode bureau : sidebar sombre fixe à gauche. */
export function SidebarNav({ items, current, badge, property, account }: SidebarNavProps) {
  return (
    <aside className={styles.sidebar}>
      <p className={styles.brand}>Tableau Clair</p>
      {property && <p className={styles.property}>{property}</p>}
      <nav aria-label="Navigation principale">
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id}>
              <NavLink
                to={item.href}
                className={`${styles.link} ${item.id === current ? styles.active : ''}`}
                aria-current={item.id === current ? 'page' : undefined}
              >
                <Icon name={item.icon} size={20} />
                <span className={styles.label}>{item.label}</span>
                {item.id === 'verify' && badge > 0 && (
                  <span className={styles.badge} aria-label={`${badge} à vérifier`}>
                    {badge}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {account && <p className={styles.account}>{account}</p>}
    </aside>
  );
}
