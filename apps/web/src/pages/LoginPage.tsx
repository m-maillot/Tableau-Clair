import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { navigateExternal } from '../api/browser';
import { ApiResponseError, NetworkError, requestMagicLink, startGoogleSignIn } from '../api/client';
import { problemFromCode } from '../auth/login-errors';
import { useSession } from '../auth/session';
import { Button, Icon, TextField } from '../ui';
import styles from './LoginPage.module.css';

/** Délai avant de pouvoir redemander un lien (le serveur plafonne à 3 par 10 minutes). */
const RESEND_DELAY_SECONDS = 30;

type Step = { name: 'form' } | { name: 'sending' } | { name: 'sent'; email: string };

type Failure = 'network' | 'rate-limit' | 'server' | 'google';

const FAILURES: Record<Failure, { title: string; message: string }> = {
  network: {
    title: 'Serveur injoignable',
    message: 'Vérifiez votre connexion, puis réessayez.',
  },
  'rate-limit': {
    title: 'Trop de tentatives',
    message: 'Patientez une minute avant de redemander un lien.',
  },
  server: {
    title: 'Le service est momentanément indisponible',
    message: 'Réessayez dans un instant.',
  },
  google: {
    title: 'Connexion Google indisponible',
    message: 'Utilisez le lien magique envoyé par e-mail.',
  },
};

function failureOf(error: unknown, fallback: Failure = 'server'): Failure {
  if (error instanceof NetworkError) return 'network';
  if (error instanceof ApiResponseError && error.status === 429) return 'rate-limit';
  return fallback;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const { session } = useSession();
  const [params] = useSearchParams();
  const [step, setStep] = useState<Step>({ name: 'form' });
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [failure, setFailure] = useState<Failure>();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const sentHeading = useRef<HTMLHeadingElement>(null);

  const returnedProblem = problemFromCode(params.get('error'));

  // Compte à rebours avant de pouvoir renvoyer le lien.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Après l'envoi, le focus va sur le titre : le changement d'écran est annoncé.
  useEffect(() => {
    if (step.name === 'sent') sentHeading.current?.focus();
  }, [step.name]);

  if (session.status === 'authenticated') return <Navigate to="/" replace />;

  async function send(address: string) {
    setFailure(undefined);
    setStep({ name: 'sending' });
    try {
      await requestMagicLink(address);
      setStep({ name: 'sent', email: address });
      setCooldown(RESEND_DELAY_SECONDS);
    } catch (error) {
      setFailure(failureOf(error));
      setStep({ name: 'form' });
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setFieldError('Saisissez une adresse e-mail valide, par exemple vous@exemple.fr');
      return;
    }
    setFieldError(undefined);
    void send(address);
  }

  async function onGoogle() {
    setFailure(undefined);
    setGoogleBusy(true);
    try {
      navigateExternal(await startGoogleSignIn());
    } catch (error) {
      setFailure(failureOf(error, 'google'));
      setGoogleBusy(false);
    }
  }

  const problem = failure ? FAILURES[failure] : returnedProblem;

  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <div className={styles.logo} aria-hidden="true">
          <span className={styles.logoInk} />
          <span className={styles.logoBlue} />
          <span className={styles.logoBlue} />
          <span className={styles.logoLime} />
          <span className={styles.logoBlue} />
        </div>
        <h1 className={styles.title}>
          Tableau
          <br />
          Clair
        </h1>
        <p className={styles.tagline}>Sachez quel disjoncteur couper, sans deviner.</p>
      </div>

      <section className={styles.sheet} aria-labelledby="login-heading">
        {step.name === 'sent' ? (
          <div className={styles.sent}>
            <span className={styles.sentIcon}>
              <Icon name="mail" size={28} />
            </span>
            <h2 id="login-heading" className={styles.heading} tabIndex={-1} ref={sentHeading}>
              Consultez votre boîte mail
            </h2>
            <p className={styles.help}>
              Si <strong>{step.email}</strong> est autorisée, un lien de connexion vient d'être
              envoyé. Il est valable quelques minutes et ne fonctionne qu'une fois.
            </p>
            <p className={styles.help}>Pensez à vérifier vos courriers indésirables.</p>

            <div className={styles.actions}>
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                disabled={cooldown > 0}
                onClick={() => void send(step.email)}
              >
                {cooldown > 0 ? `Renvoyer le lien (${cooldown} s)` : 'Renvoyer le lien'}
              </Button>
              <Button variant="ghost" size="lg" fullWidth onClick={() => setStep({ name: 'form' })}>
                Utiliser une autre adresse
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h2 id="login-heading" className={styles.heading}>
              Se connecter
            </h2>
            <p className={styles.help}>
              Pas de mot de passe : un lien arrive dans votre boîte mail.
            </p>

            {problem && (
              <div role="alert" className={styles.problem}>
                <Icon name="warning" size={20} />
                <div>
                  <strong>{problem.title}</strong>
                  <p>{problem.message}</p>
                </div>
              </div>
            )}

            <form onSubmit={onSubmit} noValidate className={styles.form}>
              <TextField
                label="Adresse e-mail"
                icon="mail"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                placeholder="vous@exemple.fr"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={fieldError}
              />
              <Button type="submit" size="lg" fullWidth disabled={step.name === 'sending'}>
                {step.name === 'sending' ? 'Envoi en cours…' : 'Recevoir un lien magique'}
              </Button>
            </form>

            <div className={styles.separator} aria-hidden="true">
              <span />
              ou
              <span />
            </div>

            <Button
              variant="outline"
              size="lg"
              fullWidth
              onClick={() => void onGoogle()}
              disabled={googleBusy}
            >
              <GoogleMark />
              {googleBusy ? 'Redirection…' : 'Continuer avec Google'}
            </Button>
          </>
        )}

        <p className={styles.closed}>
          <Icon name="lock" size={20} />
          <span>Accès sur invitation : les inscriptions sont fermées pour le moment.</span>
        </p>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        d="M16.5 12.2H12v1.8h2.6c-.4 1.3-1.4 1.9-2.6 1.9a3 3 0 010-6c.7 0 1.2.2 1.7.7l1.3-1.3A4.8 4.8 0 0012 8.2a4.8 4.8 0 100 9.6c2.7 0 4.6-1.9 4.6-4.6 0-.4 0-.7-.1-1z"
        fill="#fff"
      />
    </svg>
  );
}
