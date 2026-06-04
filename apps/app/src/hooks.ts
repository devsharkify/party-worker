import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAuth } from "./auth/auth-context";

/**
 * Fetch on screen focus, with manual reload + loading/error state.
 * `loading` is true only for the initial (data-less) load so screens can show a
 * skeleton; `refreshing` is true for user-triggered pull-to-refresh so the list
 * stays visible behind a RefreshControl spinner.
 */
export function useApi<T>(path: string | null) {
  const { api } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      void load();
    }, [load]),
  );

  return { data, error, loading, refreshing, reload: load, refresh };
}
