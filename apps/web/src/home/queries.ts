import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  createCustomModel,
  createProperty,
  deleteCustomModel,
  fetchCustomModels,
  fetchBoard,
  fetchBoardImpact,
  fetchBoards,
  fetchOverview,
  fetchProperties,
  searchProperty,
} from '../api/client';

export const keys = {
  customModels: ['custom-models'] as const,
  properties: ['properties'] as const,
  boards: (propertyId: string) => ['properties', propertyId, 'boards'] as const,
  overview: (propertyId: string) => ['properties', propertyId, 'overview'] as const,
  board: (boardId: string) => ['boards', boardId] as const,
  boardImpact: (boardId: string) => ['boards', boardId, 'impact'] as const,
  search: (propertyId: string, query: string) =>
    ['properties', propertyId, 'search', query] as const,
};

export const useProperties = () =>
  useQuery({ queryKey: keys.properties, queryFn: fetchProperties });

export const useBoards = (propertyId: string | undefined) =>
  useQuery({
    queryKey: keys.boards(propertyId ?? ''),
    queryFn: () => fetchBoards(propertyId!),
    enabled: !!propertyId,
  });

export const useOverview = (propertyId: string | undefined) =>
  useQuery({
    queryKey: keys.overview(propertyId ?? ''),
    queryFn: () => fetchOverview(propertyId!),
    enabled: !!propertyId,
  });

export const useBoard = (boardId: string | undefined) =>
  useQuery({
    queryKey: keys.board(boardId ?? ''),
    queryFn: () => fetchBoard(boardId!),
    enabled: !!boardId,
  });

export const useBoardImpact = (boardId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: keys.boardImpact(boardId ?? ''),
    queryFn: () => fetchBoardImpact(boardId!),
    enabled: !!boardId && enabled,
    // L'impact doit refléter l'état présent à l'ouverture de la confirmation.
    staleTime: 0,
  });

export const MIN_SEARCH_LENGTH = 2;

export function useSearch(propertyId: string | undefined, query: string) {
  const enabled = !!propertyId && query.length >= MIN_SEARCH_LENGTH;
  return useQuery({
    queryKey: keys.search(propertyId ?? '', query),
    queryFn: () => searchProperty(propertyId!, query),
    enabled,
  });
}

export function useCreateProperty() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createProperty,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.properties }),
  });
}

/** Valeur stabilisée : évite une requête à chaque frappe. */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

const STORAGE_KEY = 'tableau-clair.property';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // navigation privée, stockage bloqué…
  }
}

/** Logement actif : le dernier choisi s'il existe encore, sinon le premier. */
export function useSelectedProperty<T extends { id: string }>(properties: T[] | undefined) {
  const [storedId, setStoredId] = useState<string | null>(readStored);
  const selected = properties?.find((p) => p.id === storedId) ?? properties?.[0];

  const select = (id: string) => {
    setStoredId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* préférence non critique */
    }
  };
  return [selected, select] as const;
}

export const useCustomModels = () =>
  useQuery({ queryKey: keys.customModels, queryFn: fetchCustomModels });

export function useSaveCustomModel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createCustomModel,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.customModels }),
  });
}

export function useRemoveCustomModel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deleteCustomModel,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.customModels }),
  });
}
