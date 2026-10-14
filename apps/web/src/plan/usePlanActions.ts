import type {
  CreateFixtureInput,
  CreateRoomInput,
  Fixture,
  Floor,
  Plan,
  Room,
  UpdateFixtureInput,
  UpdateFloorInput,
  UpdateRoomInput,
} from '@tableau-clair/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  ApiResponseError,
  createFixture,
  createFloor,
  createRoom,
  deleteFixture,
  deleteFloor,
  deleteRoom,
  NetworkError,
  reorderFloors,
  updateFixture,
  updateFloor,
  updateRoom,
} from '../api/client';
import { keys } from '../home/queries';
import {
  addFloor,
  applyFloorOrder,
  findFixture,
  findRoom,
  patchFloor,
  putFixture,
  putRoom,
  removeFixture,
  removeFloor,
  removeRoom,
} from './plan-cache';

export interface Notice {
  tone: 'info' | 'error';
  text: string;
}

const NOTICE_MS = 5000;

/** Messages pour les refus métier du serveur (codes de `routes/plan.ts`). */
const RULES: Record<string, string> = {
  out_of_bounds: 'La pièce dépasse du plan.',
  too_small: 'Cette pièce est trop petite.',
  outside_room: 'Déposez l’équipement à l’intérieur d’une pièce.',
  room_not_found: 'Pièce de destination introuvable.',
  rooms_outside: 'Une pièce sortirait du plan : réduisez-la d’abord.',
  invalid_order: 'L’ordre des étages n’est plus à jour. Réessayez.',
  photo_not_found: 'Image introuvable dans ce logement.',
};

function failureNotice(error: unknown): Notice {
  if (error instanceof NetworkError) {
    return {
      tone: 'error',
      text: 'Serveur injoignable : la modification n’a pas été enregistrée.',
    };
  }
  if (error instanceof ApiResponseError) {
    if (error.status === 409) {
      return {
        tone: 'error',
        text: 'Le plan a été modifié ailleurs. Il a été rechargé, réessayez.',
      };
    }
    if (error.status === 403) {
      return { tone: 'error', text: 'Vous n’avez pas le droit de modifier ce plan.' };
    }
    if (error.status === 422 && error.code && RULES[error.code]) {
      return { tone: 'error', text: RULES[error.code]! };
    }
  }
  return { tone: 'error', text: 'La modification a échoué. Réessayez.' };
}

interface Call<T> {
  /** Mise à jour immédiate du plan en cache. */
  optimistic?: (plan: Plan) => Plan;
  request: () => Promise<T>;
  /** Intègre la réponse du serveur (versions, valeurs recalculées). */
  reconcile?: (plan: Plan, result: T) => Plan;
  /** Relire tout le plan ensuite (le serveur a modifié autre chose que ce qu'on envoie). */
  refetch?: boolean;
}

/**
 * Actions d'édition du plan. Chaque appel est appliqué tout de suite au cache, envoyé au serveur
 * dans l'ordre (chacun avec la version à jour), puis réconcilié ; un échec rétablit l'état précédent.
 */
