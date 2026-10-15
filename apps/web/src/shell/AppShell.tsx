import { Link, Outlet, useLocation } from 'react-router';
import { useSession } from '../auth/session';
import { greetingName } from '../home/format';
import { useProperties, useSelectedProperty } from '../home/queries';
import { useReviewCount } from '../review/useReviewCount';
import { DESKTOP_QUERY, TabBar, useMediaQuery, type TabItem } from '../ui';
import { OfflineBanner } from './OfflineBanner';
import { UnsavedBanner } from './UnsavedBanner';
import { SidebarNav } from './SidebarNav';
import styles from './AppShell.module.css';

const TABS: TabItem[] = [
  { id: 'home', label: 'Accueil', icon: 'home', href: '/' },
  { id: 'boards', label: 'Tableaux', icon: 'boards', href: '/tableaux' },
  { id: 'plan', label: 'Plan', icon: 'plan', href: '/plan' },
  { id: 'verify', label: 'À vérifier', icon: 'verify', href: '/verifier' },
];

function currentTab(pathname: string): string {
  if (pathname.startsWith('/tableaux')) return 'boards';
  if (pathname.startsWith('/plan')) return 'plan';
  if (pathname.startsWith('/verifier')) return 'verify';
  return 'home';
}

/** Cadre des écrans connectés : contenu + barre d'onglets mobile, ou sidebar sur bureau. */
export function AppShell() {
  const { pathname } = useLocation();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  if (desktop) return <DesktopShell current={currentTab(pathname)} />;

  return (
    <>
      <OfflineBanner />
      <UnsavedBanner />
      <Outlet />
      <TabBar
        items={TABS}
        current={currentTab(pathname)}
        renderLink={({ href, children, ...rest }) => (
          <Link to={href} {...rest}>
            {children}
          </Link>
        )}
      />
    </>
  );
}

function DesktopShell({ current }: { current: string }) {
  const { session } = useSession();
  const properties = useProperties();
  const [property] = useSelectedProperty(properties.data);
  const badge = useReviewCount(property?.id);
  const account = session.status === 'authenticated' ? greetingName(session.user) : undefined;

  return (
    <div className={styles.layout}>
      <SidebarNav
        items={TABS}
        current={current}
        badge={badge}
        property={property?.name}
        account={account}
      />
      <div className={styles.content}>
        <OfflineBanner />
        <UnsavedBanner />
        <Outlet />
      </div>
    </div>
  );
}
