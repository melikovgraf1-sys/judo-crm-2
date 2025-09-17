// @ts-nocheck
import React from "react";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

jest.mock("../../state/appState", () => ({
  __esModule: true,
  commitDBUpdate: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../state/utils", () => ({
  __esModule: true,
  uid: () => "test-id",
  todayISO: () => new Date().toISOString(),
  parseDateInput: (s: string) => s,
  fmtMoney: (v: number) => String(v),
  calcAgeYears: () => 0,
  calcExperience: () => 0,
}));

jest.mock("../VirtualizedTable", () => (props) => <table>{props.children}</table>);

import ScheduleTab from "../ScheduleTab";
import ClientsTab from "../ClientsTab";
import { commitDBUpdate } from "../../state/appState";

beforeEach(() => {
  commitDBUpdate.mockImplementation(async (next, setDB) => {
    setDB(next);
    return true;
  });
  window.alert = jest.fn();
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  commitDBUpdate.mockResolvedValue(true);
});

function makeDb() {
  return {
    clients: [],
    attendance: [],
    schedule: [],
    leads: [],
    tasks: [],
    staff: [],
    settings: {
      areas: ["A1"],
      groups: [],
      limits: {},
      rentByAreaEUR: {},
      currencyRates: { EUR: 1, TRY: 1, RUB: 1 },
      coachPayFormula: "",
    },
    changelog: [],
  };
}

function renderSchedule(db) {
  let current = db;
  const Wrapper = () => {
    const [state, setState] = React.useState(current);
    current = state;
    return <ScheduleTab db={state} setDB={setState} />;
  };
  const utils = render(<Wrapper />);
  return { ...utils, getDb: () => current };
}

describe("ScheduleTab groups", () => {
  test("Create: adding slot with new group adds group to settings", async () => {
    const { getDb } = renderSchedule(makeDb());
    const prompts = ["1", "10:00", "Alpha"];
    jest.spyOn(window, "prompt").mockImplementation(() => prompts.shift());
    await userEvent.click(screen.getByText("+ группа"));
    expect(getDb().settings.groups).toEqual(["Alpha"]);
  });

  test("Read: groups appear in ClientsTab filters", async () => {
    const { getDb } = renderSchedule(makeDb());
    const prompts = ["1", "10:00", "Alpha"];
    jest.spyOn(window, "prompt").mockImplementation(() => prompts.shift());
    await userEvent.click(screen.getByText("+ группа"));
    const ui = { role: "Администратор", activeTab: "clients", breadcrumbs: [], currency: "EUR", search: "", theme: "light" };
    render(<ClientsTab db={getDb()} setDB={() => {}} ui={ui} />);
    expect(screen.getByRole("option", { name: "Alpha" })).toBeInTheDocument();
  });

  test("Update: editing slot changes group and updates settings", async () => {
    const db = makeDb();
    db.settings.groups = ["Alpha"];
    db.schedule = [{ id: "s1", area: "A1", weekday: 1, time: "10:00", group: "Alpha", coachId: "", location: "" }];
    const { getDb } = renderSchedule(db);
    const prompts = ["1", "11:00", "Beta"];
    jest.spyOn(window, "prompt").mockImplementation(() => prompts.shift());
    const slotItem = screen.getByText(/Alpha$/).closest("li");
    if (!slotItem) throw new Error("slot not found");
    const editBtn = within(slotItem).getByText("✎");
    await userEvent.click(editBtn);
    const after = getDb();
    expect(after.schedule[0].group).toBe("Beta");
    expect(after.settings.groups).toEqual(["Alpha", "Beta"]);
  });

  test("Delete: deleting area removes slots and keeps groups", async () => {
    const db = makeDb();
    db.settings.groups = ["Alpha", "Beta"];
    db.schedule = [{ id: "s1", area: "A1", weekday: 1, time: "10:00", group: "Alpha", coachId: "", location: "" }];
    const { getDb } = renderSchedule(db);
    jest.spyOn(window, "confirm").mockReturnValue(true);
    const deleteAreaBtn = screen.getAllByText("✕")[0];
    await userEvent.click(deleteAreaBtn);
    const after = getDb();
    expect(after.schedule).toHaveLength(0);
    expect(after.settings.groups).toEqual(["Alpha", "Beta"]);
  });
});

