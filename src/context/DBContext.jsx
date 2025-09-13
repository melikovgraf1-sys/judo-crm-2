import React, { createContext, useState } from "react";
import { loadDB } from "../App";
import type { DB } from "../App";

export const DBContext = createContext<{ db: DB, setDB: (DB) => void }>({
  db: (loadDB(): any),
  setDB: () => {},
});

export function DBProvider({ children }: { children: React.ReactNode }) {
  const [db, setDB] = useState<DB>(() => loadDB());
  return (
    <DBContext.Provider value={{ db, setDB }}>
      {children}
    </DBContext.Provider>
  );
}
