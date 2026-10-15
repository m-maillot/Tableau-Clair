import type { MeResponse } from '@tableau-clair/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchMe, signOut as signOutRequest } from '../api/client';
import { SESSION_EXPIRED_EVENT } from '../net/unsaved';

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: MeResponse }
  /** Le serveur n'a pas pu confirmer la session : on ne la déclare pas expirée. */
  | { status: 'error' };

interface SessionContextValue {
  session: SessionState;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const user = await fetchMe();
      setSession(user ? { status: 'authenticated', user } : { status: 'anonymous' });
    } catch {
      setSession({ status: 'error' });
    }
  }, []);

  const signOut = useCallback(async () => {
    await signOutRequest();
    setSession({ status: 'anonymous' });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Une réponse 401 en cours d'usage : la session n'existe plus, retour à la connexion.
  useEffect(() => {
    const onExpired = () => setSession({ status: 'anonymous' });
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const value = useMemo(() => ({ session, refresh, signOut }), [session, refresh, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession doit être utilisé dans un SessionProvider');
  return context;
}
