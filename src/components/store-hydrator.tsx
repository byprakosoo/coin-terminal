"use client";

import { useEffect } from "react";
import { useTerminalStore } from "@/store/terminal-store";

export function StoreHydrator() {
  const setHydrated = useTerminalStore((state) => state.setHydrated);
  const refreshWorkspace = useTerminalStore((state) => state.refreshWorkspace);

  useEffect(() => {
    localStorage.removeItem("coin-terminal-demo-v1");
    void Promise.resolve(useTerminalStore.persist.rehydrate())
      .then(() => refreshWorkspace())
      .finally(() => setHydrated(true));
  }, [refreshWorkspace, setHydrated]);

  return null;
}
