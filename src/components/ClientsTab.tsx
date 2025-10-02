import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction, ChangeEvent } from "react";
import Breadcrumbs from "./Breadcrumbs";
import ClientTable from "./clients/ClientTable";
import ClientForm from "./clients/ClientForm";
import Modal from "./Modal";
import { fmtMoney, todayISO, uid } from "../state/utils";
import { commitDBUpdate } from "../state/appState";
import { applyPaymentStatusRules } from "../state/payments";
import { transformClientFormValues } from "./clients/clientMutations";
import {
  appendImportedClients,
  exportClientsToCsv,
  parseClientsCsv,
} from "./clients/clientCsv";
import {
  findClientDuplicates,
  type ClientDuplicateMatch,
  type DuplicateField,
  type DuplicateMatchDetail,
} from "../state/clients";
import type { Client, ClientFormValues, DB, TaskItem, UIState } from "../types";

type ClientsTabProps = {
  db: DB;
  setDB: Dispatch<SetStateAction<DB>>;
  ui: UIState;
};

type DuplicatePromptState = {
  prepared: Omit<Client, "id">;
  matches: ClientDuplicateMatch[];
};

const DUPLICATE_FIELD_LABELS: Record<DuplicateField, string> = {
  fullName: "Имя и фамилия",
  parentName: "Родитель",
  phone: "Телефон",
  whatsApp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
};

const formatClientName = (client: { firstName: string; lastName?: string }): string =>
  [client.firstName, client.lastName].filter(Boolean).join(" ").trim();

const describeDuplicateMatch = (detail: DuplicateMatchDetail): string => {
  const label = DUPLICATE_FIELD_LABELS[detail.field];
  if (!detail.value) {
    return label;
  }
  return `${label}: ${detail.value}`;
};

