import type { Board } from '@tableau-clair/contracts';

/** Nom de fichier sûr : sans accents, espaces ni caractères spéciaux. */
export function exportFileName(boardName: string, date = new Date()): string {
  const slug =
    boardName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'tableau';
  return `tableau-clair-${slug}-${date.toISOString().slice(0, 10)}.json`;
}

/** Contenu exporté : la composition exacte du tableau (rangées et éléments). */
export function exportBoardJson(board: Board, exportedAt = new Date()): string {
  return JSON.stringify({ exportedAt: exportedAt.toISOString(), board }, null, 2);
}

/** Déclenche le téléchargement dans le navigateur. */
export function downloadBoard(board: Board): void {
  const blob = new Blob([exportBoardJson(board)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFileName(board.name);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
