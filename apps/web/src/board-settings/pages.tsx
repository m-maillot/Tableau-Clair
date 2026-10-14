import { Link, useNavigate, useParams } from 'react-router';
import { useBoard, useBoards, useProperties, useSelectedProperty } from '../home/queries';
import { BoardCard } from '../home/BoardCard';
import { Button } from '../ui';
import { BoardForm } from './BoardForm';
import styles from './pages.module.css';

function Status({ children, role = 'status' }: { children: string; role?: 'status' | 'alert' }) {
  return (
    <main className={styles.page}>
      <p role={role} className={styles.status}>
        {children}
      </p>
    </main>
  );
}

/** `/tableaux/nouveau` : création, dans le logement actif. */
export function NewBoardPage() {
  const navigate = useNavigate();
  const properties = useProperties();
  const [property] = useSelectedProperty(properties.data);

  if (properties.isPending) return <Status>Chargement…</Status>;
  if (properties.isError) return <Status role="alert">Impossible de charger vos logements.</Status>;
  if (!property) {
    return (
      <main className={styles.page}>
        <p className={styles.status}>Créez d'abord un logement pour y ajouter un tableau.</p>
        <Link to="/" className={styles.link}>
          Retour à l'accueil
        </Link>
      </main>
    );
  }

  return (
    <BoardForm
      propertyId={property.id}
      propertyName={property.name}
      onCancel={() => navigate('/')}
      onSaved={(board) => navigate(`/tableaux/${board.id}`, { replace: true })}
    />
  );
}

/** `/tableaux/:boardId/parametres` : modification, duplication, suppression. */
export function BoardSettingsPage() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const board = useBoard(boardId);
  const properties = useProperties();

  if (board.isPending || properties.isPending) return <Status>Chargement…</Status>;
  if (board.isError || !board.data) {
    return (
      <main className={styles.page}>
        <p role="alert" className={styles.status}>
          Ce tableau est introuvable.
        </p>
        <Link to="/tableaux" className={styles.link}>
          Voir mes tableaux
        </Link>
      </main>
    );
  }

  const data = board.data;
  const property = properties.data?.find((p) => p.id === data.propertyId);

  return (
    <BoardForm
      // Re-monte le formulaire quand le tableau change (rechargement après un conflit).
      key={`${data.id}-${data.version}`}
      propertyId={data.propertyId}
      propertyName={property?.name ?? ''}
      board={data}
      onCancel={() => navigate(`/tableaux/${data.id}`)}
      onSaved={(saved) => navigate(`/tableaux/${saved.id}`)}
      onDuplicated={(copy) => navigate(`/tableaux/${copy.id}/parametres`)}
      onDeleted={() => navigate('/tableaux', { replace: true })}
      onReload={() => void board.refetch()}
    />
  );
}

/** `/tableaux` : liste des tableaux du logement actif. */
export function BoardsPage() {
  const properties = useProperties();
  const [property] = useSelectedProperty(properties.data);
  const boards = useBoards(property?.id);

  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.heading}>Tableaux</h1>
        <Link to="/tableaux/nouveau" className={styles.add}>
          Ajouter un tableau
        </Link>
      </div>
      {property && <p className={styles.subtitle}>{property.name}</p>}

      {boards.isError && (
        <p role="alert" className={styles.status}>
          Impossible de charger les tableaux.
        </p>
      )}
      {(properties.isPending || boards.isPending) && !boards.isError && (
        <p role="status" className={styles.status}>
          Chargement…
        </p>
      )}
      {boards.data && boards.data.length === 0 && (
        <div className={styles.empty}>
          <p>Aucun tableau pour l'instant.</p>
          <Link to="/tableaux/nouveau">
            <Button>Ajouter un tableau</Button>
          </Link>
        </div>
      )}
      {boards.data && boards.data.length > 0 && (
        <ul className={styles.list}>
          {boards.data.map((board) => (
            <li key={board.id}>
              <BoardCard board={board} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
