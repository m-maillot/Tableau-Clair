import { useEffect, useState } from 'react';

/** Largeur à partir de laquelle l'interface passe en mode bureau (sidebar, panneau de détail). */
export const DESKTOP_QUERY = '(min-width: 1024px)';

const supported = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/** Suit une media query ; faux là où `matchMedia` n'existe pas (tests, rendu serveur). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    supported() ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (!supported()) return;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
