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

  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(
      'judo_crm_table_clients_columns',
      JSON.stringify([
        'name',
        'parent',
        'phone',
        'whatsApp',
        'telegram',
        'instagram',
        'area',
        'group',
        'age',
        'experience',
        'status',
        'payStatus',
        'remainingLessons',
        'payAmount',
        'payActual',
        'payDate',
        'actions',
      ]),
    );
  });

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

  it("shows payment facts for the active placement and sorts by their sum", async () => {
    const clientWithFacts: Client = {
      id: "client-facts",
      firstName: "Фактов",
      lastName: "Платёж",
      parentName: "",
      phone: "+7 900 000-00-01",
      whatsApp: "",
      telegram: "",
      instagram: "",
      comment: "",
      channel: "Telegram",
      birthDate: "2014-02-02T00:00:00.000Z",
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
      payDate: "2024-01-01T00:00:00.000Z",
      payAmount: 200,
      payActual: 60,
      remainingLessons: 8,
      frozenLessons: 0,
      placements: [
        {
          id: "pl-facts-1",
          area: "Area1",
          group: "Group1",
          payStatus: "действует",
          status: "действующий",
          subscriptionPlan: "monthly",
          payDate: "2024-01-01T00:00:00.000Z",
          payAmount: 200,
          payActual: 60,
          remainingLessons: 8,
          frozenLessons: 0,
        },
        {
          id: "pl-facts-2",
          area: "Area2",
          group: "Group2",
          payStatus: "действует",
          status: "действующий",
          subscriptionPlan: "monthly",
          payDate: "2024-01-01T00:00:00.000Z",
          payAmount: 200,
          payActual: 70,
          remainingLessons: 8,
          frozenLessons: 0,
        },
      ],
      payHistory: [
        {
          id: "fact-1",
          paidAt: "2024-01-05T00:00:00.000Z",
          amount: 70,
          area: "Area2",
          group: "Group2",
        },
        {
          id: "fact-2",
          paidAt: "2024-01-10T00:00:00.000Z",
          amount: 80,
          area: "Area2",
          group: "Group2",
        },
        {
          id: "fact-3",
          paidAt: "2024-01-15T00:00:00.000Z",
          amount: 40,
          area: "Area1",
          group: "Group1",
        },
      ],
    };

    const clientWithLowerFact: Client = {
      id: "client-lower",
      firstName: "Размещение",
      lastName: "Тест",
      parentName: "",
      phone: "+7 900 000-00-02",
      whatsApp: "",
      telegram: "",
      instagram: "",
      comment: "",
      channel: "Telegram",
      birthDate: "2013-03-03T00:00:00.000Z",
      gender: "м",
      area: "Area2",
      group: "Group2",
      coachId: undefined,
      startDate: "2023-01-01T00:00:00.000Z",
      payMethod: "наличные",
      payStatus: "действует",
      status: "действующий",
      statusUpdatedAt: undefined,
      subscriptionPlan: "monthly",
      payDate: "2024-01-01T00:00:00.000Z",
      payAmount: 120,
      payActual: 120,
      remainingLessons: 8,
      frozenLessons: 0,
      placements: [
        {
          id: "pl-lower",
          area: "Area2",
          group: "Group2",
          payStatus: "действует",
          status: "действующий",
          subscriptionPlan: "monthly",
          payDate: "2024-01-01T00:00:00.000Z",
          payAmount: 120,
          payActual: 120,
          remainingLessons: 8,
          frozenLessons: 0,
        },
      ],
      payHistory: [
        {
          id: "fact-lower",
          paidAt: "2024-01-08T00:00:00.000Z",
          amount: 120,
          area: "Area2",
          group: "Group2",
        },
      ],
    };

    render(
      <ClientTable
        list={[clientWithFacts, clientWithLowerFact]}
        currency="RUB"
        currencyRates={{ EUR: 1, TRY: 1, RUB: 1 }}
        onEdit={() => {}}
        onCreateTask={() => {}}
        schedule={schedule}
        attendance={attendance}
        performance={performance}
        billingPeriod={{ year: 2024, month: 1 }}
        activeArea="Area2"
        activeGroup="Group2"
      />,
    );

    const factsRowLabel = await screen.findByText("Фактов Платёж");
    const factsRow = factsRowLabel.closest("tr");
    expect(factsRow).not.toBeNull();
    if (!factsRow) {
      throw new Error("Row for client with facts not found");
    }

    expect(within(factsRow).getByText(/150,00/)).toBeInTheDocument();
    expect(within(factsRow).getByText("действует")).toBeInTheDocument();

    const payActualHeader = screen.getByRole("button", { name: /Факт оплаты/ });
    await userEvent.click(payActualHeader);
    await userEvent.click(payActualHeader);

    const dataRows = screen
      .getAllByRole("row")
      .filter(row =>
        within(row).queryByText("Фактов Платёж") || within(row).queryByText("Размещение Тест"),
      );

    expect(dataRows).toHaveLength(2);
    expect(within(dataRows[0]).getByText("Фактов Платёж")).toBeInTheDocument();
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

    render(
      <ClientTable
        list={[listClient]}
        currency="RUB"
        currencyRates={{ EUR: 1, TRY: 1, RUB: 1 }}
        onEdit={() => {}}
        onCreateTask={() => {}}
        schedule={schedule}
        attendance={attendance}
        performance={performance}
        resolveClient={clientId => (clientId === canonical.id ? canonical : null)}
      />,
    );

    await userEvent.click(screen.getByText("Иван Иванов"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Area1 · Group1, Area2 · Group2")).toBeInTheDocument();
  });
});
