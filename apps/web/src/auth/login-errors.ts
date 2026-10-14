export interface LoginProblem {
  title: string;
  message: string;
}

/**
 * Messages affichés quand le serveur nous renvoie sur /connexion avec `?error=…`.
 * Ils sont volontairement neutres : ils ne disent jamais si une adresse existe ou non (spec §9).
 */
export function problemFromCode(code: string | null): LoginProblem | null {
  if (!code) return null;

  switch (code.toUpperCase()) {
    case 'INVALID_TOKEN':
    case 'EXPIRED_TOKEN':
      return {
        title: "Ce lien n'est plus valide",
        message: 'Il a expiré ou a déjà été utilisé. Demandez-en un nouveau ci-dessous.',
      };
    case 'ACCESS_DENIED':
    case 'UNABLE_TO_CREATE_USER':
    case 'UNABLE_TO_LINK_ACCOUNT':
    case 'FAILED_TO_CREATE_USER':
    case 'FAILED_TO_CREATE_SESSION':
    case 'USER_NOT_FOUND':
      return {
        title: 'Connexion impossible',
        message:
          "Cette adresse n'a pas accès à l'application. L'accès est limité aux comptes autorisés.",
      };
    default:
      return {
        title: 'La connexion a échoué',
        message: 'Une erreur est survenue. Réessayez dans un instant.',
      };
  }
}
