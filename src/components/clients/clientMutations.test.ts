// @ts-nocheck
import { transformClientFormValues } from "./clientMutations";
import type { Client, ClientFormValues, ClientPlacementFormValues } from "../../types";

describe("transformClientFormValues", () => {
  const basePlacement = (): ClientPlacementFormValues => ({
    id: "pl-1",
    area: "Area1",
    group: "Group1",
    payStatus: "ожидание",
    status: "действующий",
    subscriptionPlan: "monthly",
    payDate: "2024-01-10",
    payAmount: "",
    payActual: "",
    remainingLessons: "",
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

  it("omits payAmount, payActual and remainingLessons when not provided", () => {
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
        },
      ],
      whatsApp: "",
    };

    const result = transformClientFormValues(data);

    expect(result.placements[0]).not.toHaveProperty("payAmount");
    expect(result.placements[0]).not.toHaveProperty("payActual");
    expect(result.placements[0]).not.toHaveProperty("remainingLessons");
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
        },
      ],
      telegram: "@client",
    };

    const result = transformClientFormValues(data);

    expect(result).toMatchObject({
      payAmount: 150,
      payActual: 120,
      remainingLessons: 8,
      placements: [
        expect.objectContaining({
          payAmount: 150,
          payActual: 120,
          remainingLessons: 8,
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
