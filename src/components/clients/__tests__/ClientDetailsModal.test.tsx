import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import ClientDetailsModal from "../ClientDetailsModal";
import type { AttendanceEntry, Client, PerformanceEntry, ScheduleSlot } from "../../../types";

describe("ClientDetailsModal placements", () => {
  const attendance: AttendanceEntry[] = [];
  const performance: PerformanceEntry[] = [];
  const schedule: ScheduleSlot[] = [];
  const currencyRates = { EUR: 1, TRY: 30, RUB: 90 } as const;

  const baseClient: Client = {
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
    payActual: undefined,
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
        payStatus: "ожидание",
        status: "действующий",
        subscriptionPlan: "monthly",
        payDate: "2024-02-01T00:00:00.000Z",
        payAmount: 80,
        payActual: 60,
        remainingLessons: 5,
        frozenLessons: 0,
      },
    ],
    payHistory: [
      {
        id: "fact-1",
        area: "Area1",
        group: "Group1",
        paidAt: "2024-03-05T00:00:00.000Z",
        recordedAt: "2024-03-05T00:00:00.000Z",
        amount: 100,
        subscriptionPlan: "monthly",
        periodLabel: "Март",
        remainingLessons: 7,
        frozenLessons: 2,
      },
      {
        id: "fact-2",
        area: "Area2",
        group: "Group2",
        paidAt: "2024-02-10T00:00:00.000Z",
        recordedAt: "2024-02-10T00:00:00.000Z",
        amount: 60,
        subscriptionPlan: "monthly",
        periodLabel: "Февраль",
      },
    ],
  };

  it("renders placement-specific statuses and payment facts", () => {
    render(
      <ClientDetailsModal
        client={baseClient}
        currency="EUR"
        currencyRates={currencyRates}
        schedule={schedule}
        attendance={attendance}
        performance={performance}
        billingPeriod={{ year: 2024, month: 3 }}
        onClose={() => {}}
      />,
    );

    const placementCards = screen.getAllByTestId("client-placement-card");
    expect(placementCards).toHaveLength(2);

    const [firstPlacementCard, secondPlacementCard] = placementCards;

    const firstAreaValue = within(firstPlacementCard)
      .getByText("Район")
      .nextElementSibling as HTMLElement | null;
    const firstGroupValue = within(firstPlacementCard)
      .getByText("Группа")
      .nextElementSibling as HTMLElement | null;
    const firstStatusValue = within(firstPlacementCard)
      .getByText("Статус оплаты")
      .nextElementSibling as HTMLElement | null;

    expect(firstAreaValue).toHaveTextContent("Area1");
    expect(firstGroupValue).toHaveTextContent("Group1");
    expect(firstStatusValue).toHaveTextContent("действует");

    const secondAreaValue = within(secondPlacementCard)
      .getByText("Район")
      .nextElementSibling as HTMLElement | null;
    const secondGroupValue = within(secondPlacementCard)
      .getByText("Группа")
      .nextElementSibling as HTMLElement | null;
    const secondStatusValue = within(secondPlacementCard)
      .getByText("Статус оплаты")
      .nextElementSibling as HTMLElement | null;

    expect(secondAreaValue).toHaveTextContent("Area2");
    expect(secondGroupValue).toHaveTextContent("Group2");
    expect(secondStatusValue).toHaveTextContent("ожидание");
  });

  it("shows payment fact details for editing", async () => {
    render(
      <ClientDetailsModal
        client={baseClient}
        currency="EUR"
        currencyRates={currencyRates}
        schedule={schedule}
        attendance={attendance}
        performance={performance}
        billingPeriod={{ year: 2024, month: 3 }}
        onClose={() => {}}
        onPaymentFactsChange={jest.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Факты оплат" }));

    await userEvent.click(screen.getByText("Area1 · Group1"));

    const viewerHeading = await screen.findByText("Факт оплаты");
    const viewerDialog = viewerHeading.closest('[role="dialog"]');
    expect(viewerDialog).not.toBeNull();

    await userEvent.click(
      within(viewerDialog as HTMLElement).getByRole("button", { name: "Редактировать" }),
    );

    const editorHeading = await screen.findByText("Редактирование факта оплаты");
    const editorDialog = editorHeading.closest('[role="dialog"]');
    expect(editorDialog).not.toBeNull();

    const editor = within(editorDialog as HTMLElement);

    expect(editor.getByLabelText("Факт оплаты, €")).toHaveDisplayValue("100");
    expect(editor.getByLabelText("Сумма (ожидаемая), €")).toHaveDisplayValue("100");
    expect(editor.getByLabelText(/Остаток занятий/)).toHaveDisplayValue("7");
    expect(editor.getByLabelText(/Заморозка занятий/)).toHaveDisplayValue("2");
  });
});
