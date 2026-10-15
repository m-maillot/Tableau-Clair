import { Link, useNavigate, useParams } from 'react-router';
import { useBoard, useProperties, useSelectedProperty } from '../home/queries';
import { ErrorState } from '../ui';
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

/** `/tableaux/nouveau` : création d'un tableau (dans le logement par défaut). */
export function NewBoardPage() {
  const navigate = useNavigate();
  const properties = useProperties();
  const [property] = useSelectedProperty(properties.data);

  if (properties.isPending) return <Status>Chargement…</Status>;
  if (properties.isError || !property) {
    return (
      <main className={styles.page}>
        <ErrorState
          title="Impossible de préparer votre espace."
          text="Vérifiez votre connexion, puis réessayez."
          onRetry={() => void properties.refetch()}
        />
      </main>
    );
  }

  return (
    <BoardForm
      propertyId={property.id}
      propertyName=""
      onCancel={() => navigate('/tableaux')}
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
