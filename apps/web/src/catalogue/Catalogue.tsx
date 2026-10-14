import { useState } from 'react';
import {
  BottomSheet,
  Button,
  IconButton,
  StatusChip,
  Stepper,
  TabBar,
  TextField,
  TypeChip,
  type TabItem,
} from '../ui';
import styles from './Catalogue.module.css';

const TABS: TabItem[] = [
  { id: 'home', label: 'Accueil', icon: 'home', href: '#accueil' },
  { id: 'boards', label: 'Tableaux', icon: 'boards', href: '#tableaux' },
  { id: 'plan', label: 'Plan', icon: 'plan', href: '#plan' },
  { id: 'verify', label: 'À vérifier', icon: 'verify', href: '#verifier', badge: 9 },
];

const SWATCHES = [
  ['ink', 'Texte, différentiels, sélection'],
  ['blue', 'Action primaire, disjoncteurs'],
  ['lime', 'Accent, sélection, action rapide'],
  ['surface', 'Cartes, champs'],
  ['bg-soft', 'Fond de page bureau'],
  ['muted', 'Texte secondaire'],
  ['module-other', 'Contacteur, parafoudre…'],
  ['slot-border', 'Module libre'],
  ['status-verified-bg', 'Statut vérifiée'],
  ['status-assumed-bg', 'Statut supposée'],
  ['status-unknown-bg', 'Statut inconnue'],
] as const;

const KINDS = [
  { label: 'Disjoncteur', width: 1 },
  { label: 'Différentiel', width: 2 },
  { label: 'Contacteur HC', width: 1 },
  { label: 'Parafoudre', width: 2 },
  { label: 'Compteur', width: 2 },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

/** Page interne : tous les composants de base dans leurs variantes et états. */
export function Catalogue() {
  const [kind, setKind] = useState('Disjoncteur');
  const [width, setWidth] = useState(1);
  const [sheet, setSheet] = useState<null | 'modal' | 'persistent'>(null);
  const [tab, setTab] = useState('home');
  const spaceLeft = 1;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Catalogue des composants</h1>
      <p className={styles.lead}>
        Tokens et composants de base, tels que décrits par les maquettes. Cette page n'est servie
        qu'en développement.
      </p>

      <Section title="Couleurs">
        <ul className={styles.swatches}>
          {SWATCHES.map(([name, usage]) => (
            <li key={name} className={styles.swatch}>
              <span className={styles.chip} style={{ background: `var(--color-${name})` }} />
              <span>
                <strong>{name}</strong>
                <br />
                <span className={styles.muted}>{usage}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Boutons">
        <div className={styles.row}>
          <Button>Principal</Button>
          <Button variant="secondary">Secondaire</Button>
          <Button variant="lime">Je viens de le couper</Button>
          <Button variant="outline" icon="mail">
            Continuer avec Google
          </Button>
          <Button variant="ghost">Voir tout</Button>
          <Button disabled>Désactivé</Button>
        </div>
        <div className={styles.column}>
          <Button size="lg" fullWidth>
            Recevoir un lien magique
          </Button>
          <Button size="lg" variant="secondary" fullWidth>
            Annuler
          </Button>
        </div>
        <div className={styles.row}>
          <IconButton label="Fermer" icon="close" />
          <IconButton label="Annuler la dernière action" icon="undo" variant="ink" />
          <IconButton label="Rechercher" icon="search" variant="white" />
        </div>
      </Section>

      <Section title="Champs">
        <div className={styles.column}>
          <TextField
            label="Adresse e-mail"
            icon="mail"
            type="email"
            placeholder="vous@exemple.fr"
          />
          <TextField
            label="Libellé"
            placeholder="Ex. Prises garage"
            hint="Visible sur l'étiquette"
          />
          <TextField
            label="Libellé"
            defaultValue=""
            error="Le libellé est obligatoire"
            placeholder="Ex. Prises garage"
          />
        </div>
      </Section>

      <Section title="Statuts">
        <div className={styles.row}>
          <StatusChip status="verified" />
          <StatusChip status="assumed" />
          <StatusChip status="unknown" />
          <StatusChip status="unknown" label="À identifier" />
        </div>
      </Section>

      <Section title="Types d'appareil et largeur">
        <div className={styles.row}>
          {KINDS.map((k) => (
            <TypeChip
              key={k.label}
              label={k.label}
              width={k.width}
              selected={kind === k.label}
              disabled={k.width > spaceLeft}
              disabledReason={`${k.width} modules requis, ${spaceLeft} disponible`}
              onClick={() => {
                setKind(k.label);
                setWidth(k.width);
              }}
            />
          ))}
          <TypeChip label="Réserve" width={1} variant="dashed" />
          <TypeChip label="Autre appareil…" variant="outline" />
        </div>
        <p className={styles.muted}>Espace libre simulé : {spaceLeft} module.</p>
        <div className={styles.row}>
          <Stepper
            label="Largeur"
            value={width}
            onChange={setWidth}
            min={1}
            max={4}
            unit="modules"
          />
        </div>
      </Section>

      <Section title="Feuilles basses">
        <div className={styles.row}>
          <Button onClick={() => setSheet('modal')}>Feuille modale</Button>
          <Button variant="secondary" onClick={() => setSheet('persistent')}>
            Feuille persistante
          </Button>
        </div>
      </Section>

      <Section title="Barre d'onglets">
        <p className={styles.muted}>
          Fixée en bas de l'écran ; l'onglet actif est en bleu et gras.
        </p>
      </Section>

      <BottomSheet
        open={sheet === 'modal'}
        onClose={() => setSheet(null)}
        title="Ajouter un appareil"
        description="Rangée 1 · module 21 · 4 modules disponibles"
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setSheet(null)}>
              Annuler
            </Button>
            <Button size="lg" onClick={() => setSheet(null)} className={styles.grow}>
              Ajouter au module 21
            </Button>
          </>
        }
      >
        <TextField label="Libellé" placeholder="Ex. Prises garage" />
      </BottomSheet>

      <BottomSheet
        modal={false}
        open={sheet === 'persistent'}
        onClose={() => setSheet(null)}
        title="Prises cuisine"
        description="Disjoncteur 16 A · module 4"
      >
        <p>Feuille de détail : l'écran derrière reste utilisable.</p>
      </BottomSheet>

      <TabBar
        items={TABS}
        current={tab}
        renderLink={(props) => (
          <a
            {...props}
            onClick={(event) => {
              event.preventDefault();
              setTab(TABS.find((t) => t.href === props.href)!.id);
            }}
          />
        )}
      />
    </main>
  );
}