export default function ClientsTab({ db, setDB, ui }: ClientsTabProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicatePromptState | null>(null);
  const [query, setQuery] = useState(ui.search);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setQuery(ui.search);
  }, [ui.search]);

  const search = query.trim().toLowerCase();
  const list = useMemo(() => {
    if (!search) {
      return db.clients;
    }
    return db.clients.filter(client => {
      const fullName = `${client.firstName} ${client.lastName ?? ""}`.trim().toLowerCase();
      if (fullName.includes(search)) {
        return true;
      }
      const contacts = `${client.phone ?? ""} ${client.whatsApp ?? ""} ${client.telegram ?? ""} ${client.instagram ?? ""}`
        .toLowerCase();
      return contacts.includes(search);
    });
  }, [db.clients, search]);

  const openAddModal = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const startEdit = (client: Client) => {
    setEditing(client);
    setModalOpen(true);
  };

  const commitNewClient = async (prepared: Omit<Client, "id">) => {
    const client: Client = {
      id: uid(),
      ...prepared,
      coachId: prepared.coachId ?? db.staff.find(staffMember => staffMember.role === "Тренер")?.id,
    };
    const next = {
      ...db,
      clients: [client, ...db.clients],
      changelog: [
        ...db.changelog,
        { id: uid(), who: "UI", what: `Создан клиент ${client.firstName}`, when: todayISO() },
      ],
    };
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
      window.alert(
        "Не удалось синхронизировать нового клиента. Запись сохранена локально, проверьте доступ к базе данных.",
      );
      setDB(next);
    }
    setModalOpen(false);
    setEditing(null);
    setDuplicatePrompt(null);
  };

  const saveClient = async (data: ClientFormValues) => {
    const prepared = transformClientFormValues(data, editing);
    if (editing) {
      const updated: Client = { ...editing, ...prepared };
      if (!Object.prototype.hasOwnProperty.call(prepared, "payAmount")) {
        delete updated.payAmount;
      }
      if (!Object.prototype.hasOwnProperty.call(prepared, "remainingLessons")) {
        delete updated.remainingLessons;
      }
      const next = {
        ...db,
        clients: db.clients.map(cl => (cl.id === editing.id ? updated : cl)),
        changelog: [...db.changelog, { id: uid(), who: "UI", what: `Обновлён клиент ${updated.firstName}`, when: todayISO() }],
      };
      const ok = await commitDBUpdate(next, setDB);
      if (!ok) {
        window.alert("Не удалось синхронизировать изменения клиента. Они сохранены локально, проверьте доступ к базе данных.");
        setDB(next);
      }
      setModalOpen(false);
      setEditing(null);
      setDuplicatePrompt(null);
      return;
    }
    const duplicates = findClientDuplicates(db, prepared);
    if (duplicates.length) {
      setDuplicatePrompt({ prepared, matches: duplicates });
      return;
    }

    await commitNewClient(prepared);
  };

  const handleDuplicateCancel = () => {
    setDuplicatePrompt(null);
  };

  const handleDuplicateOpen = (client: Client) => {
    setDuplicatePrompt(null);
    setEditing(client);
    setModalOpen(true);
  };

  const handleDuplicateCreate = async () => {
    if (!duplicatePrompt) return;
    const { prepared } = duplicatePrompt;
    setDuplicatePrompt(null);
    await commitNewClient(prepared);
  };

  const createPaymentTask = async (client: Client) => {
    const titleParts = [
      `${client.firstName}${client.lastName ? ` ${client.lastName}` : ""}`.trim(),
      client.parentName ? `родитель: ${client.parentName}` : null,
      client.payAmount != null ? `сумма: ${fmtMoney(client.payAmount, ui.currency)}` : null,
      client.payDate ? `дата: ${client.payDate.slice(0, 10)}` : null,
    ].filter(Boolean);

    const task: TaskItem = {
      id: uid(),
      title: `Оплата клиента — ${titleParts.join(" • ") || client.firstName}`,
      due: client.payDate || todayISO(),
      status: "open",
      topic: "оплата",
      assigneeType: "client",
      assigneeId: client.id,
    };

    const nextTasks = [task, ...db.tasks];
    const nextClients = applyPaymentStatusRules(db.clients, nextTasks);
    const next = {
      ...db,
      tasks: nextTasks,
      tasksArchive: db.tasksArchive,
      clients: nextClients,
      changelog: [
        ...db.changelog,
        { id: uid(), who: "UI", what: `Создана задача по оплате ${client.firstName}`, when: todayISO() },
      ],
    };
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
      window.alert("Не удалось создать задачу. Проверьте доступ к базе данных.");
    }
  };

  const removeClient = async (id: string) => {
    if (!window.confirm("Удалить клиента?")) return;
    const next = {
      ...db,
      clients: db.clients.filter(client => client.id !== id),
      changelog: [...db.changelog, { id: uid(), who: "UI", what: `Удалён клиент ${id}`, when: todayISO() }],
    };
    const ok = await commitDBUpdate(next, setDB);
    if (!ok) {
      window.alert("Не удалось удалить клиента. Проверьте доступ к базе данных.");
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const result = parseClientsCsv(text, db);

      const messages: string[] = [];

      if (result.processed) {
        messages.push(`Обработано строк: ${result.processed}`);
      }

      if (result.clients.length) {
        const { next, summary } = appendImportedClients(db, result.clients);
        const ok = await commitDBUpdate(next, setDB);
        if (!ok) {
          window.alert(
            "Не удалось синхронизировать импорт. Данные сохранены локально, проверьте доступ к базе данных.",
          );
          setDB(next);
        }
        messages.push(`Импортировано клиентов: ${summary.added}`);
        if (summary.merged) {
          messages.push(`Объединено строк: ${summary.merged}`);
        }
        if (summary.skipped) {
          messages.push(`Пропущено дублей: ${summary.skipped}`);
        }
        if (result.skipped) {
          messages.push(`Пропущено строк: ${result.skipped}`);
        }
        if (summary.duplicates.length) {
          messages.push("Возможные дубликаты:");
          for (const entry of summary.duplicates) {
            const reasonText = entry.matches.length
              ? ` (${entry.matches.map(describeDuplicateMatch).join("; ")})`
              : "";
            const action = entry.type === "existing" ? "уже в базе" : "объединено с другой строкой";
            messages.push(`- ${formatClientName(entry.client)} — ${action}${reasonText}`);
          }
        }
      } else if (!result.errors.length) {
        messages.push("Подходящих строк не найдено");
      }

      if (result.errors.length) {
        messages.push("Ошибки:");
        messages.push(...result.errors);
      }

      if (messages.length) {
        window.alert(messages.join("\n"));
      }
    } catch (error) {
      window.alert(`Не удалось прочитать файл: ${(error as Error).message}`);
    }
  };

  const handleExport = () => {
    if (!db.clients.length) {
      window.alert("Список клиентов пуст — экспортировать нечего.");
      return;
    }
    exportClientsToCsv(db.clients);
  };

  const total = db.clients.length;
  const visibleCount = list.length;
  const counterText = search
    ? `Найдено: ${visibleCount} из ${total}`
    : `Всего клиентов: ${total}`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Breadcrumbs items={["Клиенты"]} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Поиск клиента…"
            className="px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring focus:ring-sky-200 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          />
          <div className="text-xs text-slate-500">{counterText}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={openAddModal}
            className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm hover:bg-sky-700"
          >
            + Добавить клиента
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-2 rounded-lg border border-sky-600 text-sky-600 text-sm hover:bg-sky-50 dark:border-sky-500 dark:text-sky-300 dark:hover:bg-slate-800"
          >
            Экспорт CSV
          </button>
          <button
            onClick={handleImportClick}
            className="px-3 py-2 rounded-lg border border-emerald-600 text-emerald-600 text-sm hover:bg-emerald-50 dark:border-emerald-500 dark:text-emerald-300 dark:hover:bg-slate-800"
          >
            Импорт CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
      </div>
      <div>
        <ClientTable
          list={list}
          currency={ui.currency}
          onEdit={startEdit}
          onRemove={removeClient}
          onCreateTask={createPaymentTask}
          schedule={db.schedule}
          attendance={db.attendance}
          performance={db.performance}
        />
      </div>
      {modalOpen && (
        <ClientForm
          db={db}
          editing={editing}
          onSave={saveClient}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
            setDuplicatePrompt(null);
          }}
        />
      )}
      {duplicatePrompt && (
        <DuplicateWarningModal
          candidate={duplicatePrompt.prepared}
          matches={duplicatePrompt.matches}
          onCancel={handleDuplicateCancel}
          onCreateAnyway={handleDuplicateCreate}
          onOpenExisting={handleDuplicateOpen}
        />
      )}
    </div>
  );
}

