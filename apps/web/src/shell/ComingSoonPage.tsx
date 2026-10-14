import { Link } from 'react-router';

/** Écran pas encore construit : évite les liens morts de la navigation. */
export function ComingSoonPage({ title }: { title: string }) {
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '36px 20px 120px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>{title}</h1>
      <p style={{ margin: '8px 0 16px', color: 'var(--color-muted)' }}>Cet écran arrive bientôt.</p>
      <Link to="/" style={{ color: 'var(--color-blue)', fontWeight: 700 }}>
        Retour à l'accueil
      </Link>
    </main>
  );
}
