import { useState, type FormEvent } from 'react';
import { Button, Icon, TextField } from '../ui';
import { useCreateProperty } from './queries';
import styles from './FirstProperty.module.css';

/** Première visite : aucun logement, on en crée un avant toute chose. */
export function FirstProperty({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const create = useCreateProperty();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const property = await create.mutateAsync({ name: name.trim() });
    onCreated(property.id);
  }

  return (
    <section className={styles.card} aria-labelledby="first-title">
      <span className={styles.icon}>
        <Icon name="home" size={28} />
      </span>
      <h2 id="first-title" className={styles.title}>
        Créez votre premier logement
      </h2>
      <p className={styles.text}>
        Un logement regroupe vos tableaux électriques et le plan de la maison. Vous pourrez en
        ajouter d'autres plus tard.
      </p>
      <form onSubmit={onSubmit} className={styles.form}>
        <TextField
          label="Nom du logement"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Maison, appartement, résidence secondaire…"
          maxLength={120}
          error={create.isError ? 'Création impossible, réessayez.' : undefined}
        />
        <Button type="submit" size="lg" fullWidth disabled={!name.trim() || create.isPending}>
          {create.isPending ? 'Création…' : 'Créer le logement'}
        </Button>
      </form>
    </section>
  );
}
