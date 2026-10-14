import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  BottomSheet,
  Button,
  IconButton,
  StatusChip,
  Stepper,
  TabBar,
  TextField,
  TypeChip,
} from '.';

describe('Button / IconButton', () => {
  it('est de type button par défaut (jamais de soumission accidentelle)', () => {
    render(<Button>Valider</Button>);
    expect(screen.getByRole('button', { name: 'Valider' })).toHaveAttribute('type', 'button');
  });

  it('déclenche onClick, sauf désactivé', async () => {
    const onClick = vi.fn();
    render(
      <>
        <Button onClick={onClick}>Actif</Button>
        <Button onClick={onClick} disabled>
          Inactif
        </Button>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actif' }));
    await userEvent.click(screen.getByRole('button', { name: 'Inactif' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('nomme le bouton-icône et masque le pictogramme', () => {
    render(<IconButton label="Annuler la dernière action" icon="undo" />);
    const button = screen.getByRole('button', { name: 'Annuler la dernière action' });
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('TextField', () => {
  it('associe le libellé au champ', () => {
    render(<TextField label="Adresse e-mail" />);
    expect(screen.getByLabelText('Adresse e-mail')).toBeInTheDocument();
  });

  it('relie indication et erreur au champ et le marque invalide', () => {
    render(<TextField label="Libellé" hint="Visible sur l'étiquette" error="Obligatoire" />);
    const input = screen.getByLabelText('Libellé');
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription("Visible sur l'étiquette Obligatoire");
    expect(screen.getByRole('alert')).toHaveTextContent('Obligatoire');
  });

  it('transmet la saisie', async () => {
    const onChange = vi.fn();
    render(<TextField label="Libellé" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Libellé'), 'Four');
    expect(onChange).toHaveBeenCalledTimes(4);
  });
});

describe('StatusChip', () => {
  it.each([
    ['verified', 'Vérifiée'],
    ['assumed', 'Supposée'],
    ['unknown', 'Inconnue'],
  ] as const)('affiche un libellé textuel pour %s', (status, label) => {
    render(<StatusChip status={status} />);
    const chip = screen.getByText(label);
    expect(chip).toBeInTheDocument();
    // Le sens n'est pas porté par la couleur seule : une icône accompagne le libellé.
    expect(chip.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('accepte un libellé personnalisé', () => {
    render(<StatusChip status="unknown" label="À identifier" />);
    expect(screen.getByText('À identifier')).toBeInTheDocument();
  });
});

describe('TypeChip', () => {
  it('affiche la largeur et expose l’état sélectionné', () => {
    render(<TypeChip label="Différentiel" width={2} selected />);
    const chip = screen.getByRole('button', { name: 'Différentiel · 2' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('est grisé et explique pourquoi', async () => {
    const onClick = vi.fn();
    render(
      <TypeChip
        label="Parafoudre"
        width={2}
        disabled
        disabledReason="2 modules requis, 1 disponible"
        onClick={onClick}
      />,
    );
    const chip = screen.getByRole('button', { name: /Parafoudre · 2/ });
    expect(chip).toBeDisabled();
    expect(chip).toHaveAccessibleName(/2 modules requis, 1 disponible/);
    await userEvent.click(chip);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Stepper', () => {
  it('incrémente et décrémente dans les bornes', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Stepper label="Largeur" value={2} min={1} max={3} onChange={onChange} unit="modules" />,
    );
    expect(screen.getByRole('group', { name: 'Largeur' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Augmenter : Largeur' }));
    expect(onChange).toHaveBeenLastCalledWith(3);
    await userEvent.click(screen.getByRole('button', { name: 'Diminuer : Largeur' }));
    expect(onChange).toHaveBeenLastCalledWith(1);

    rerender(<Stepper label="Largeur" value={3} min={1} max={3} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Augmenter : Largeur' })).toBeDisabled();
    rerender(<Stepper label="Largeur" value={1} min={1} max={3} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Diminuer : Largeur' })).toBeDisabled();
  });

  it('annonce la valeur avec son unité', () => {
    render(<Stepper label="Largeur" value={2} onChange={() => {}} unit="modules" />);
    expect(screen.getByRole('status')).toHaveTextContent('2 modules');
  });
});

describe('TabBar', () => {
  const items = [
    { id: 'home', label: 'Accueil', icon: 'home', href: '/' },
    { id: 'verify', label: 'À vérifier', icon: 'verify', href: '/verifier', badge: 9 },
  ] as const;

  it('marque l’onglet courant', () => {
    render(<TabBar items={items} current="verify" />);
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByRole('link', { name: /À vérifier/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Accueil' })).not.toHaveAttribute('aria-current');
  });

  it('annonce le comptage avec un texte, pas seulement une pastille', () => {
    render(<TabBar items={items} current="home" />);
    expect(screen.getByRole('link', { name: /À vérifier/ })).toHaveAccessibleName(/9 à vérifier/);
  });

  it('laisse brancher un routeur via renderLink', () => {
    render(
      <TabBar
        items={items}
        current="home"
        renderLink={({ children, href, ...rest }) => (
          <a data-router="true" href={`/app${href}`} {...rest}>
            {children}
          </a>
        )}
      />,
    );
    expect(screen.getByRole('link', { name: 'Accueil' })).toHaveAttribute('href', '/app/');
    expect(screen.getByRole('link', { name: 'Accueil' })).toHaveAttribute('data-router', 'true');
  });
});

describe('BottomSheet', () => {
  it('ne rend rien fermée', () => {
    render(
      <BottomSheet open={false} onClose={() => {}} title="Ajouter">
        contenu
      </BottomSheet>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('est une boîte de dialogue modale nommée et décrite', () => {
    render(
      <BottomSheet open onClose={() => {}} title="Ajouter un appareil" description="Module 21">
        <input aria-label="Libellé" />
      </BottomSheet>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un appareil' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Module 21');
  });

  it('déplace le focus dans la feuille, le rend à la fermeture et se ferme avec Échap', async () => {
    const onClose = vi.fn();
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button>Ouvrir</button>
          <BottomSheet open={open} onClose={onClose} title="Ajouter">
            <input aria-label="Libellé" />
          </BottomSheet>
        </>
      );
    }
    const { rerender } = render(<Harness open={false} />);
    const opener = screen.getByRole('button', { name: 'Ouvrir' });
    opener.focus();

    rerender(<Harness open />);
    expect(screen.getByRole('dialog')).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Harness open={false} />);
    expect(opener).toHaveFocus();
  });

  it('garde la tabulation dans la feuille modale', async () => {
    render(
      <>
        <button>Derrière</button>
        <BottomSheet open onClose={() => {}} title="Ajouter">
          <input aria-label="Libellé" />
        </BottomSheet>
      </>,
    );
    const close = screen.getByRole('button', { name: 'Fermer' });
    const input = screen.getByLabelText('Libellé');

    await userEvent.tab(); // feuille → Fermer
    expect(close).toHaveFocus();
    await userEvent.tab();
    expect(input).toHaveFocus();
    await userEvent.tab(); // dernier élément → retour au premier
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true }); // premier → dernier
    expect(input).toHaveFocus();
  });

  it('ferme au clic sur le fond et fige le défilement de la page', async () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <BottomSheet open onClose={onClose} title="Ajouter">
        contenu
      </BottomSheet>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    const backdrop = document.querySelector(
      '[aria-hidden="true"][class*="backdrop"]',
    ) as HTMLElement;
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('en mode persistant, reste une région sans piéger le focus ni figer la page', () => {
    render(
      <>
        <button>Reste utilisable</button>
        <BottomSheet modal={false} open onClose={() => {}} title="Prises cuisine">
          détail
        </BottomSheet>
      </>,
    );
    expect(screen.getByRole('region', { name: 'Prises cuisine' })).not.toHaveAttribute(
      'aria-modal',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });
});
