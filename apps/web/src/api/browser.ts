/** Redirection complète du navigateur (hors routeur) : isolée pour pouvoir être simulée en test. */
export function navigateExternal(url: string): void {
  window.location.assign(url);
}
