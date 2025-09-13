import React, { useState, useMemo } from "react";
import Breadcrumbs from "./Breadcrumbs";
import TableWrap from "./TableWrap";
import { uid, todayISO, parseDateInput, fmtMoney, calcAgeYears, calcExperience, saveDB } from "../App";
import type { DB, UIState, Client, Area, Group, PaymentStatus, ContactChannel, PaymentMethod, Gender } from "../App";

function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-3 py-1 rounded-full border text-xs ${active ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}>{children}</button>
  );
}

export default function ClientsTab({ db, setDB, ui }: { db: DB; setDB: (db: DB) => void; ui: UIState }) {
  const [area, setArea] = useState<Area | "all">("all");
  const [group, setGroup] = useState<Group | "all">("all");
  const [pay, setPay] = useState<PaymentStatus | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const blankForm = (): Partial<Client> => ({
    firstName: "",
    lastName: "",
    phone: "",
    gender: "м" as Gender,
    area: db.settings.areas[0] as Area,
    group: db.settings.groups[0] as Group,
    channel: "Telegram" as ContactChannel,
    startDate: new Date().toISOString(),
    payMethod: "перевод" as PaymentMethod,
    payStatus: "ожидание" as PaymentStatus,
    birthDate: new Date("2017-01-01").toISOString(),
    payDate: new Date().toISOString(),
    payAmount: 0,
    parentName: "",
  });
  const [form, setForm] = useState<Partial<Client>>(blankForm());
  const [editing, setEditing] = useState<Client | null>(null);
  const [selected, setSelected] = useState<Client | null>(null);

  const list = useMemo(() => {
    return db.clients.filter(c =>
      (area === "all" || c.area === area) &&
      (group === "all" || c.group === group) &&
      (pay === "all" || c.payStatus === pay) &&
      (!ui.search || `${c.firstName} ${c.lastName ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(ui.search.toLowerCase()))
    );
  }, [db.clients, area, group, pay, ui.search]);

  const openAddModal = () => {
    setEditing(null);
    setForm(blankForm());
    setModalOpen(true);
  };

  const startEdit = (c: Client) => {
    setEditing(c);
    setForm(c);
    setSelected(null);
    setModalOpen(true);
  };

  const saveClient = () => {
    if (editing) {
      const updated: Client = { ...editing, ...form };
      const next = {
        ...db,
        clients: db.clients.map(cl => (cl.id === editing.id ? updated : cl)),
        changelog: [...db.changelog, { id: uid(), who: "UI", what: `Обновлён клиент ${updated.firstName}`, when: todayISO() }],
      };
      setDB(next); saveDB(next);
    } else {
      const c: Client = {
        id: uid(),
        firstName: String(form.firstName || ""),
        lastName: form.lastName || "",
        phone: form.phone || "",
        channel: form.channel as ContactChannel,
        birthDate: form.birthDate || new Date("2017-01-01").toISOString(),
        parentName: form.parentName || "",
        gender: (form.gender ?? "м") as Gender,
        area: (form.area ?? db.settings.areas[0]) as Area,
        group: (form.group ?? db.settings.groups[0]) as Group,
        coachId: db.staff.find(s => s.role === "Тренер")?.id,
        startDate: form.startDate || todayISO(),
        payMethod: (form.payMethod ?? "перевод") as PaymentMethod,
        payStatus: (form.payStatus ?? "ожидание") as PaymentStatus,
        payDate: form.payDate || todayISO(),
        payAmount: form.payAmount || 0,
      };
      const next = {
        ...db,
        clients: [c, ...db.clients],
        changelog: [...db.changelog, { id: uid(), who: "UI", what: `Создан клиент ${c.firstName}`, when: todayISO() }],
      };
      setDB(next); saveDB(next);
    }
    setModalOpen(false);
    setEditing(null);
  };

  const removeClient = (id: string) => {
    if (!confirm("Удалить клиента?")) return;
    const next = { ...db, clients: db.clients.filter(c => c.id !== id), changelog: [...db.changelog, { id: uid(), who: "UI", what: `Удалён клиент ${id}`, when: todayISO() }] };
    setDB(next); saveDB(next);
  };

  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Клиенты"]} />
      <div className="flex flex-wrap gap-2 items-center">
        <Chip active={area === "all"} onClick={() => setArea("all")}>Все районы</Chip>
        {db.settings.areas.map(a => <Chip key={a} active={area === a} onClick={() => setArea(a)}>{a}</Chip>)}
        <div className="flex-1" />
        <button onClick={openAddModal} className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm hover:bg-sky-700">+ Добавить клиента</button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select className="px-2 py-2 rounded-md border border-slate-300 text-sm" value={group} onChange={e => setGroup(e.target.value as Group | "all")}>
          <option value="all">Все группы</option>
          {db.settings.groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select className="px-2 py-2 rounded-md border border-slate-300 text-sm" value={pay} onChange={e => setPay(e.target.value as PaymentStatus | "all")}>
          <option value="all">Все статусы оплаты</option>
          <option value="ожидание">ожидание</option>
          <option value="действует">действует</option>
          <option value="задолженность">задолженность</option>
        </select>
        <div className="text-xs text-slate-500">Найдено: {list.length}</div>
      </div>

      <TableWrap>
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="text-left p-2">Имя</th>
            <th className="text-left p-2">Телефон</th>
            <th className="text-left p-2">Район</th>
            <th className="text-left p-2">Группа</th>
            <th className="text-left p-2">Статус оплаты</th>
            <th className="text-left p-2">Сумма оплаты</th>
            <th className="text-right p-2">Действия</th>
          </tr>
        </thead>
        <tbody>
          {list.map(c => (
            <tr key={c.id} className="border-t border-slate-100">
              <td className="p-2 cursor-pointer" onClick={() => setSelected(c)}>{c.firstName} {c.lastName}</td>
              <td className="p-2">{c.phone}</td>
              <td className="p-2">{c.area}</td>
              <td className="p-2">{c.group}</td>
              <td className="p-2">
                <span className={`px-2 py-1 rounded-full text-xs ${c.payStatus === "действует" ? "bg-emerald-100 text-emerald-700" : c.payStatus === "задолженность" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{c.payStatus}</span>
              </td>
              <td className="p-2">{c.payAmount != null ? fmtMoney(c.payAmount, ui.currency) : "—"}</td>
              <td className="p-2 text-right">
                <button onClick={() => startEdit(c)} className="px-2 py-1 text-xs rounded-md border border-slate-300 mr-1">Редактировать</button>
                <button onClick={() => removeClient(c.id)} className="px-2 py-1 text-xs rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50">Удалить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      {selected && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 space-y-3">
            <div className="font-semibold text-slate-800">
              {selected.firstName} {selected.lastName}
            </div>
            <div className="grid gap-1 text-sm">
              <div><span className="text-slate-500">Телефон:</span> {selected.phone || "—"}</div>
              <div><span className="text-slate-500">Канал:</span> {selected.channel}</div>
              <div><span className="text-slate-500">Родитель:</span> {selected.parentName || "—"}</div>
              <div><span className="text-slate-500">Дата рождения:</span> {selected.birthDate?.slice(0,10)}</div>
              <div><span className="text-slate-500">Возраст:</span> {selected.birthDate ? `${calcAgeYears(selected.birthDate)} лет` : "—"}</div>
              <div><span className="text-slate-500">Район:</span> {selected.area}</div>
              <div><span className="text-slate-500">Группа:</span> {selected.group}</div>
              <div><span className="text-slate-500">Опыт:</span> {calcExperience(selected.startDate)}</div>
              <div><span className="text-slate-500">Статус оплаты:</span> {selected.payStatus}</div>
              <div><span className="text-slate-500">Дата оплаты:</span> {selected.payDate?.slice(0,10) || "—"}</div>
              <div><span className="text-slate-500">Сумма оплаты:</span> {selected.payAmount != null ? fmtMoney(selected.payAmount, ui.currency) : "—"}</div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => startEdit(selected)} className="px-3 py-2 rounded-md border border-slate-300">Редактировать</button>
              <button onClick={() => { removeClient(selected.id); setSelected(null); }} className="px-3 py-2 rounded-md border border-rose-200 text-rose-600">Удалить</button>
              <button onClick={() => setSelected(null)} className="px-3 py-2 rounded-md border border-slate-300">Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-4 space-y-3">
            <div className="font-semibold text-slate-800">{editing ? "Редактирование клиента" : "Новый клиент"}</div>
            <div className="grid sm:grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Имя</label>
                <input className="px-3 py-2 rounded-md border border-slate-300" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Фамилия</label>
                <input className="px-3 py-2 rounded-md border border-slate-300" value={form.lastName || ""} onChange={e => setForm({ ...form, lastName: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Телефон</label>
                <input className="px-3 py-2 rounded-md border border-slate-300" value={form.phone || ""} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Канал</label>
                  <select className="px-3 py-2 rounded-md border border-slate-300" value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value as ContactChannel })}>
                    <option>Telegram</option><option>WhatsApp</option><option>Instagram</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Пол</label>
                  <select className="px-3 py-2 rounded-md border border-slate-300" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value as Gender })}>
                    <option value="м">м</option><option value="ж">ж</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Район</label>
                  <select className="px-3 py-2 rounded-md border border-slate-300" value={form.area} onChange={e => setForm({ ...form, area: e.target.value as Area })}>
                    {db.settings.areas.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Группа</label>
                  <select className="px-3 py-2 rounded-md border border-slate-300" value={form.group} onChange={e => setForm({ ...form, group: e.target.value as Group })}>
                    {db.settings.groups.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Дата рождения</label>
                <input type="date" className="px-3 py-2 rounded-md border border-slate-300" value={form.birthDate?.slice(0,10) || ""} onChange={e => setForm({ ...form, birthDate: parseDateInput(e.target.value) })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Дата начала</label>
                <input type="date" className="px-3 py-2 rounded-md border border-slate-300" value={form.startDate?.slice(0,10) || ""} onChange={e => setForm({ ...form, startDate: parseDateInput(e.target.value) })} />
              </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Способ оплаты</label>
                  <select className="px-3 py-2 rounded-md border border-slate-300" value={form.payMethod} onChange={e => setForm({ ...form, payMethod: e.target.value as PaymentMethod })}>
                    <option>перевод</option><option>наличные</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Статус оплаты</label>
                  <select className="px-3 py-2 rounded-md border border-slate-300" value={form.payStatus} onChange={e => setForm({ ...form, payStatus: e.target.value as PaymentStatus })}>
                    <option>ожидание</option><option>действует</option><option>задолженность</option>
                  </select>
                </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setModalOpen(false); setEditing(null); }} className="px-3 py-2 rounded-md border border-slate-300">Отмена</button>
              <button onClick={saveClient} className="px-3 py-2 rounded-md bg-sky-600 text-white">Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
