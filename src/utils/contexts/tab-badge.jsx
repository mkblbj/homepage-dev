import { createContext, useCallback, useContext, useMemo, useState } from "react";

export const TabBadgeContext = createContext();

export function TabBadgeProvider({ children }) {
  const [badges, setBadges] = useState({});

  const setBadge = useCallback((tabName, count) => {
    setBadges((prev) => {
      if (prev[tabName] === count) return prev;
      return { ...prev, [tabName]: count };
    });
  }, []);

  const value = useMemo(() => ({ badges, setBadge }), [badges, setBadge]);

  return <TabBadgeContext.Provider value={value}>{children}</TabBadgeContext.Provider>;
}

export function useTabBadge() {
  return useContext(TabBadgeContext);
}

