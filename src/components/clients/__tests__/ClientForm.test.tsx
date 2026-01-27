import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import ClientForm from "../ClientForm";
import type { DB } from "../../../types";

const buildDB = (): DB => ({
  revision: 0,
  clients: [],
  attendance: [],
  performance: [],
  schedule: [
    {
      id: "slot-1",
      area: "Area1",
      group: "Group1",
      coachId: "coach-1",
      weekday: 1,
      time: "10:00",
      location: "",
    },
  ],
  leads: [],
  leadsArchive: [],
  leadHistory: [],
  tasks: [],
  tasksArchive: [],
  staff: [],
  settings: {
    areas: ["Area1"],
    groups: ["Group1"],
    limits: { "Area1|Group1": 10 },
    rentByAreaEUR: { Area1: 0 },
    coachSalaryByAreaEUR: { Area1: 0 },
    currencyRates: { EUR: 1, TRY: 30, RUB: 90 },
    coachPayFormula: "",
    analyticsFavorites: [],
  },
  changelog: [],
});

describe("ClientForm", () => {
  it("allows selecting the deferred payment status", async () => {
    const db = buildDB();
    const handleSave = jest.fn();

    const { container } = render(
      <ClientForm db={db} editing={null} onSave={handleSave} onClose={() => {}} />,
    );

    const firstNameInput = container.querySelector('input[name="firstName"]') as HTMLInputElement;
    expect(firstNameInput).not.toBeNull();
    fireEvent.change(firstNameInput!, { target: { value: "Игорь" } });

    const phoneInput = container.querySelector('input[name="phone"]') as HTMLInputElement;
    expect(phoneInput).not.toBeNull();
    fireEvent.change(phoneInput!, { target: { value: "+70000000000" } });

    const payStatusSelect = container.querySelector('select[name="placements.0.payStatus"]') as HTMLSelectElement;
    expect(payStatusSelect).not.toBeNull();
    fireEvent.change(payStatusSelect!, { target: { value: "перенос" } });

    const saveButton = screen.getByRole("button", { name: "Сохранить" });
    await waitFor(() => expect(saveButton).not.toBeDisabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(handleSave).toHaveBeenCalledTimes(1));
    const payload = handleSave.mock.calls[0][0];
    expect(payload.placements[0].payStatus).toBe("перенос");
  });
});
