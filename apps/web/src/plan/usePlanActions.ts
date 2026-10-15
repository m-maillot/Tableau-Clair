import {
  fixtureSchema,
  floorSchema,
  roomSchema,
  type CreateFixtureInput,
  type CreateRoomInput,
  type Fixture,
  type Floor,
  type Plan,
  type Room,
  type UpdateFixtureInput,
  type UpdateFloorInput,
  type UpdateRoomInput,
} from '@tableau-clair/contracts';
import type { Verification } from '@tableau-clair/domain';
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
  linkFixture,
  NetworkError,
  unlinkFixture,
  reorderFloors,
  setBoardPlan,
  updateFixture,
  updateFloor,
  updateRoom,
} from '../api/client';
import type { Conflict } from '../conflict/ConflictSheet';
import { compareFields } from '../conflict/compare';
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
  putBoardPosition,
  setFixtureLink,
} from './plan-cache';

export interface Notice {
  tone: 'info' | 'error';
  text: string;
  /** Relance l'action échouée (aucune perte silencieuse). */
  retry?: () => void;
}

const NOTICE_MS = 5000;

/** Messages pour les refus métier du serveur (codes de `routes/plan.ts`). */
const RULES: Record<string, string> = {
  out_of_bounds: 'La pièce est trop loin de l’origine du plan.',
  too_small: 'Cette pièce est trop petite.',
  outside_room: 'Déposez l’équipement à l’intérieur d’une pièce.',
  room_not_found: 'Pièce de destination introuvable.',
  rooms_outside: 'Une pièce sortirait du plan : réduisez-la d’abord.',
  invalid_order: 'L’ordre des étages n’est plus à jour. Réessayez.',
  photo_not_found: 'Image introuvable dans ce logement.',
  not_a_breaker: 'Seul un disjoncteur peut alimenter un équipement.',
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
  /** Conflit de version : retourne vrai si l'appelant l'a pris en charge (feuille de conflit). */
  onConflict?: (saved: unknown) => boolean;
}

/**
 * Actions d'édition du plan. Chaque appel est appliqué tout de suite au cache, envoyé au serveur
 * dans l'ordre (chacun avec la version à jour), puis réconcilié ; un échec rétablit l'état précédent.
 */
export function usePlanActions(propertyId: string) {
  const client = useQueryClient();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const pending = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const getPlan = () => client.getQueryData<Plan>(keys.plan(propertyId));
  const setPlan = (plan: Plan) => client.setQueryData(keys.plan(propertyId), plan);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.retry ? NOTICE_MS * 2 : NOTICE_MS);
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
        if (
          error instanceof ApiResponseError &&
          error.status === 409 &&
          call.onConflict?.(error.details)
        ) {
          return null;
        }
        setNotice({ ...failureNotice(error), retry: () => void run(call) });
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

  const later = () => setConflict(null);
  const decide = (apply: () => void) => () => {
    setConflict(null);
    apply();
  };

  const actions = {
    notice,
    busy,
    conflict,
    dismissConflict: later,
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
        onConflict: (details) => {
          const saved = floorSchema.safeParse(details);
          if (!saved.success) return false;
          const current = getPlan();
          if (current) setPlan(patchFloor(current, saved.data));
          setConflict({
            subject: saved.data.name,
            savedVersion: saved.data.version,
            savedAt: saved.data.updatedAt,
            rows: compareFields(change, saved.data),
            keep: decide(() => void actions.updateFloor(floorId, change)),
            reload: later,
          });
          return true;
        },
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
        onConflict: (details) => {
          const saved = roomSchema.safeParse(details);
          if (!saved.success) return false;
          const current = getPlan();
          if (current) setPlan(putRoom(current, saved.data));
          setConflict({
            subject: saved.data.name,
            savedVersion: saved.data.version,
            savedAt: saved.data.updatedAt,
            rows: compareFields(change, saved.data),
            keep: decide(() => void actions.updateRoom(roomId, change)),
            reload: later,
          });
          return true;
        },
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
        onConflict: (details) => {
          const saved = fixtureSchema.safeParse(details);
          if (!saved.success) return false;
          const current = getPlan();
          if (current) setPlan(putFixture(current, saved.data));
          setConflict({
            subject: saved.data.label,
            savedVersion: saved.data.version,
            savedAt: saved.data.updatedAt,
            rows: compareFields(change, saved.data),
            keep: decide(() => void actions.updateFixture(fixtureId, change)),
            reload: later,
          });
          return true;
        },
      }),

    /** Relie l'équipement à un disjoncteur (ou change le statut de sa liaison). */
    link: (fixtureId: string, breakerId: string, status: Verification) =>
      run<Fixture>({
        optimistic: (plan) => setFixtureLink(plan, fixtureId, { breakerId, status }),
        request: () => linkFixture(fixtureId, { breakerId, status }),
        reconcile: (plan, fixture) => setFixtureLink(plan, fixture.id, fixture.link),
        refetch: true,
      }),

    unlink: (fixtureId: string) =>
      run<Fixture>({
        optimistic: (plan) => setFixtureLink(plan, fixtureId, null),
        request: () => unlinkFixture(fixtureId),
        refetch: true,
      }),

    /** Pose le tableau (équipement du plan) à un autre endroit, ou sur un autre étage. */
    moveBoard: (boardId: string, floorId: string, x: number, y: number) =>
      run<void>({
        optimistic: (plan) => putBoardPosition(plan, boardId, floorId, x, y),
        request: async () => {
          await setBoardPlan(boardId, { floorId, x, y });
          // La modification touche aussi le tableau : ses écrans doivent relire sa version.
          void client.invalidateQueries({ queryKey: ['boards'] });
        },
      }),

    removeFixture: (fixtureId: string) =>
      run<void>({
        optimistic: (plan) => removeFixture(plan, fixtureId),
        request: () => deleteFixture(fixtureId),
      }),
  };
  return actions;
}
