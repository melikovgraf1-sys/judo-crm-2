import type { Dispatch, SetStateAction } from "react";
import { commitDBUpdate } from "../../state/appState";
import { getLatestFactPaidAt } from "../../state/paymentFacts";
import { todayISO, uid } from "../../state/utils";
import type { Client, ClientPlacement, DB, PaymentFact } from "../../types";

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
    const existingPlacements = Array.isArray(target.placements) ? target.placements : [];

    if (existingPlacements.length) {
      const updatedPlacements = existingPlacements.map<ClientPlacement>(placement => {
        const latestPaidAt = getLatestFactPaidAt(nextFacts, placement);

        if (latestPaidAt) {
          if (placement.payDate === latestPaidAt) {
            return placement;
          }
          return { ...placement, payDate: latestPaidAt };
        }

        if (placement.payDate) {
          const { payDate: _omit, ...rest } = placement;
          return rest;
        }

        return placement;
      });

      const placementsChanged = updatedPlacements.some(
        (placement, index) => placement !== existingPlacements[index],
      );

      if (placementsChanged) {
        base.placements = updatedPlacements;
      }

      const primaryPlacement = updatedPlacements[0] ?? null;
      const latestPrimaryPaidAt = getLatestFactPaidAt(nextFacts, primaryPlacement);

      if (latestPrimaryPaidAt) {
        base.payDate = latestPrimaryPaidAt;
      } else if (primaryPlacement?.payDate) {
        base.payDate = primaryPlacement.payDate;
      } else if (base.payDate) {
        delete base.payDate;
      }
    } else {
      const latestClientPaidAt = getLatestFactPaidAt(nextFacts, {
        area: target.area,
        group: target.group,
      });

      if (latestClientPaidAt) {
        base.payDate = latestClientPaidAt;
      } else if (base.payDate) {
        delete base.payDate;
      }
    }

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
