import type { Dispatch, SetStateAction } from "react";
import { commitDBUpdate } from "../../state/appState";
import { todayISO, uid } from "../../state/utils";
import type { Client, DB, PaymentFact } from "../../types";

export type PaymentFactsChangeAction = "update" | "delete";

export interface PaymentFactsChangeContext {
  action: PaymentFactsChangeAction;
  factId: string;
}

interface CommitChangeParams {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
  clientId: string;
  nextFacts: PaymentFact[];
  action: PaymentFactsChangeAction;
}

export async function commitClientPaymentFactsChange({
  db,
  setDB,
  clientId,
  nextFacts,
  action,
}: CommitChangeParams): Promise<boolean> {
  const index = db.clients.findIndex(client => client.id === clientId);
  if (index === -1) {
    return false;
  }

  const target = db.clients[index];
  const updated: Client = (() => {
    const base: Client = { ...target };
    if (nextFacts.length) {
      base.payHistory = nextFacts;
    } else {
      delete base.payHistory;
    }
    return base;
  })();

  const nextClients = [...db.clients];
  nextClients[index] = updated;

  const changelogEntry = {
    id: uid(),
    who: "UI",
    what:
      action === "delete"
        ? `Удалён факт оплаты ${target.firstName}`
        : `Обновлён факт оплаты ${target.firstName}`,
    when: todayISO(),
  };

  const nextDB: DB = {
    ...db,
    clients: nextClients,
    changelog: [...db.changelog, changelogEntry],
  };

  const result = await commitDBUpdate(nextDB, setDB);
  if (!result.ok) {
    if (result.reason === "error") {
      window.alert(
        "Не удалось синхронизировать изменения фактов оплат. Изменения сохранены локально, проверьте доступ к базе данных.",
      );
    }
    return false;
  }

  return true;
}
