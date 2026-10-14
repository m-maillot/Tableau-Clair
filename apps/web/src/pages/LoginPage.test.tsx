import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { navigateExternal } from '../api/browser';
import { SessionProvider } from '../auth/session';

vi.mock('../api/browser', () => ({ navigateExternal: vi.fn() }));

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const USER = {
  id: '0b0f8a5e-6b0a-4c43-9d46-3b3c2d3b6c11',
  email: 'martial@racomach.fr',
  displayName: null,
};

/** Simule le serveur : une table d'URL → réponse, et un journal des appels. */
function mockServer(routes: Record<string, Handler>) {
  const calls: { url: string; init?: RequestInit | undefined }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const handler = routes[url];
      if (!handler) throw new Error(`appel inattendu : ${url}`);
      return handler(init);
    }),
  );
  return calls;
}

const anonymous: Record<string, Handler> = { '/api/me': () => json({}, 401) };

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </MemoryRouter>,
  );
}

async function openLogin(path = '/connexion') {
  renderAt(path);
  return screen.findByRole('heading', { name: 'Se connecter' });
}

beforeEach(() => vi.mocked(navigateExternal).mockClear());
afterEach(() => vi.unstubAllGlobals());

describe('écran de connexion', () => {
  it('propose le lien magique et Google, et mentionne que les inscriptions sont fermées', async () => {
    mockServer(anonymous);
    await openLogin();

    expect(screen.getByLabelText('Adresse e-mail')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recevoir un lien magique' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuer avec Google' })).toBeInTheDocument();
    expect(screen.getByText(/les inscriptions sont fermées/i)).toBeInTheDocument();
  });

  it('redirige un visiteur anonyme vers /connexion', async () => {
    mockServer(anonymous);
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Se connecter' })).toBeInTheDocument();
  });

  it('renvoie un utilisateur déjà connecté vers l’accueil', async () => {
    mockServer({ '/api/me': () => json(USER) });
    renderAt('/connexion');
    expect(await screen.findByRole('heading', { name: /Bonjour/ })).toBeInTheDocument();
  });

  it('indique quand la session ne peut pas être vérifiée, sans la déclarer expirée', async () => {
    mockServer({ '/api/me': () => json({}, 500) });
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Serveur injoignable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});

