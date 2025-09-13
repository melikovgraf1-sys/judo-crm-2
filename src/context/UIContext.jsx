import React, { createContext, useState } from "react";
import { loadUI } from "../App";
import type { UIState } from "../App";

export const UIContext = createContext<{ ui: UIState, setUI: (UIState) => void }>({
  ui: (loadUI(): any),
  setUI: () => {},
});

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [ui, setUI] = useState<UIState>(() => loadUI());
  return (
    <UIContext.Provider value={{ ui, setUI }}>
      {children}
    </UIContext.Provider>
  );
}
