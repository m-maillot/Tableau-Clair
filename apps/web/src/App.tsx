import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { SessionProvider, useSession } from './auth/session';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { Button } from './ui';

/** Réserve les routes enfants aux utilisateurs connectés. */
function RequireSession() {
  const { session, refresh } = useSession();

  if (session.status === 'loading') {
    return (
      <p role="status" style={{ padding: 24 }}>
        Chargement…
      </p>
    );
  }
  if (session.status === 'error') {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Serveur injoignable</h1>
        <p style={{ margin: '8px 0 16px', color: 'var(--color-muted)' }}>
          Impossible de vérifier votre session. Vérifiez votre connexion.
        </p>
        <Button onClick={() => void refresh()}>Réessayer</Button>
      </main>
    );
  }
  if (session.status === 'anonymous') return <Navigate to="/connexion" replace />;
  return <Outlet />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/connexion" element={<LoginPage />} />
      <Route element={<RequireSession />}>
        <Route path="/" element={<HomePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </BrowserRouter>
  );
}
