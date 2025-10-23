import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import ClientForm from "../ClientForm";
import type { Client, DB } from "../../../types";

const baseDb: DB = {
  revision: 1,
  clients: [],
  attendance: [],
  performance: [],
  schedule: [],
  leads: [],
  leadsArchive: [],
  leadHistory: [],
  tasks: [],
  tasksArchive: [],
  staff: [],
  settings: {
    areas: ["Area1", "Area2"],
    groups: ["Group1", "Group2"],
    limits: {},
    rentByAreaEUR: {},
    coachSalaryByAreaEUR: {},
    currencyRates: { EUR: 1, TRY: 30, RUB: 90 },
    coachPayFormula: "",
    analyticsFavorites: [],
  },
  changelog: [],
};

const editingClient: Client = {
  id: "client-1",
  firstName: "Иван",
  lastName: "Иванов",
  parentName: "",
  phone: "+7 900 000-00-00",
  whatsApp: "",
  telegram: "",
  instagram: "",
  comment: "",
  channel: "Telegram",
  birthDate: "2015-01-01T00:00:00.000Z",
  gender: "м",
  area: "Area1",
  group: "Group1",
  coachId: undefined,
  startDate: "2024-01-01T00:00:00.000Z",
  payMethod: "наличные",
  payStatus: "ожидание",
  status: "действующий",
  statusUpdatedAt: undefined,
  subscriptionPlan: "monthly",
  payDate: "2024-03-01T00:00:00.000Z",
  payAmount: 100,
  payActual: 0,
  remainingLessons: 8,
  frozenLessons: 0,
  placements: [
    {
      id: "pl-1",
      area: "Area1",
      group: "Group1",
      payMethod: "наличные",
      payStatus: "ожидание",
      status: "действующий",
      subscriptionPlan: "monthly",
      payDate: "2024-03-01T00:00:00.000Z",
      payAmount: 100,
      payActual: 0,
      remainingLessons: 8,
      frozenLessons: 0,
    },
  ],
  payHistory: [],
};

describe("ClientForm placements", () => {
  it("allows removing the final placement when editing", async () => {
    const handleSave = jest.fn();

    render(
      <ClientForm db={{ ...baseDb }} editing={editingClient} onSave={handleSave} onClose={() => {}} />,
    );

    const deleteButton = await screen.findByRole("button", { name: "Удалить" });
    expect(deleteButton).toBeEnabled();

    await userEvent.click(deleteButton);

    expect(screen.queryByText("Основное место")).not.toBeInTheDocument();

    const saveButton = screen.getByRole("button", { name: "Сохранить" });
    await waitFor(() => expect(saveButton).toBeEnabled());

    const form = saveButton.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => expect(handleSave).toHaveBeenCalledTimes(1));
    expect(handleSave.mock.calls[0][0].placements).toEqual([]);
  });

  it("disables removal of the only placement when creating a new client", () => {
    render(<ClientForm db={{ ...baseDb }} editing={null} onSave={jest.fn()} onClose={() => {}} />);

    const deleteButton = screen.getByRole("button", { name: "Удалить" });
    expect(deleteButton).toBeDisabled();
  });
});
