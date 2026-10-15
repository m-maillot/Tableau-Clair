import { useState } from 'react';
import { Link } from 'react-router';
import { useSession } from '../auth/session';
import { Button, Icon } from '../ui';
import { BoardCard } from './BoardCard';
import { FirstProperty } from './FirstProperty';
import { greetingName, plural } from './format';
import styles from './HomePage.module.css';
import { PropertyPicker } from './PropertyPicker';
import {
  MIN_SEARCH_LENGTH,
  useBoards,
  useDebouncedValue,
  useOverview,
  useProperties,
  useSearch,
  useSelectedProperty,
} from './queries';
import { ReliabilityCard } from './ReliabilityCard';
import { SearchResults } from './SearchResults';

export function HomePage() {
  const { session } = useSession();
  const properties = useProperties();
  const [selected, select] = useSelectedProperty(properties.data);
  const boards = useBoards(selected?.id);
  const overview = useOverview(selected?.id);

  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim());
  const search = useSearch(selected?.id, debounced);
  const searching = query.trim().length >= MIN_SEARCH_LENGTH;

  if (session.status !== 'authenticated') return null;
  const name = greetingName(session.user);

  const header = (
    <header className={styles.header}>
      <div>
        <h1 className={styles.greeting}>Bonjour, {name}</h1>
        {selected && properties.data && (
          <PropertyPicker
            properties={properties.data}
            selected={selected}
            boardCount={overview.data?.boardCount ?? boards.data?.length}
            onSelect={select}
          />
        )}
      </div>
      <Link to="/compte" aria-label="Mon compte" className={styles.avatarLink}>
        <span className={styles.avatar} role="img" aria-label={`Compte de ${name}`}>
          {name.charAt(0)}
        </span>
      </Link>
    </header>
  );

  if (properties.isPending) {
    return (
      <main className={styles.page}>
        {header}
        <p role="status" className={styles.status}>
          Chargement…
        </p>
      </main>
    );
  }

  if (properties.isError) {
    return (
      <main className={styles.page}>
        {header}
        <div className={styles.errorBox} role="alert">
          <strong>Impossible de charger vos logements</strong>
          <p>Vérifiez votre connexion, puis réessayez.</p>
          <Button onClick={() => void properties.refetch()}>Réessayer</Button>
        </div>
      </main>
    );
  }

  if (!selected) {
    return (
      <main className={styles.page}>
        {header}
        <FirstProperty onCreated={select} />
      </main>
    );
  }

  const unknown = overview.data?.reliability.unknown ?? 0;
  const assumed = overview.data?.reliability.assumed ?? 0;
  const total = overview.data?.reliability.total ?? 0;

  return (
    <main className={styles.page}>
      {header}

      <div className={styles.search} role="search">
        <Icon name="search" size={20} />
        <input
          type="search"
          aria-label="Rechercher"
          placeholder="Quelle prise ? Quel disjoncteur ?"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={styles.searchInput}
        />
      </div>

      {searching ? (
        <section aria-label="Recherche" className={styles.section}>
          {search.isError ? (
            <p role="alert" className={styles.status}>
              La recherche a échoué. Réessayez.
            </p>
          ) : search.isPending || debounced !== query.trim() ? (
            <p role="status" className={styles.status}>
              Recherche…
            </p>
          ) : search.data.length === 0 ? (
            <p role="status" className={styles.status}>
              Aucun résultat pour « {debounced} ».
            </p>
          ) : (
            <SearchResults results={search.data} />
          )}
        </section>
      ) : (
        <>
          <div className={styles.block}>
            {overview.isError ? (
              <p role="alert" className={styles.status}>
                Impossible de calculer la fiabilité du repérage.
              </p>
            ) : overview.data ? (
              <ReliabilityCard overview={overview.data} />
            ) : (
              <p role="status" className={styles.status}>
                Chargement…
              </p>
            )}
          </div>

          <section className={styles.section} aria-labelledby="boards-title">
            <div className={styles.sectionHeader}>
              <h2 id="boards-title" className={styles.sectionTitle}>
                Tableaux
              </h2>
              <Link to="/tableaux" className={styles.link}>
                Voir tout
              </Link>
            </div>

            {boards.isError ? (
              <p role="alert" className={styles.status}>
                Impossible de charger les tableaux.
              </p>
            ) : boards.isPending ? (
              <p role="status" className={styles.status}>
                Chargement…
              </p>
            ) : boards.data.length === 0 ? (
              <div className={styles.emptyBoards}>
                <p>Aucun tableau pour l'instant.</p>
                <Link to="/tableaux/nouveau" className={styles.emptyAction}>
                  Ajouter un tableau
                </Link>
              </div>
            ) : (
              <ul className={styles.boards}>
                {boards.data.map((board) => (
                  <li key={board.id}>
                    <BoardCard board={board} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {total > 0 && unknown + assumed === 0 && (
            <p className={styles.allGood}>
              <Icon name="check" size={20} strokeWidth={3} />
              Tout est vérifié : bravo, le repérage est à jour.
            </p>
          )}

          {unknown > 0 && (
            <aside className={styles.alert} aria-label="À vérifier">
              <span className={styles.alertIcon}>
                <Icon name="warning" size={22} />
              </span>
              <div>
                <p>
                  {unknown}{' '}
                  {plural(
                    unknown,
                    "équipement n'a pas encore de disjoncteur identifié.",
                    "équipements n'ont pas encore de disjoncteur identifié.",
                  )}
                </p>
                <Link to="/verifier" className={styles.alertAction}>
                  Commencer à vérifier
                </Link>
              </div>
            </aside>
          )}
        </>
      )}
    </main>
  );
}
