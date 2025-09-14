import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScheduleTab from "../ScheduleTab";
import "@testing-library/jest-dom";

jest.mock("../../App", () => ({
  uid: () => "uid",
  saveDB: jest.fn(),
}));

const renderWithDB = (db) => {
  function Wrapper() {
    const [state, setState] = React.useState(db);
    return <ScheduleTab db={state} setDB={setState} />;
  }
  return render(<Wrapper />);
};

beforeEach(() => {
  global.prompt = jest.fn();
  global.confirm = jest.fn();
});

test("renders schedule grouped by area", () => {
  const db = {
    schedule: [
      { id: "1", area: "North", weekday: 1, time: "10:00", group: "Kids", coachId: "", location: "" },
      { id: "2", area: "South", weekday: 2, time: "11:00", group: "Teens", coachId: "", location: "" },
    ],
    settings: { areas: ["North", "South"], groups: ["Kids", "Teens"] },
  };
  renderWithDB(db);
  const north = screen.getByText("North").parentElement.parentElement;
  expect(within(north).getByText("Пн 10:00 · Kids")).toBeInTheDocument();
  const south = screen.getByText("South").parentElement.parentElement;
  expect(within(south).getByText("Вт 11:00 · Teens")).toBeInTheDocument();
});

test("addArea and addSlot add new area and slot", async () => {
  const user = userEvent;
  const db = { schedule: [], settings: { areas: [], groups: ["Kids"] } };
  renderWithDB(db);
  prompt
    .mockReturnValueOnce("East")
    .mockReturnValueOnce("1")
    .mockReturnValueOnce("09:00")
    .mockReturnValueOnce("Kids");
  await user.click(screen.getByRole("button", { name: "+ район" }));
  const area = screen.getByText("East").parentElement.parentElement;
  await user.click(within(area).getByRole("button", { name: "+ группа" }));
  expect(within(area).getByText("Пн 09:00 · Kids")).toBeInTheDocument();
});

test("renameArea and editSlot modify records", async () => {
  const user = userEvent;
  const db = {
    schedule: [{ id: "1", area: "North", weekday: 1, time: "10:00", group: "Kids", coachId: "", location: "" }],
    settings: { areas: ["North"], groups: ["Kids"] },
  };
  renderWithDB(db);
  prompt
    .mockReturnValueOnce("Center")
    .mockReturnValueOnce("2")
    .mockReturnValueOnce("12:00")
    .mockReturnValueOnce("Teens");
  const header = screen.getByText("North").parentElement;
  await user.click(within(header).getByRole("button", { name: "✎" }));
  const area = screen.getByText("Center").parentElement.parentElement;
  const slot = within(area).getByText("Пн 10:00 · Kids").parentElement;
  await user.click(within(slot).getByRole("button", { name: "✎" }));
  expect(within(area).getByText("Вт 12:00 · Teens")).toBeInTheDocument();
});

test("deleteArea and deleteSlot remove elements", async () => {
  const user = userEvent;
  const db = {
    schedule: [{ id: "1", area: "North", weekday: 1, time: "10:00", group: "Kids", coachId: "", location: "" }],
    settings: { areas: ["North"], groups: ["Kids"] },
  };
  renderWithDB(db);
  confirm.mockReturnValueOnce(true).mockReturnValueOnce(true);
  const slot = screen.getByText("Пн 10:00 · Kids").parentElement;
  await user.click(within(slot).getByRole("button", { name: "✕" }));
  expect(screen.queryByText("Пн 10:00 · Kids")).toBeNull();
  const header = screen.getByText("North").parentElement;
  await user.click(within(header).getByRole("button", { name: "✕" }));
  expect(screen.queryByText("North")).toBeNull();
});

