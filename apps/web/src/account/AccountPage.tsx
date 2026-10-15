import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { ApiResponseError, deleteAccount, fetchAccountExport } from '../api/client';
import { useSession } from '../auth/session';
import { plural } from '../home/format';
import { useAccount } from '../home/queries';
import { Alert, BottomSheet, Button, Icon, TextField } from '../ui';
import styles from './AccountPage.module.css';

/** Déclenche le téléchargement d'un fichier dans le navigateur. */
function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** `/compte` : identité, export des données, déconnexion, suppression, mention d'information. */
export function AccountPage() {
  const { session, signOut, refresh } = useSession();
  const account = useAccount();
  const [exportFailed, setExportFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState('');

  const exportData = useMutation({
    mutationFn: fetchAccountExport,
    onSuccess: ({ blob, fileName }) => {
      setExportFailed(false);
      download(blob, fileName);
    },
    onError: () => setExportFailed(true),
  });

  const remove = useMutation({
    mutationFn: () => deleteAccount(typed.trim()),
    // La session n'existe plus côté serveur : on la relit, ce qui renvoie à la connexion.
    onSuccess: () => refresh(),
  });

  if (session.status !== 'authenticated') return null;
  const email = account.data?.email ?? session.user.email;
  const confirmed = typed.trim().toLowerCase() === email.toLowerCase();

  const close = () => {
    setDeleting(false);
    setTyped('');
    remove.reset();
  };

  const summary = account.data;
  const deleted = summary?.deletedProperties ?? [];
  const left = summary?.leftProperties ?? [];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.back} aria-label="Retour à l’accueil">
          <Icon name="chevron-left" size={20} />
        </Link>
        <h1 className={styles.title}>Mon compte</h1>
      </header>

      <section className={styles.card} aria-label="Identité">
        <p className={styles.name}>{session.user.displayName ?? email}</p>
        <p className={styles.muted}>{email}</p>
        <p className={styles.muted}>Connexion par lien magique ou Google.</p>
      </section>

      <section className={styles.card} aria-labelledby="data-title">
        <h2 id="data-title" className={styles.section}>
          Mes données
        </h2>
        <p className={styles.muted}>
          Un fichier JSON avec vos logements, tableaux, plans, liaisons et modèles. Les photos y
          sont référencées par des liens (accessibles une fois connecté).
        </p>
        <Button
          variant="secondary"
          icon="download"
          disabled={exportData.isPending}
          onClick={() => exportData.mutate()}
        >
          {exportData.isPending ? 'Préparation…' : 'Exporter mes données (JSON)'}
        </Button>
        {exportFailed && <Alert>L’export a échoué. Réessayez.</Alert>}
      </section>

      <section className={styles.card} aria-labelledby="session-title">
        <h2 id="session-title" className={styles.section}>
          Session
        </h2>
        <Button variant="secondary" onClick={() => void signOut()}>
          Se déconnecter
        </Button>
      </section>

      <section className={styles.card} aria-labelledby="privacy-title">
        <h2 id="privacy-title" className={styles.section}>
          Vos données personnelles
        </h2>
        <ul className={styles.list}>
          <li>
            Nous conservons votre adresse e-mail, votre nom affiché, le nom et l’adresse
            (facultative) de vos logements, et les photos que vous ajoutez.
          </li>
          <li>
            Aucun traceur tiers. Seuls l’envoi des e-mails et, si vous le choisissez, Google voient
            votre adresse.
          </li>
          <li>
            Vous pouvez exporter vos données à tout moment et supprimer votre compte ci-dessous.
          </li>
        </ul>
      </section>

      <section className={`${styles.card} ${styles.danger}`} aria-labelledby="delete-title">
        <h2 id="delete-title" className={styles.section}>
          Supprimer mon compte
        </h2>
        <p className={styles.muted}>
          Votre compte et les logements dont vous êtes la seule personne propriétaire sont supprimés
          définitivement, photos comprises.
        </p>
        <Button variant="danger-soft" icon="trash" onClick={() => setDeleting(true)}>
          Supprimer mon compte…
        </Button>
      </section>

      <BottomSheet
        open={deleting}
        onClose={close}
        title="Supprimer votre compte ?"
        description="Cette action est définitive."
        footer={
          <div className={styles.footer}>
            <Button
              variant="danger"
              size="lg"
              fullWidth
              disabled={!confirmed || remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? 'Suppression…' : 'Supprimer définitivement'}
            </Button>
            <Button variant="secondary" size="lg" fullWidth onClick={close}>
              Annuler
            </Button>
          </div>
        }
      >
        <div className={styles.impact}>
          <p className={styles.label}>Sera supprimé</p>
          {account.isPending ? (
            <p className={styles.muted}>Calcul de l’impact…</p>
          ) : deleted.length === 0 ? (
            <p className={styles.muted}>Aucun logement : seul votre compte est supprimé.</p>
          ) : (
            <ul className={styles.list}>
              {deleted.map((p) => (
                <li key={p.id}>
                  <strong>{p.name}</strong> — {p.boardCount}{' '}
                  {plural(p.boardCount, 'tableau', 'tableaux')}
                  {p.otherMembers > 0
                    ? `, ${p.otherMembers} ${plural(p.otherMembers, 'autre personne perd', 'autres personnes perdent')} l’accès`
                    : ''}
                </li>
              ))}
            </ul>
          )}
          {left.length > 0 && (
            <>
              <p className={styles.label}>Conservé sans vous</p>
              <ul className={styles.list}>
                {left.map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        <button
          type="button"
          className={styles.exportLink}
          onClick={() => exportData.mutate()}
          disabled={exportData.isPending}
        >
          <Icon name="download" size={18} />
          Exporter mes données avant (JSON)
        </button>
        <TextField
          label={`Pour confirmer, saisissez ${email}`}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
        />
        {remove.isError && (
          <Alert>
            {remove.error instanceof ApiResponseError &&
            remove.error.code === 'confirmation_mismatch'
              ? 'L’adresse saisie ne correspond pas au compte.'
              : 'La suppression a échoué. Réessayez.'}
          </Alert>
        )}
      </BottomSheet>
    </main>
  );
}
