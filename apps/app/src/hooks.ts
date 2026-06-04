import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAuth } from "./auth/auth-context";

/** Fetch on screen focus, with manual reload + loading/error state. */
export function useApi<T>(path: string | null) {
  const { api } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api, path]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { data, error, loading, reload: load };
}
