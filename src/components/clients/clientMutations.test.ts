// @ts-nocheck
import { transformClientFormValues } from "./clientMutations";
import { createPaymentFact, normalizePaymentFacts } from "../../state/paymentFacts";
import type { Client, ClientFormValues, ClientPlacementFormValues } from "../../types";

describe("transformClientFormValues", () => {
  const basePlacement = (): ClientPlacementFormValues => ({
    id: "pl-1",
    area: "Area1",
    group: "Group1",
    payMethod: "перевод",
    payStatus: "ожидание",
    status: "действующий",
    subscriptionPlan: "monthly",
    payDate: "2024-01-10",
    payAmount: "",
    payActual: "",
    remainingLessons: "",
    frozenLessons: "",
  });

  const baseFormValues: ClientFormValues = {
    firstName: "Имя",
    lastName: "",
    phone: "",
    whatsApp: "",
    telegram: "",
    instagram: "",
    comment: "",
    channel: "Telegram",
    birthDate: "2010-01-01",
    parentName: "",
    gender: "м",
    startDate: "2024-01-01",
    payMethod: "перевод",
    placements: [basePlacement()],
  };

  it("omits payAmount, payActual, remainingLessons and frozenLessons when not provided", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      placements: [
        {
          ...basePlacement(),
          id: "pl-keep-empty",
          group: "взрослые",
          payAmount: "",
          payActual: "",
          remainingLessons: "",
          frozenLessons: "",
        },
      ],
      whatsApp: "",
    };

    const result = transformClientFormValues(data);

    expect(result.placements[0]).not.toHaveProperty("payAmount");
    expect(result.placements[0]).not.toHaveProperty("payActual");
    expect(result.placements[0]).not.toHaveProperty("remainingLessons");
    expect(result.placements[0]).not.toHaveProperty("frozenLessons");
    expect(result.payMethod).toBe("перевод");
    expect(result.placements[0].payMethod).toBe("перевод");
  });

  it("keeps numeric fields when provided", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      placements: [
        {
          ...basePlacement(),
          id: "pl-numeric",
          group: "индивидуальные",
          payAmount: "150",
          payActual: "120",
          remainingLessons: "8",
          frozenLessons: "3",
        },
      ],
      telegram: "@client",
    };

    const result = transformClientFormValues(data);

    expect(result).toMatchObject({
      payAmount: 150,
      payActual: 120,
      remainingLessons: 8,
      frozenLessons: 3,
      payMethod: "перевод",
      placements: [
        expect.objectContaining({
          payMethod: "перевод",
          payAmount: 150,
          payActual: 120,
          remainingLessons: 8,
          frozenLessons: 3,
        }),
      ],
      telegram: "@client",
    });
  });

  it("preserves negative remaining lessons for manual groups", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      placements: [
        {
          ...basePlacement(),
          id: "pl-debt",
          group: "индивидуальные",
          remainingLessons: "-3",
        },
      ],
    };

    const result = transformClientFormValues(data);

    expect(result.remainingLessons).toBe(-3);
    expect(result.placements[0].remainingLessons).toBe(-3);
  });

  it("allows manual remaining lessons for single visit plan", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      placements: [
        {
          ...basePlacement(),
          id: "pl-single",
          subscriptionPlan: "single",
          remainingLessons: "3",
        },
      ],
    };

    const result = transformClientFormValues(data);

    expect(result).toMatchObject({
      remainingLessons: 3,
      subscriptionPlan: "single",
      placements: [expect.objectContaining({ remainingLessons: 3, subscriptionPlan: "single" })],
    });
  });

  it("trims comment when provided", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      comment: "  важная заметка  ",
    };

    const result = transformClientFormValues(data);

    expect(result).toMatchObject({ comment: "важная заметка" });
  });

  it("preserves previous numeric payAmount when input is empty", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      placements: [
        {
          ...basePlacement(),
          id: "pl-previous",
          group: "взрослые",
          payAmount: "",
          payActual: "",
        },
      ],
    };

    const editing: Client = {
      id: "client-1",
      ...transformClientFormValues({
        ...baseFormValues,
        placements: [
          {
            ...basePlacement(),
            id: "pl-previous",
            group: "индивидуальные",
            payAmount: "100",
          },
        ],
      }),
    };

    const result = transformClientFormValues(data, editing);

    expect(result).toHaveProperty("payAmount", 100);
    expect(result.placements[0]).toHaveProperty("payAmount", 100);
  });

  it("allows clearing payActual when editing", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      placements: [
        { ...basePlacement(), id: "pl-clear", group: "индивидуальные", payActual: "" },
      ],
    };

    const editing: Client = {
      id: "client-2",
      ...transformClientFormValues({
        ...baseFormValues,
        placements: [
          { ...basePlacement(), id: "pl-clear", group: "индивидуальные", payActual: "200" },
        ],
      }),
    };

    const result = transformClientFormValues(data, editing);

    expect(result).not.toHaveProperty("payActual");
    expect(result.placements[0]).not.toHaveProperty("payActual");
  });

  it("allows editing frozenLessons", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      placements: [
        { ...basePlacement(), id: "pl-freeze", frozenLessons: "5" },
      ],
    };

    const result = transformClientFormValues(data);

    expect(result).toMatchObject({
      frozenLessons: 5,
      placements: [expect.objectContaining({ frozenLessons: 5 })],
    });
  });

  it("allows clearing frozenLessons when editing", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      placements: [
        { ...basePlacement(), id: "pl-freeze", frozenLessons: "" },
      ],
    };

    const editing: Client = {
      id: "client-freeze",
      ...transformClientFormValues({
        ...baseFormValues,
        placements: [
          { ...basePlacement(), id: "pl-freeze", frozenLessons: "4" },
        ],
      }),
    };

    const result = transformClientFormValues(data, editing);

    expect(result).not.toHaveProperty("frozenLessons");
    expect(result.placements[0]).not.toHaveProperty("frozenLessons");
  });

  it("forces active status and syncs amounts for discount plan", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      placements: [
        {
          ...basePlacement(),
          id: "pl-discount",
          subscriptionPlan: "discount",
          payStatus: "задолженность",
          payAmount: "",
          payActual: "13",
        },
      ],
    };

    const result = transformClientFormValues(data);

    expect(result.payStatus).toBe("действует");
    expect(result.payAmount).toBe(13);
    expect(result.payActual).toBe(13);
    expect(result.placements[0]).toMatchObject({
      subscriptionPlan: "discount",
      payStatus: "действует",
      payAmount: 13,
      payActual: 13,
    });
  });

  it("preserves manually selected payStatus when payments are short", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      placements: [
        {
          ...basePlacement(),
          id: "pl-shortfall",
          payStatus: "действует",
          payActual: "20",
        },
      ],
    };

    const result = transformClientFormValues(data);

    expect(result.payStatus).toBe("действует");
    expect(result.placements[0].payStatus).toBe("действует");
  });

  it("allows clearing comment when editing", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      comment: "",
    };

    const editing: Client = {
      id: "client-3",
      ...transformClientFormValues(baseFormValues),
      comment: "предыдущая",
    };

    const result = transformClientFormValues(data, editing);

    expect(result).not.toHaveProperty("comment");
  });

  it("does not append payment fact when payment fields are unchanged during edit", () => {
    const initialForm: ClientFormValues = {
      ...baseFormValues,
      comment: "исходный", // ensure comment exists for update
      placements: [
        {
          ...basePlacement(),
          id: "pl-keep-history",
          payStatus: "действует",
          status: "действующий",
          subscriptionPlan: "monthly",
          payDate: "2024-02-10",
          payAmount: "150",
          payActual: "150",
        },
      ],
    };

    const created = transformClientFormValues(initialForm);
    const editing: Client = {
      id: "client-history",
      ...created,
    };

    const updatedForm: ClientFormValues = {
      ...initialForm,
      comment: "обновленный комментарий",
    };

    const result = transformClientFormValues(updatedForm, editing);

    expect(result.comment).toBe("обновленный комментарий");
    expect(result).not.toHaveProperty("payHistory");
  });

  it("keeps pay history empty for legacy clients when payment fields stay the same", () => {
    const editing: Client = {
      id: "client-legacy",
      firstName: "Имя",
      lastName: "",
      parentName: "",
      phone: "",
      whatsApp: "",
      telegram: "",
      instagram: "",
      comment: "старый комментарий",
      channel: "Telegram",
      birthDate: "2010-01-01",
      gender: "м",
      area: "Area1",
      group: "Group1",
      startDate: "2024-01-01",
      payMethod: "перевод",
      payStatus: "действует",
      status: "действующий",
      subscriptionPlan: "monthly",
      payDate: "2024-02-10",
      payAmount: 120,
      payActual: 120,
      placements: [
        {
          id: "pl-legacy",
          area: "Area1",
          group: "Group1",
          payMethod: "перевод",
          payStatus: "действует",
          status: "действующий",
          subscriptionPlan: "monthly",
          payDate: "2024-02-10",
          payAmount: 120,
          payActual: 120,
        },
      ],
    };

    const formValues: ClientFormValues = {
      ...baseFormValues,
      comment: "обновленный комментарий",
      placements: [
        {
          ...basePlacement(),
          id: "pl-legacy",
          payStatus: "действует",
          status: "действующий",
          subscriptionPlan: "monthly",
          payDate: "2024-02-10",
          payAmount: "120",
          payActual: "120",
        },
      ],
    };

    const result = transformClientFormValues(formValues, editing);

    expect(result.comment).toBe("обновленный комментарий");
    expect(result).not.toHaveProperty("payHistory");
  });

  it("allows clearing placements when editing a client", () => {
    const editing: Client = {
      id: "client-no-placements",
      ...transformClientFormValues(baseFormValues),
    };

    const formValues: ClientFormValues = {
      ...baseFormValues,
      placements: [],
      comment: "",
    };

    const result = transformClientFormValues(formValues, editing);

    expect(result.placements).toEqual([]);
    expect(result.area).toBe(editing.area);
    expect(result.group).toBe(editing.group);
    expect(result.payStatus).toBe(editing.payStatus);
    expect(result.status).toBe(editing.status);
  });

  it("does not create a payment fact when payment details are edited manually", () => {
    const existingFact = createPaymentFact({
      id: "fact-1",
      area: "Area1",
      group: "индивидуальные",
      paidAt: "2024-02-10T00:00:00.000Z",
      recordedAt: "2024-02-11T00:00:00.000Z",
      amount: 150,
      subscriptionPlan: "monthly",
    });

    const editing: Client = {
      id: "client-payment",
      firstName: "Имя",
      lastName: "",
      parentName: "",
      phone: "",
      whatsApp: "",
      telegram: "",
      instagram: "",
      comment: "комментарий",
      channel: "Telegram",
      birthDate: "2010-01-01",
      gender: "м",
      area: "Area1",
      group: "индивидуальные",
      startDate: "2024-01-01",
      payMethod: "перевод",
      payStatus: "действует",
      status: "действующий",
      subscriptionPlan: "monthly",
      payDate: "2024-02-10",
      payAmount: 150,
      payActual: 150,
      placements: [
        {
          id: "pl-payment",
          area: "Area1",
          group: "индивидуальные",
          payMethod: "перевод",
          payStatus: "действует",
          status: "действующий",
          subscriptionPlan: "monthly",
          payDate: "2024-02-10",
          payAmount: 150,
          payActual: 150,
        },
      ],
      payHistory: [existingFact],
    };

    const updatedForm: ClientFormValues = {
      ...baseFormValues,
      placements: [
        {
          ...basePlacement(),
          id: "pl-payment",
          group: "индивидуальные",
          payStatus: "действует",
          status: "действующий",
          subscriptionPlan: "monthly",
          payDate: "2024-03-10",
          payAmount: "200",
          payActual: "200",
        },
      ],
    };

    const result = transformClientFormValues(updatedForm, editing);

    expect(result).toMatchObject({
      payAmount: 200,
      payActual: 200,
      payDate: "2024-03-10T00:00:00.000Z",
    });
    expect(result.payHistory).toEqual(normalizePaymentFacts(editing.payHistory));
  });

  it("throws when trying to add more than four placements", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      placements: [
        basePlacement(),
        { ...basePlacement(), id: "pl-2", group: "Group2" },
        { ...basePlacement(), id: "pl-3", group: "Group3" },
        { ...basePlacement(), id: "pl-4", group: "Group4" },
        { ...basePlacement(), id: "pl-5", group: "Group5" },
      ],
    };

    expect(() => transformClientFormValues(data)).toThrow(
      "Допускается не более 4 тренировочных мест",
    );
  });

  it("throws when trying to attach more than three unique areas", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      placements: [
        basePlacement(),
        { ...basePlacement(), id: "pl-2", area: "Area2", group: "Group2" },
        { ...basePlacement(), id: "pl-3", area: "Area3", group: "Group3" },
        { ...basePlacement(), id: "pl-4", area: "Area4", group: "Group4" },
      ],
    };

    expect(() => transformClientFormValues(data)).toThrow(
      "Клиент может быть привязан максимум к 3 районам",
    );
  });
});
