import type { Property } from '@tableau-clair/contracts';
import { useState, type FormEvent } from 'react';
import { BottomSheet, Button, Icon, TextField } from '../ui';
import { useCreateProperty } from './queries';
import styles from './PropertyPicker.module.css';

interface PropertyPickerProps {
  properties: Property[];
  selected: Property;
  boardCount: number | undefined;
  onSelect: (id: string) => void;
}

export function PropertyPicker({
  properties,
  selected,
  boardCount,
  onSelect,
}: PropertyPickerProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const create = useCreateProperty();

  const close = () => {
    setOpen(false);
    setCreating(false);
    setName('');
    create.reset();
  };

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const created = await create.mutateAsync({ name: name.trim() });
    onSelect(created.id);
    close();
  }

  const summary =
    boardCount === undefined
      ? selected.name
      : `${selected.name} · ${boardCount} ${boardCount > 1 ? 'tableaux' : 'tableau'}`;

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        {summary}
        <Icon name="chevron-down" size={16} />
        <span className="sr-only">Changer de logement</span>
      </button>

      <BottomSheet open={open} onClose={close} title="Mes logements">
        <ul className={styles.list}>
          {properties.map((property) => (
            <li key={property.id}>
              <button
                type="button"
                className={styles.option}
                aria-current={property.id === selected.id ? 'true' : undefined}
                onClick={() => {
                  onSelect(property.id);
                  close();
                }}
              >
                <span>{property.name}</span>
                {property.id === selected.id && <Icon name="check" size={20} />}
              </button>
            </li>
          ))}
        </ul>

        {creating ? (
          <form onSubmit={onCreate} className={styles.form}>
            <TextField
              label="Nom du nouveau logement"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Résidence secondaire"
              maxLength={120}
              autoFocus
              error={create.isError ? 'Création impossible, réessayez.' : undefined}
            />
            <Button type="submit" size="lg" fullWidth disabled={!name.trim() || create.isPending}>
              {create.isPending ? 'Création…' : 'Créer le logement'}
            </Button>
          </form>
        ) : (
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            icon="plus"
            onClick={() => setCreating(true)}
          >
            Nouveau logement
          </Button>
        )}
      </BottomSheet>
    </>
  );
}
