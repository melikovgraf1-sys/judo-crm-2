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
