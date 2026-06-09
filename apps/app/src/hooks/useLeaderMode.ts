import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LEADER_MODE_KEY = "leaderMode";

/**
 * Persistent leader/worker mode toggle for users where isLeader=true.
 * Defaults to "worker" for everyone — leaders can switch to "leader".
 */
export function useLeaderMode() {
  const [mode, setModeState] = useState<"worker" | "leader">("worker");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(LEADER_MODE_KEY).then((saved) => {
      if (saved === "leader") setModeState("leader");
      setReady(true);
    });
  }, []);

  const setMode = useCallback(async (next: "worker" | "leader") => {
    setModeState(next);
    await AsyncStorage.setItem(LEADER_MODE_KEY, next);
  }, []);

  return { mode, setMode, ready };
}
