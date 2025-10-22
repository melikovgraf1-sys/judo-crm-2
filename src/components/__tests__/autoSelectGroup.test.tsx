// @ts-nocheck
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

jest.mock("../../state/appState", () => ({
  __esModule: true,
  commitDBUpdate: jest.fn(async (next, setDB) => {
    if (typeof setDB === "function") {
      setDB(next);
    }
    return { ok: true, db: next };
  }),
}));

import GroupsTab from "../GroupsTab";
import AttendanceTab from "../AttendanceTab";
import PerformanceTab from "../PerformanceTab";
import { todayISO } from "../../state/utils";

type DB = Parameters<typeof GroupsTab>[0]["db"];

type UIState = Parameters<typeof GroupsTab>[0]["ui"];

beforeAll(() => {
  if (typeof window.ResizeObserver === "undefined") {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const createDB = (): DB => ({
  revision: 0,
  clients: [],
  attendance: [],
  performance: [],
  schedule: [
    { id: "slot-1", area: "Area1", group: "Group1", coachId: "coach", weekday: 1, time: "10:00", location: "" },
    { id: "slot-2", area: "Area1", group: "Group2", coachId: "coach", weekday: 2, time: "11:00", location: "" },
    { id: "slot-3", area: "Area2", group: "Group3", coachId: "coach", weekday: 3, time: "12:00", location: "" },
    { id: "slot-4", area: "резерв", group: "ReserveGroup", coachId: "coach", weekday: 4, time: "13:00", location: "" },
  ],
  leads: [],
  leadsArchive: [],
  leadHistory: [],
  tasks: [],
  tasksArchive: [],
  staff: [{ id: "coach", name: "Coach", role: "Тренер" }],
  settings: {
    areas: ["Area1", "Area2", "резерв"],
    groups: ["Group1", "Group2", "Group3", "ReserveGroup"],
    limits: {},
    rentByAreaEUR: {},
    coachSalaryByAreaEUR: {},
    currencyRates: { EUR: 1, TRY: 1, RUB: 1 },
    coachPayFormula: "",
    analyticsFavorites: [],
  },
  changelog: [],
});

const createUI = (): UIState => ({
  role: "Администратор",
  activeTab: "groups",
  breadcrumbs: [],
  currency: "EUR",
  search: "",
  theme: "light",
  pendingClientId: null,
});

const createClient = (overrides: Partial<DB["clients"][number]> = {}) => {
  const base = {
    id: "client-id",
    firstName: "Имя",
    lastName: "",
    parentName: "",
    phone: "",
    whatsApp: "",
    telegram: "",
    instagram: "",
    comment: "",
    channel: "Telegram",
    birthDate: "2010-01-01T00:00:00.000Z",
    gender: "м",
    area: "Area1",
    group: "Group1",
    coachId: "coach",
    startDate: "2024-01-01T00:00:00.000Z",
    payMethod: "перевод",
    payStatus: "ожидание",
    status: "действующий",
    subscriptionPlan: "monthly",
    payDate: "2024-01-10T00:00:00.000Z",
    payAmount: 55,
    payActual: 55,
    remainingLessons: 5,
    frozenLessons: 0,
    placements: [],
    payHistory: [],
  };

  const client = { ...base, ...overrides };

  if (!overrides.placements || !overrides.placements.length) {
    client.placements = [
      {
        id: `pl-${client.id}`,
        area: client.area,
        group: client.group,
        payStatus: client.payStatus,
        status: client.status,
        subscriptionPlan: client.subscriptionPlan,
        payDate: client.payDate,
        payAmount: client.payAmount,
        payActual: client.payActual,
        remainingLessons: client.remainingLessons,
        frozenLessons: client.frozenLessons,
      },
    ];
  }

  return client;
};

beforeEach(() => {
  window.localStorage.clear();
});

test("GroupsTab selects the first group when an area is chosen", async () => {
  const db = createDB();
  const ui = createUI();

  const Wrapper = () => {
    const [state, setState] = React.useState(db);
    const [uiState] = React.useState(ui);
    return <GroupsTab db={state} setDB={setState} ui={uiState} />;
  };

  render(<Wrapper />);

  await userEvent.click(screen.getByRole("button", { name: "Area1" }));
  const groupSelect = screen.getByLabelText("Фильтр по группе");

  await waitFor(() => expect(groupSelect).toHaveValue("Group1"));
});

test("GroupsTab keeps reserve areas without auto-selecting a group", async () => {
  const db = createDB();
  const ui = createUI();

  const Wrapper = () => {
    const [state, setState] = React.useState(db);
    const [uiState] = React.useState(ui);
    return <GroupsTab db={state} setDB={setState} ui={uiState} />;
  };

  render(<Wrapper />);

  await userEvent.click(screen.getByRole("button", { name: "Area1" }));
  const groupSelect = screen.getByLabelText("Фильтр по группе");
  await waitFor(() => expect(groupSelect).toHaveValue("Group1"));

  await userEvent.click(screen.getByRole("button", { name: "резерв" }));
  await waitFor(() => expect(groupSelect).toHaveValue(""));
});

test("AttendanceTab binds the first group after picking an area", async () => {
  const db = createDB();

  const Wrapper = () => {
    const [state, setState] = React.useState(db);
    return <AttendanceTab db={state} setDB={setState} currency="EUR" />;
  };

  render(<Wrapper />);

  const [areaSelect, groupSelect] = screen.getAllByRole("combobox");
  await userEvent.selectOptions(areaSelect, "Area1");

  await waitFor(() => expect(groupSelect).toHaveValue("Group1"));
});

test("PerformanceTab respects persisted group selections", async () => {
  const db = createDB();
  const today = todayISO().slice(0, 10);
  window.localStorage.setItem(
    "judo_crm_filters_performance",
    JSON.stringify({ date: today, area: "Area1", group: "Group2" }),
  );

  const Wrapper = () => {
    const [state, setState] = React.useState(db);
    return <PerformanceTab db={state} setDB={setState} currency="EUR" />;
  };

  render(<Wrapper />);

  const combos = screen.getAllByRole("combobox");
  const areaSelect = combos[0];
  const groupSelect = combos[1];

  expect(areaSelect).toHaveValue("Area1");
  expect(groupSelect).toHaveValue("Group2");

  await userEvent.selectOptions(areaSelect, "Area1");
  await waitFor(() => expect(groupSelect).toHaveValue("Group2"));
});

test("AttendanceTab shows clients from additional placements", async () => {
  const db = createDB();
  db.clients = [
    createClient({
      id: "client-extra",
      firstName: "Дополнительный",
      placements: [
        {
          id: "pl-primary",
          area: "Area1",
          group: "Group1",
          payStatus: "ожидание",
          status: "действующий",
          subscriptionPlan: "monthly",
          payDate: "2024-01-10T00:00:00.000Z",
          payAmount: 55,
          payActual: 55,
          remainingLessons: 5,
          frozenLessons: 0,
        },
        {
          id: "pl-extra",
          area: "Area2",
          group: "Group3",
          payStatus: "ожидание",
          status: "действующий",
          subscriptionPlan: "monthly",
          payDate: "2024-01-10T00:00:00.000Z",
          payAmount: 55,
          payActual: 55,
          remainingLessons: 5,
          frozenLessons: 0,
        },
      ],
    }),
  ];

  const Wrapper = () => {
    const [state, setState] = React.useState(db);
    return <AttendanceTab db={state} setDB={setState} currency="EUR" />;
  };

  render(<Wrapper />);

  const [areaSelect, groupSelect] = screen.getAllByRole("combobox");
  await userEvent.selectOptions(areaSelect, "Area2");

  await waitFor(() => expect(groupSelect).toHaveValue("Group3"));
  await waitFor(() => expect(screen.getByText("Найдено: 1")).toBeInTheDocument());
  expect(screen.getByText("Дополнительный")).toBeInTheDocument();
});

test("AttendanceTab hides canceled placements and clients", async () => {
  const db = createDB();
  db.clients = [
    createClient({ id: "active", firstName: "Активный" }),
    createClient({
      id: "placement-cancel",
      firstName: "Отмененное размещение",
      placements: [
        {
          id: "pl-cancel",
          area: "Area1",
          group: "Group1",
          payStatus: "ожидание",
          status: "отмена",
          subscriptionPlan: "monthly",
          payDate: "2024-01-10T00:00:00.000Z",
          payAmount: 55,
          payActual: 55,
          remainingLessons: 5,
          frozenLessons: 0,
        },
      ],
    }),
    createClient({ id: "client-cancel", firstName: "Отмененный клиент", status: "отмена" }),
  ];

  const Wrapper = () => {
    const [state, setState] = React.useState(db);
    return <AttendanceTab db={state} setDB={setState} currency="EUR" />;
  };

  render(<Wrapper />);

  const [areaSelect, groupSelect] = screen.getAllByRole("combobox");
  await userEvent.selectOptions(areaSelect, "Area1");
  await waitFor(() => expect(groupSelect).toHaveValue("Group1"));

  await waitFor(() => expect(screen.getByText("Найдено: 1")).toBeInTheDocument());
  expect(screen.getByText("Активный")).toBeInTheDocument();
  expect(screen.queryByText("Отмененное размещение")).not.toBeInTheDocument();
  expect(screen.queryByText("Отмененный клиент")).not.toBeInTheDocument();
});

test("PerformanceTab hides canceled placements and clients", async () => {
  const db = createDB();
  db.clients = [
    createClient({ id: "active", firstName: "Активный" }),
    createClient({
      id: "placement-cancel",
      firstName: "Отмененное размещение",
      placements: [
        {
          id: "pl-cancel",
          area: "Area1",
          group: "Group1",
          payStatus: "ожидание",
          status: "отмена",
          subscriptionPlan: "monthly",
          payDate: "2024-01-10T00:00:00.000Z",
          payAmount: 55,
          payActual: 55,
          remainingLessons: 5,
          frozenLessons: 0,
        },
      ],
    }),
    createClient({ id: "client-cancel", firstName: "Отмененный клиент", status: "отмена" }),
  ];

  const Wrapper = () => {
    const [state, setState] = React.useState(db);
    return <PerformanceTab db={state} setDB={setState} currency="EUR" />;
  };

  render(<Wrapper />);

  const selects = screen.getAllByRole("combobox");
  await userEvent.selectOptions(selects[0], "Area1");
  await waitFor(() => expect(selects[1]).toHaveValue("Group1"));

  await waitFor(() => expect(screen.getByText("Найдено: 1")).toBeInTheDocument());
  expect(screen.getByText("Активный")).toBeInTheDocument();
  expect(screen.queryByText("Отмененное размещение")).not.toBeInTheDocument();
  expect(screen.queryByText("Отмененный клиент")).not.toBeInTheDocument();
});
