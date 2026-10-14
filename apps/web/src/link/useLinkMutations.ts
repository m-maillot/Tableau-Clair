import type { Verification } from '@tableau-clair/domain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { linkFixture, unlinkFixture } from '../api/client';
import { keys } from '../home/queries';

/**
 * Liaisons modifiées depuis la fiche d'un disjoncteur : tout ce qui les affiche est relu
 * (circuit, plan, fiabilité de l'accueil, compteurs des tableaux).
 */
export function useLinkMutations(propertyId: string) {
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['elements'] }),
      client.invalidateQueries({ queryKey: ['boards'] }),
      client.invalidateQueries({ queryKey: keys.plan(propertyId) }),
      client.invalidateQueries({ queryKey: keys.overview(propertyId) }),
    ]);

  const link = useMutation({
    mutationFn: (v: { fixtureId: string; breakerId: string; status: Verification }) =>
      linkFixture(v.fixtureId, { breakerId: v.breakerId, status: v.status }),
    onSuccess: refresh,
  });
  const unlink = useMutation({
    mutationFn: (fixtureId: string) => unlinkFixture(fixtureId),
    onSuccess: refresh,
  });
  return { link, unlink, busy: link.isPending || unlink.isPending };
}
