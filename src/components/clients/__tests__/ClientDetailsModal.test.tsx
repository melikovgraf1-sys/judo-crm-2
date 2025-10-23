import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import ClientDetailsModal from "../ClientDetailsModal";
import type { AttendanceEntry, Client, PaymentFact, PerformanceEntry, ScheduleSlot } from "../../../types";
import { getLatestFactDueDate } from "../../../state/paymentFacts";
import { getEffectiveRemainingLessons } from "../../../state/lessons";
let latestClient: Client | null = null;

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
        payMethod: "наличные",
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
        payMethod: "наличные",
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

  it("shows a placeholder when the client has no placements", () => {
    const clientWithoutPlacements: Client = {
      ...baseClient,
      placements: [],
    };

    render(
      <ClientDetailsModal
        client={clientWithoutPlacements}
        currency="EUR"
        currencyRates={currencyRates}
        schedule={schedule}
        attendance={attendance}
        performance={performance}
        billingPeriod={{ year: 2024, month: 3 }}
        onClose={() => {}}
      />,
    );

    expect(
      screen.getByText("Нет закреплённых тренировочных мест"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("client-placement-card")).not.toBeInTheDocument();
  });

  it("shows fallback remaining lessons for payment facts without placements", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-03-01T00:00:00.000Z"));

    const scheduleWithSessions: ScheduleSlot[] = [
      {
        id: "slot-1",
        area: "Area1",
        group: "Group1",
        coachId: "coach-1",
        weekday: 1,
        time: "10:00",
        location: "Main Hall",
      },
      {
        id: "slot-2",
        area: "Area1",
        group: "Group1",
        coachId: "coach-1",
        weekday: 3,
        time: "10:00",
        location: "Main Hall",
      },
    ];

    const clientWithHistoryOnly: Client = {
      ...baseClient,
      placements: [],
      remainingLessons: undefined,
      frozenLessons: undefined,
      payDate: "2024-03-08T00:00:00.000Z",
      payHistory: [
        {
          id: "fact-history-only",
          area: "Area1",
          group: "Group1",
          paidAt: "2024-02-28T00:00:00.000Z",
          recordedAt: "2024-02-28T00:00:00.000Z",
          amount: 100,
          subscriptionPlan: "monthly",
          periodLabel: "Март",
        },
      ],
    };

    const expectedRemainingLessons = getEffectiveRemainingLessons(
      clientWithHistoryOnly,
      scheduleWithSessions,
      new Date("2024-03-01T00:00:00.000Z"),
    );
    expect(expectedRemainingLessons).not.toBeNull();

    try {
      render(
        <ClientDetailsModal
          client={clientWithHistoryOnly}
          currency="EUR"
          currencyRates={currencyRates}
          schedule={scheduleWithSessions}
          attendance={attendance}
          performance={performance}
          billingPeriod={{ year: 2024, month: 3 }}
          onClose={() => {}}
        />,
      );

      await userEvent.click(screen.getByRole("button", { name: "Факты оплат" }));

      await userEvent.click(screen.getByText("Area1 · Group1"));

      const viewerHeading = await screen.findByText("Факт оплаты");
      const viewerDialog = viewerHeading.closest('[role="dialog"]');
      expect(viewerDialog).not.toBeNull();

      const remainingLessonsValue = within(viewerDialog as HTMLElement)
        .getByText("Остаток занятий")
        .nextElementSibling as HTMLElement | null;
      expect(remainingLessonsValue).not.toBeNull();
      expect(remainingLessonsValue).toHaveTextContent(
        String(expectedRemainingLessons as number),
      );
    } finally {
      jest.useRealTimers();
    }
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

  it("shows derived totals for payment facts with outdated placement references", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-03-10T00:00:00.000Z"));

    const outdatedClient: Client = {
      ...baseClient,
      area: "Area3",
      group: "Group3",
      subscriptionPlan: "single",
      payDate: "2024-03-05T00:00:00.000Z",
      remainingLessons: undefined,
      frozenLessons: undefined,
      placements: [
        {
          id: "pl-legacy",
          area: "Area3",
          group: "Group3",
          payMethod: "наличные",
          payStatus: "действует",
          status: "действующий",
          subscriptionPlan: "monthly",
          payDate: "2024-03-05T00:00:00.000Z",
          payAmount: 120,
          payActual: 120,
          remainingLessons: null,
          frozenLessons: 4,
        },
      ],
      payHistory: [
        {
          id: "fact-legacy",
          area: "LegacyArea",
          group: "LegacyGroup",
          paidAt: "2024-03-08T00:00:00.000Z",
          recordedAt: "2024-03-08T00:00:00.000Z",
          amount: 120,
          subscriptionPlan: "monthly",
          periodLabel: "Март",
        },
      ],
    };

    try {
      render(
        <ClientDetailsModal
          client={outdatedClient}
          currency="EUR"
          currencyRates={currencyRates}
          schedule={[]}
          attendance={attendance}
          performance={performance}
          billingPeriod={{ year: 2024, month: 3 }}
          onClose={() => {}}
        />,
      );

      await userEvent.click(screen.getByRole("button", { name: "Факты оплат" }));

      await userEvent.click(screen.getByText("LegacyArea · LegacyGroup"));

      const viewerHeading = await screen.findByText("Факт оплаты");
      const viewerDialog = viewerHeading.closest('[role="dialog"]');
      expect(viewerDialog).not.toBeNull();

      const remainingLessonsValue = within(viewerDialog as HTMLElement)
        .getByText("Остаток занятий")
        .nextElementSibling as HTMLElement | null;
      expect(remainingLessonsValue).not.toBeNull();
      expect(remainingLessonsValue).toHaveTextContent("0");

      const frozenLessonsValue = within(viewerDialog as HTMLElement)
        .getByText("Заморозка")
        .nextElementSibling as HTMLElement | null;
      expect(frozenLessonsValue).not.toBeNull();
      expect(frozenLessonsValue).toHaveTextContent("4");
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("ClientDetailsModal payment fact updates", () => {
  const currencyRates = { EUR: 1, TRY: 30, RUB: 90 } as const;

  beforeEach(() => {
    latestClient = null;
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function TestClientDetailsModalHarness({
    initialClient,
    schedule,
  }: {
    initialClient: Client;
    schedule: ScheduleSlot[];
  }) {
    const [clientState, setClientState] = React.useState<Client>(initialClient);

    React.useEffect(() => {
      latestClient = clientState;
    }, [clientState]);

    const handlePaymentFactsChange = React.useCallback(
      async (clientId: string, nextFacts: PaymentFact[]) => {
        if (clientState.id !== clientId) {
          return false;
        }

        setClientState(prev => {
          const nextClient: Client = {
            ...prev,
            ...(nextFacts.length ? { payHistory: nextFacts } : {}),
          };

          if (!nextFacts.length) {
            delete nextClient.payHistory;
          }

          const placements = Array.isArray(prev.placements) ? prev.placements : [];
          const updatedPlacements = placements.map(placement => {
            const planHint = placement.subscriptionPlan ?? prev.subscriptionPlan ?? null;
            const latestDueDate = getLatestFactDueDate(nextFacts, placement, planHint);
            if (latestDueDate) {
              return { ...placement, payDate: latestDueDate };
            }
            const { payDate: _omit, ...rest } = placement;
            return rest;
          });

          nextClient.placements = updatedPlacements as Client["placements"];

          const primaryPlacement = updatedPlacements[0] ?? null;
          const latestPrimaryDueDate = getLatestFactDueDate(
            nextFacts,
            primaryPlacement ?? { area: prev.area, group: prev.group },
            primaryPlacement?.subscriptionPlan ?? prev.subscriptionPlan ?? null,
          );

          if (latestPrimaryDueDate) {
            nextClient.payDate = latestPrimaryDueDate;
          } else if (primaryPlacement?.payDate) {
            nextClient.payDate = primaryPlacement.payDate;
          } else if (nextClient.payDate) {
            delete nextClient.payDate;
          }

          return nextClient;
        });

        return true;
      },
      [clientState.id, clientState.area, clientState.group],
    );

    return (
      <ClientDetailsModal
        client={clientState}
        currency="EUR"
        currencyRates={currencyRates}
        schedule={schedule}
        attendance={[]}
        performance={[]}
        onClose={() => {}}
        onPaymentFactsChange={handlePaymentFactsChange}
      />
    );
  }

  it("recalculates remaining lessons and next payment date when fact paidAt changes", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-03-01T00:00:00.000Z"));

    const schedule: ScheduleSlot[] = Array.from({ length: 7 }).map((_, index) => ({
      id: `slot-${index}`,
      area: "DailyArea",
      group: "DailyGroup",
      coachId: "coach-1",
      weekday: index + 1,
      time: "10:00",
      location: "Main Hall",
    }));

    const client: Client = {
      id: "client-daily",
      firstName: "Олег",
      lastName: "",
      parentName: "",
      phone: "",
      whatsApp: "",
      telegram: "",
      instagram: "",
      comment: "",
      channel: "Telegram",
      birthDate: "2015-01-01T00:00:00.000Z",
      gender: "м",
      area: "DailyArea",
      group: "DailyGroup",
      coachId: undefined,
      startDate: "2024-01-01T00:00:00.000Z",
      payMethod: "наличные",
      payStatus: "действует",
      status: "действующий",
      statusUpdatedAt: undefined,
      subscriptionPlan: "monthly",
      payDate: "2024-03-05T00:00:00.000Z",
      payAmount: 120,
      payActual: 120,
      remainingLessons: undefined,
      frozenLessons: 0,
      placements: [
        {
          id: "placement-daily",
          area: "DailyArea",
          group: "DailyGroup",
          payMethod: "наличные",
          payStatus: "действует",
          status: "действующий",
          subscriptionPlan: "monthly",
          payDate: "2024-03-05T00:00:00.000Z",
          payAmount: 120,
          payActual: 120,
          frozenLessons: 0,
        },
      ],
      payHistory: [
        {
          id: "fact-daily",
          area: "DailyArea",
          group: "DailyGroup",
          paidAt: "2024-03-05T00:00:00.000Z",
          amount: 120,
          subscriptionPlan: "monthly",
        },
      ],
    };

    render(<TestClientDetailsModalHarness initialClient={client} schedule={schedule} />);

    await userEvent.click(screen.getByRole("button", { name: "Факты оплат" }));
    const paymentEntries = await screen.findAllByText("DailyArea · DailyGroup");
    const paymentEntry = paymentEntries.find(element => element.closest("li"));
    expect(paymentEntry).toBeTruthy();
    await userEvent.click(paymentEntry!);

    const viewerHeading = await screen.findByText("Факт оплаты");
    const viewerDialog = viewerHeading.closest('[role="dialog"]');
    expect(viewerDialog).not.toBeNull();

    const viewer = within(viewerDialog as HTMLElement);
    const remainingLabel = viewer.getByText("Остаток занятий");
    const remainingRow = remainingLabel.closest("div");
    expect(remainingRow?.querySelectorAll("span")[1]).toHaveTextContent("35");

    await userEvent.click(viewer.getByRole("button", { name: "Редактировать" }));

    const editorHeading = await screen.findByText("Редактирование факта оплаты");
    const editorDialog = editorHeading.closest('[role="dialog"]');
    expect(editorDialog).not.toBeNull();

    const editor = within(editorDialog as HTMLElement);
    const paidAtInput = editor.getByLabelText("Дата оплаты");
    await userEvent.clear(paidAtInput);
    await userEvent.type(paidAtInput, "2024-03-10");

    const remainingInput = editor.getByLabelText(/Остаток занятий/);
    await userEvent.clear(remainingInput);

    await userEvent.click(editor.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(screen.queryByText("Редактирование факта оплаты")).not.toBeInTheDocument(),
    );

    await waitFor(() => {
      expect(latestClient?.placements[0]?.payDate).toBe("2024-04-10T00:00:00.000Z");
      expect(latestClient?.payDate).toBe("2024-04-10T00:00:00.000Z");
      expect(latestClient?.payHistory?.[0]?.paidAt).toBe("2024-03-10T00:00:00.000Z");
    });

    expect(latestClient).not.toBeNull();
    const placementPayDate = latestClient?.placements[0]?.payDate ?? null;
    const factPaidAt = latestClient?.payHistory?.[0]?.paidAt ?? null;
    expect(placementPayDate).not.toBeNull();
    expect(factPaidAt).not.toBeNull();
    if (placementPayDate && factPaidAt) {
      expect(new Date(placementPayDate).getTime()).toBeGreaterThan(new Date(factPaidAt).getTime());
    }

    await waitFor(() => {
      expect(screen.getAllByText("10.03.2024").length).toBeGreaterThan(0);
    });

    const updatedEntries = await screen.findAllByText("DailyArea · DailyGroup");
    const updatedEntry = updatedEntries.find(element => element.closest("li"));
    expect(updatedEntry).toBeTruthy();
    await userEvent.click(updatedEntry!);

    const updatedViewerHeading = await screen.findByText("Факт оплаты");
    const updatedViewerDialog = updatedViewerHeading.closest('[role="dialog"]');
    expect(updatedViewerDialog).not.toBeNull();

    const updatedViewer = within(updatedViewerDialog as HTMLElement);
    const updatedRemainingLabel = updatedViewer.getByText("Остаток занятий");
    const updatedRemainingRow = updatedRemainingLabel.closest("div");
    const remainingText = updatedRemainingRow?.querySelectorAll("span")[1]?.textContent ?? "";
    expect(Number.parseInt(remainingText, 10)).toBeGreaterThan(0);
  });
});
