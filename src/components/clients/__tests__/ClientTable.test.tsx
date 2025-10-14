import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import ClientTable from "../ClientTable";
import type {
  AttendanceEntry,
  Client,
  PerformanceEntry,
  ScheduleSlot,
  Settings,
} from "../../../types";

describe("ClientTable active placement matching", () => {
  const attendance: AttendanceEntry[] = [];
  const performance: PerformanceEntry[] = [];
  const schedule: ScheduleSlot[] = [];
  const currencyRates: Settings["currencyRates"] = { EUR: 1, TRY: 30, RUB: 90 };

  it("treats facts without area or group as payment for the active placement", () => {
    const client: Client = {
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
      startDate: "2023-01-01T00:00:00.000Z",
      payMethod: "наличные",
      payStatus: "действует",
      status: "действующий",
      statusUpdatedAt: undefined,
      subscriptionPlan: "monthly",
      payDate: "2024-03-01T00:00:00.000Z",
      payAmount: 100,
      payActual: 100,
      remainingLessons: 8,
      frozenLessons: 0,
      placements: [
        {
          id: "pl-1",
          area: "Area1",
          group: "Group1",
          payStatus: "ожидание",
          status: "действующий",
          subscriptionPlan: "monthly",
          payDate: "2024-03-01T00:00:00.000Z",
          payAmount: 100,
          payActual: 100,
          remainingLessons: 8,
          frozenLessons: 0,
        },
        {
          id: "pl-2",
          area: "Area2",
          group: "Group2",
          payStatus: "действует",
          status: "действующий",
          subscriptionPlan: "monthly",
          payDate: "2024-03-01T00:00:00.000Z",
          payAmount: 100,
          payActual: 100,
          remainingLessons: 8,
          frozenLessons: 0,
        },
      ],
      payHistory: [
        {
          id: "fact-1",
          paidAt: "2024-03-10T00:00:00.000Z",
          amount: 100,
        },
      ],
    };

    render(
      <ClientTable
        list={[client]}
        currency="RUB"
        currencyRates={currencyRates}
        onEdit={() => {}}
        onCreateTask={() => {}}
        schedule={schedule}
        attendance={attendance}
        performance={performance}
        billingPeriod={{ year: 2024, month: 3 }}
        activeArea="Area2"
        activeGroup="Group2"
      />,
    );

    const row = screen.getByText("Иван Иванов").closest("tr");
    expect(row).not.toBeNull();

    if (!row) {
      throw new Error("Client row not found");
    }

    expect(within(row).getByText("действует")).toBeInTheDocument();
    expect(within(row).queryByText("ожидание")).not.toBeInTheDocument();
  });

  it("opens the modal with canonical client data when resolver is provided", async () => {
    const canonical: Client = {
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
      startDate: "2023-01-01T00:00:00.000Z",
      payMethod: "наличные",
      payStatus: "действует",
      status: "действующий",
      statusUpdatedAt: undefined,
      subscriptionPlan: "monthly",
      payDate: "2024-03-01T00:00:00.000Z",
      payAmount: 100,
      payActual: 100,
      remainingLessons: 8,
      frozenLessons: 0,
      placements: [
        {
          id: "pl-1",
          area: "Area1",
          group: "Group1",
          payStatus: "действует",
          status: "действующий",
          subscriptionPlan: "monthly",
          payDate: "2024-03-01T00:00:00.000Z",
          payAmount: 100,
          payActual: 100,
          remainingLessons: 8,
          frozenLessons: 0,
        },
        {
          id: "pl-2",
          area: "Area2",
          group: "Group2",
          payStatus: "действует",
          status: "действующий",
          subscriptionPlan: "monthly",
          payDate: "2024-03-01T00:00:00.000Z",
          payAmount: 90,
          payActual: 90,
          remainingLessons: 6,
          frozenLessons: 0,
        },
      ],
      payHistory: [
        {
          id: "fact-1",
          paidAt: "2024-03-05T00:00:00.000Z",
          amount: 100,
        },
      ],
    };

    const listClient: Client = {
      ...canonical,
      placements: [canonical.placements[0]],
    };

    const user = userEvent.setup();

    render(
      <ClientTable
        list={[listClient]}
        currency="RUB"
        currencyRates={currencyRates}
        onEdit={() => {}}
        onCreateTask={() => {}}
        schedule={schedule}
        attendance={attendance}
        performance={performance}
        resolveClient={clientId => (clientId === canonical.id ? canonical : null)}
      />,
    );

    await user.click(screen.getByText("Иван Иванов"));

    expect(await screen.findByText("Area2 · Group2")).toBeInTheDocument();
  });
});
