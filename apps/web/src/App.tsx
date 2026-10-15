import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { SessionProvider, useSession } from './auth/session';
import { BoardSettingsPage, NewBoardPage } from './board-settings/pages';
import { HomePage } from './home/HomePage';
import { LoginPage } from './pages/LoginPage';
import { PlanPage } from './plan/PlanPage';
import { EditorPage } from './rail/EditorPage';
import { AppShell } from './shell/AppShell';
import { AccountPage } from './account/AccountPage';
import { PwaPrompts } from './pwa/PwaPrompts';
import { ReviewPage } from './review/ReviewPage';
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
        {/* Écrans plein cadre : sans barre d'onglets, avec leur propre barre d'actions. */}
        <Route path="/tableaux/nouveau" element={<NewBoardPage />} />
        <Route path="/tableaux/:boardId/parametres" element={<BoardSettingsPage />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/tableaux" replace />} />
          <Route path="/tableaux" element={<HomePage />} />
          <Route path="/tableaux/:boardId" element={<EditorPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/verifier" element={<ReviewPage />} />
          <Route path="/compte" element={<AccountPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  // Un écran qui retente sans fin n'aide pas : une nouvelle tentative suffit pour un incident réseau bref.
  const [client] = useState(
    () =>
      new QueryClient({
        // `always` : hors ligne, les lectures passent par le service worker (dernier état connu).
        defaultOptions: { queries: { retry: 1, staleTime: 15_000, networkMode: 'always' } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <SessionProvider>
          <AppRoutes />
          <PwaPrompts />
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