export function usePlanActions(propertyId: string) {
  const client = useQueryClient();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const getPlan = () => client.getQueryData<Plan>(keys.plan(propertyId));
  const setPlan = (plan: Plan) => client.setQueryData(keys.plan(propertyId), plan);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  function run<T>(call: Call<T>): Promise<T | null> {
    pending.current += 1;
    setBusy(true);
    const task = async (): Promise<T | null> => {
      const before = getPlan();
      if (before && call.optimistic) setPlan(call.optimistic(before));
      try {
        const result = await call.request();
        const current = getPlan();
        if (current && call.reconcile) setPlan(call.reconcile(current, result));
        if (call.refetch) await client.invalidateQueries({ queryKey: keys.plan(propertyId) });
        return result;
      } catch (error) {
        if (before) setPlan(before);
        setNotice(failureNotice(error));
        if (error instanceof ApiResponseError && error.status === 409) {
          void client.invalidateQueries({ queryKey: keys.plan(propertyId) });
        }
        return null;
      }
    };
    const result = chain.current.then(task, task);
    chain.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result.finally(() => {
      pending.current -= 1;
      if (pending.current === 0) {
        setBusy(false);
        // Fiabilité et comptages de l'accueil.
        void client.invalidateQueries({ queryKey: keys.overview(propertyId) });
      }
    });
  }

  /** Version à jour d'une entité au moment de l'envoi (les appels sont sérialisés). */
  const latestFloor = (id: string) => getPlan()?.floors.find((f) => f.id === id);
  const latestRoom = (id: string) => {
    const plan = getPlan();
    return plan ? findRoom(plan, id)?.room : undefined;
  };
  const latestFixture = (id: string) => {
    const plan = getPlan();
    return plan ? findFixture(plan, id)?.fixture : undefined;
  };

  return {
    notice,
    busy,
    say: (text: string) => setNotice({ tone: 'info', text }),
    refuse: (text: string) => setNotice({ tone: 'error', text }),

    // --- Étages --------------------------------------------------------------------------------------
    addFloor: (name: string) =>
      run<Floor>({
        request: () => createFloor(propertyId, name),
        reconcile: (plan, floor) => addFloor(plan, floor),
      }),

    updateFloor: (floorId: string, change: Omit<UpdateFloorInput, 'version'>) =>
      run<Floor>({
        optimistic: (plan) => {
          const floor = plan.floors.find((f) => f.id === floorId);
          return floor ? patchFloor(plan, { ...floor, ...change } as Floor) : plan;
        },
        request: () =>
          updateFloor(floorId, { ...change, version: latestFloor(floorId)?.version ?? 1 }),
        reconcile: (plan, floor) => patchFloor(plan, floor),
        // Remplacer l'image supprime l'ancienne photo côté serveur : le plan relu garde le cadrage exact.
        refetch: 'backgroundImageId' in change,
      }),

    reorder: (ids: string[]) =>
      run<Floor[]>({
        optimistic: (plan) => applyFloorOrder(plan, ids),
        request: () => reorderFloors(propertyId, ids),
        refetch: true,
      }),

    removeFloor: (floorId: string) =>
      run<void>({
        optimistic: (plan) => removeFloor(plan, floorId),
        request: () => deleteFloor(floorId),
        refetch: true,
      }),

    // --- Pièces --------------------------------------------------------------------------------------
    addRoom: (floorId: string, input: CreateRoomInput) =>
      run<Room>({
        request: () => createRoom(floorId, input),
        reconcile: (plan, room) => putRoom(plan, room),
      }),

    updateRoom: (roomId: string, change: Omit<UpdateRoomInput, 'version'>) =>
      run<Room>({
        optimistic: (plan) => {
          const found = findRoom(plan, roomId);
          return found ? putRoom(plan, { ...found.room, ...change }) : plan;
        },
        request: () => updateRoom(roomId, { ...change, version: latestRoom(roomId)?.version ?? 1 }),
        reconcile: (plan, room) => putRoom(plan, room),
        // Le serveur déplace ou ramène les équipements de la pièce : on relit leurs positions.
        refetch: 'x' in change || 'y' in change || 'w' in change || 'h' in change,
      }),

    removeRoom: (roomId: string) =>
      run<void>({
        optimistic: (plan) => removeRoom(plan, roomId),
        request: () => deleteRoom(roomId),
      }),

    // --- Équipements -------------------------------------------------------------------------------
    addFixture: (roomId: string, input: CreateFixtureInput) =>
      run<Fixture>({
        request: () => createFixture(roomId, input),
        reconcile: (plan, fixture) => putFixture(plan, fixture),
      }),

    updateFixture: (fixtureId: string, change: Omit<UpdateFixtureInput, 'version'>) =>
      run<Fixture>({
        optimistic: (plan) => {
          const found = findFixture(plan, fixtureId);
          if (!found) return plan;
          const { notes, photoId, ...rest } = change;
          return putFixture(plan, {
            ...found.fixture,
            ...rest,
            ...(notes !== undefined ? { notes } : {}),
            ...(photoId !== undefined ? { photoId } : {}),
          } as Fixture);
        },
        request: () =>
          updateFixture(fixtureId, { ...change, version: latestFixture(fixtureId)?.version ?? 1 }),
        reconcile: (plan, fixture) => putFixture(plan, fixture),
      }),

    removeFixture: (fixtureId: string) =>
      run<void>({
        optimistic: (plan) => removeFixture(plan, fixtureId),
        request: () => deleteFixture(fixtureId),
      }),
  };
}
