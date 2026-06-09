import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAuth } from "./auth/auth-context";

/**
 * Fetch on screen focus, with manual reload + loading/error state.
 * `loading` is true only for the initial (data-less) load so screens can show a
 * skeleton; `refreshing` is true for user-triggered pull-to-refresh so the list
 * stays visible behind a RefreshControl spinner.
 *
 * Waits for auth to finish its initial session restore before making the first
 * request, preventing the 401 race where the screen fires before accessRef is set.
 */
export function useApi<T>(path: string | null) {
  const { api, loading: authLoading } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const pendingRef = useRef(false);

  const run = useCallback(
    async (isRefresh: boolean) => {
      if (!path) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        setData(await api<T>(path));
        setError(undefined);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, path],
  );

  const load = useCallback(() => run(false), [run]);
  const refresh = useCallback(() => run(true), [run]);

  useFocusEffect(
    useCallback(() => {
      if (authLoading) {
        // Auth is still initialising (session restore in flight). Mark pending
        // so the effect below fires the load once auth settles.
        pendingRef.current = true;
        return;
      }
      pendingRef.current = false;
      void load();
    }, [load, authLoading]),
  );

  // Fire the deferred load once auth finishes initialising.
  useEffect(() => {
    if (!authLoading && pendingRef.current) {
      pendingRef.current = false;
      void load();
    }
  }, [authLoading, load]);

  return { data, error, loading, refreshing, reload: load, refresh };
}
