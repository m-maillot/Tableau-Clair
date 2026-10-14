import type { Photo } from '@tableau-clair/contracts';
import { useRef, useState } from 'react';
import { ApiResponseError, NetworkError, photoUrl, uploadPhoto } from '../api/client';
import { Button, Icon } from '../ui';
import styles from './PhotoField.module.css';

interface PhotoFieldProps {
  propertyId: string;
  photoId: string | null;
  /** Usage de la photo côté stockage (taille maximale, rangement). */
  usage?: 'board' | 'element' | 'fixture' | 'floor_background';
  /** Intitulé affiché et lu (« Photo du tableau », « Photo de l'appareil »). */
  title?: string;
  hint?: string;
  /** Appelé avec l'identifiant de la nouvelle photo (ou `null` pour la retirer). */
  onChange: (photoId: string | null, uploaded?: boolean, photo?: Photo) => void;
}

function uploadError(error: unknown): string {
  if (error instanceof NetworkError) return 'Serveur injoignable. Vérifiez votre connexion.';
  if (error instanceof ApiResponseError) {
    if (error.status === 413) return 'Image trop volumineuse (15 Mo au maximum).';
    if (error.status === 415 || error.code === 'unsupported_format') {
      return 'Format non pris en charge : utilisez une image JPEG, PNG ou WebP.';
    }
    if (error.status === 422) return 'Ce fichier ne semble pas être une image lisible.';
  }
  return "L'envoi de la photo a échoué. Réessayez.";
}

export function PhotoField({
  propertyId,
  photoId,
  usage = 'board',
  title = 'Photo du tableau',
  hint = 'Aide à retrouver le coffret. Redimensionnée, sans géolocalisation.',
  onChange,
}: PhotoFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    setBusy(true);
    try {
      const photo = await uploadPhoto(propertyId, file, usage);
      onChange(photo.id, true, photo);
    } catch (problem) {
      setError(uploadError(problem));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className={styles.field}>
      <div className={styles.row}>
        <div className={styles.thumb}>
          {photoId ? (
            <img src={photoUrl(photoId)} alt={title} className={styles.image} />
          ) : (
            <Icon name="camera" size={28} strokeWidth={2} />
          )}
        </div>
        <div className={styles.text}>
          <p className={styles.title}>{title}</p>
          <p className={styles.hint}>{hint}</p>
        </div>
        <div className={styles.actions}>
          <Button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className={styles.choose}
          >
            {busy ? 'Envoi…' : photoId ? 'Changer' : 'Choisir…'}
          </Button>
          {photoId && !busy && (
            <button type="button" className={styles.remove} onClick={() => onChange(null)}>
              Retirer<span className="sr-only"> la photo</span>
            </button>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Fichier : ${title}`}
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
