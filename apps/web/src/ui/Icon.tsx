import type { ReactNode, SVGProps } from 'react';

/** Pictogrammes des maquettes : tracés 24×24, trait arrondi. */
const PATHS = {
  home: <path d="M3 11l9-8 9 8M5 10v10h14V10" />,
  boards: (
    <>
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
    </>
  ),
  plan: <path d="M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16" />,
  verify: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 9.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  'chevron-right': <path d="M9 5l7 7-7 7" />,
  warning: (
    <>
      <path d="M12 3l10 17H2z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  /** Supposée : tilde. */
  wave: (
    <>
      <path d="M3.5 12.5c2-3.5 4-3.5 6-.5s4 3 6-.5" />
      <path d="M15.5 12.5c1.5-2.5 3-2.5 5-.5" />
    </>
  ),
  /** Inconnue : point d'interrogation. */
  help: <path d="M9 9.5a3 3 0 015.5 1.5c0 2-2.5 2.2-2.5 4M12 19h.01" />,
  socket: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M9 9v2M15 9v2M9 16h6" />
    </>
  ),
  bulb: (
    <path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0012 3z" />
  ),
  undo: <path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" />,
  'alert-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16.5h.01" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  download: <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  'chevron-left': <path d="M15 5l-7 7 7 7" />,
  /** Éclair plein : disjoncteur. */
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" strokeWidth={1.5} />,
} satisfies Record<string, ReactNode>;

/** Pictogrammes pleins (les autres sont au trait). */
const FILLED = new Set<IconName>(['bolt']);

export type IconName = keyof typeof PATHS;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  /** Épaisseur du trait (2,2 par défaut, comme les maquettes). */
  strokeWidth?: number;
}

/** Icône décorative : masquée aux lecteurs d'écran, le libellé voisin porte le sens. */
export function Icon({ name, size = 24, strokeWidth = 2.2, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={FILLED.has(name) ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