type DuplicateWarningModalProps = {
  candidate: Omit<Client, "id">;
  matches: ClientDuplicateMatch[];
  onCancel: () => void;
  onCreateAnyway: () => void;
  onOpenExisting: (client: Client) => void;
};

function DuplicateWarningModal({
  candidate,
  matches,
  onCancel,
  onCreateAnyway,
  onOpenExisting,
}: DuplicateWarningModalProps) {
  const name = formatClientName(candidate);
  const candidateLabel = name ? `клиента ${name}` : "нового клиента";
  return (
    <Modal size="lg" onClose={onCancel}>
      <div className="space-y-4">
        <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">Найдены возможные дубликаты</div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Для {candidateLabel} найдены совпадения в базе. Вы можете отменить создание, открыть существующую запись
          или сохранить нового клиента.
        </p>
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {matches.map(match => (
            <div
              key={match.client.id}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-100">
                    {formatClientName(match.client) || "Без имени"}
                  </div>
                  {match.matches.length ? (
                    <ul className="mt-1 list-disc space-y-1 text-sm text-slate-600 dark:text-slate-300 pl-4">
                      {match.matches.map(detail => (
                        <li key={`${match.client.id}-${detail.field}`}>{describeDuplicateMatch(detail)}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      Совпадения без указанных контактов
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onOpenExisting(match.client)}
                  className="shrink-0 rounded-lg border border-emerald-500 px-3 py-1 text-sm text-emerald-600 hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-slate-700"
                >
                  Открыть
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Отменить
          </button>
          <button
            type="button"
            onClick={onCreateAnyway}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
          >
            Создать всё равно
          </button>
        </div>
      </div>
    </Modal>
  );
}

