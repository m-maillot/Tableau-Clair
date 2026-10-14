import { useSession } from '../auth/session';
import { Button } from '../ui';

/** Écran provisoire : l'accueil réel est le ticket « Accueil ». */
export function HomePage() {
  const { session, signOut } = useSession();
  if (session.status !== 'authenticated') return null;

  return (
    <main style={{ padding: '36px 20px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>
        Bonjour, {session.user.displayName ?? session.user.email}
      </h1>
      <p style={{ marginTop: 8, color: 'var(--color-muted)' }}>{session.user.email}</p>
      <Button variant="secondary" style={{ marginTop: 24 }} onClick={() => void signOut()}>
        Se déconnecter
      </Button>
    </main>
  );
}
