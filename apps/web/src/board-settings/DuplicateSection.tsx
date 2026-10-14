import type { Board } from '@tableau-clair/contracts';
import { LIMITS } from '@tableau-clair/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { duplicateBoard } from '../api/client';
import { keys } from '../home/queries';
import { Button, TextField } from '../ui';
import styles from './Sections.module.css';

const SUFFIX = ' (copie)';

export function proposedCopyName(name: string) {
  return name.slice(0, LIMITS.maxNameLength - SUFFIX.length) + SUFFIX;
}

interface DuplicateSectionProps {
  board: Board;
  onDuplicated: (copy: Board) => void;
}

export function DuplicateSection({ board, onDuplicated }: DuplicateSectionProps) {
  const client = useQueryClient();
  const [name, setName] = useState(proposedCopyName(board.name));
  const copy = useMutation({
    mutationFn: () => duplicateBoard(board.id, name.trim()),
    onSuccess: async (created) => {
      await client.invalidateQueries({ queryKey: keys.boards(board.propertyId) });
      await client.invalidateQueries({ queryKey: keys.overview(board.propertyId) });
      onDuplicated(created);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) copy.mutate();
  }

  return (
    <section className={styles.card} aria-labelledby="duplicate-title">
      <h2 id="duplicate-title" className={styles.title}>
        Dupliquer ce tableau
      </h2>
      <p className={styles.text}>
        Crée une copie de la composition (rangées et éléments). Les liaisons avec les équipements du
        plan ne sont pas copiées.
      </p>
      <form onSubmit={onSubmit} className={styles.inline}>
        <TextField
          label="Nom de la copie"
          value={name}
          maxLength={LIMITS.maxNameLength}
          onChange={(event) => setName(event.target.value)}
          className={styles.grow}
          error={copy.isError ? 'La copie a échoué. Réessayez.' : undefined}
        />
        <Button
          type="submit"
          icon="copy"
          disabled={!name.trim() || copy.isPending}
          className={styles.inlineButton}
        >
          {copy.isPending ? 'Création…' : 'Créer la copie'}
        </Button>
      </form>
    </section>
  );
}
