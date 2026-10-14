import { Link, Outlet, useLocation } from 'react-router';
import { TabBar, type TabItem } from '../ui';

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

/** Cadre des écrans connectés : contenu + barre d'onglets mobile. */
export function AppShell() {
  const { pathname } = useLocation();
  return (
    <>
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