describe('lien magique', () => {
  it('refuse une adresse mal formée sans appeler le serveur', async () => {
    const calls = mockServer(anonymous);
    await openLogin();

    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'pas-une-adresse');
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir un lien magique' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/adresse e-mail valide/i);
    expect(calls.filter((c) => c.url.includes('magic-link'))).toHaveLength(0);
  });

  it('envoie la demande et annonce de façon neutre que le lien a été envoyé', async () => {
    const calls = mockServer({
      ...anonymous,
      '/api/auth/sign-in/magic-link': () => json({ status: true }),
    });
    await openLogin();

    await userEvent.type(screen.getByLabelText('Adresse e-mail'), '  martial@racomach.fr ');
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir un lien magique' }));

    const heading = await screen.findByRole('heading', { name: 'Consultez votre boîte mail' });
    expect(heading).toHaveFocus();
    // Formulation conditionnelle : ne révèle pas si l'adresse est autorisée.
    expect(
      screen.getByText(/est autorisée, un lien de connexion vient d'être envoyé/),
    ).toBeInTheDocument();

    const call = calls.find((c) => c.url.includes('magic-link'))!;
    expect(JSON.parse(call.init!.body as string)).toMatchObject({
      email: 'martial@racomach.fr',
      callbackURL: '/',
      errorCallbackURL: '/connexion',
    });
  });

  it('affiche exactement le même écran pour toute adresse', async () => {
    mockServer({
      ...anonymous,
      '/api/auth/sign-in/magic-link': () => json({ status: true }),
    });
    await openLogin();
    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'inconnu@exemple.fr');
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir un lien magique' }));

    expect(
      await screen.findByRole('heading', { name: 'Consultez votre boîte mail' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/refus|interdit|inconnu(e)? du système/i)).not.toBeInTheDocument();
  });

  it('bloque le renvoi pendant le délai puis revient au formulaire pour changer d’adresse', async () => {
    mockServer({
      ...anonymous,
      '/api/auth/sign-in/magic-link': () => json({ status: true }),
    });
    await openLogin();
    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'martial@racomach.fr');
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir un lien magique' }));
    await screen.findByRole('heading', { name: 'Consultez votre boîte mail' });

    expect(screen.getByRole('button', { name: /Renvoyer le lien \(30 s\)/ })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Utiliser une autre adresse' }));
    expect(screen.getByRole('heading', { name: 'Se connecter' })).toBeInTheDocument();
  });

  it('explique une erreur réseau et conserve l’adresse saisie', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/me') return json({}, 401);
        throw new TypeError('Failed to fetch');
      }),
    );
    await openLogin();
    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'martial@racomach.fr');
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir un lien magique' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Serveur injoignable');
    expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('martial@racomach.fr');
    expect(screen.getByRole('button', { name: 'Recevoir un lien magique' })).toBeEnabled();
  });

  it('explique une limitation de débit (429)', async () => {
    mockServer({
      ...anonymous,
      '/api/auth/sign-in/magic-link': () => json({ message: 'Too many requests' }, 429),
    });
    await openLogin();
    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'martial@racomach.fr');
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir un lien magique' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Trop de tentatives');
  });

  it('explique une erreur serveur', async () => {
    mockServer({
      ...anonymous,
      '/api/auth/sign-in/magic-link': () => json({ message: 'boom' }, 500),
    });
    await openLogin();
    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'martial@racomach.fr');
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir un lien magique' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('momentanément indisponible');
  });
});

describe('retour d’une tentative échouée (?error=…)', () => {
  it.each([
    ['INVALID_TOKEN', "Ce lien n'est plus valide"],
    ['EXPIRED_TOKEN', "Ce lien n'est plus valide"],
    ['access_denied', 'Connexion impossible'],
    ['unable_to_create_user', 'Connexion impossible'],
    ['quelque_chose_dinconnu', 'La connexion a échoué'],
  ])('%s → « %s »', async (code, expected) => {
    mockServer(anonymous);
    await openLogin(`/connexion?error=${code}`);
    expect(screen.getByRole('alert')).toHaveTextContent(expected);
  });

  it('reste neutre : le refus ne dit pas si l’adresse existe', async () => {
    mockServer(anonymous);
    await openLogin('/connexion?error=access_denied');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/accès est limité aux comptes autorisés/);
    expect(alert).not.toHaveTextContent(/n'existe pas|introuvable|inconnu/i);
  });

  it('n’affiche aucune alerte sans erreur', async () => {
    mockServer(anonymous);
    await openLogin();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Google', () => {
  it('redirige le navigateur vers l’adresse fournie par le serveur', async () => {
    mockServer({
      ...anonymous,
      '/api/auth/sign-in/social': () =>
        json({ url: 'https://accounts.google.com/o/oauth2/auth?x=1', redirect: true }),
    });
    await openLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Continuer avec Google' }));

    await waitFor(() =>
      expect(navigateExternal).toHaveBeenCalledWith(
        'https://accounts.google.com/o/oauth2/auth?x=1',
      ),
    );
  });

  it('signale l’indisponibilité de Google et propose le lien magique', async () => {
    mockServer({
      ...anonymous,
      '/api/auth/sign-in/social': () => json({ message: 'Provider not found' }, 404),
    });
    await openLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Continuer avec Google' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Connexion Google indisponible');
    expect(screen.getByRole('button', { name: 'Continuer avec Google' })).toBeEnabled();
    expect(navigateExternal).not.toHaveBeenCalled();
  });
});
