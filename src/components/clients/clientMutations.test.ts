// @ts-nocheck
import { transformClientFormValues } from "./clientMutations";
import type { Client, ClientFormValues } from "../../types";

describe("transformClientFormValues", () => {
  const baseFormValues: ClientFormValues = {
    firstName: "Имя",
    lastName: "",
    phone: "",
    whatsApp: "",
    telegram: "",
    instagram: "",
    channel: "Telegram",
    birthDate: "2010-01-01",
    parentName: "",
    gender: "м",
    area: "Area1",
    group: "Group1",
    startDate: "2024-01-01",
    payMethod: "перевод",
    payStatus: "ожидание",
    status: "действующий",
    subscriptionPlan: "monthly",
    payDate: "2024-01-10",
    payAmount: "",
    payActual: "",
    remainingLessons: "",
  };

  it("omits payAmount, payActual and remainingLessons when not provided", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      group: "взрослые",
      payAmount: "",
      payActual: "",
      remainingLessons: "",
      whatsApp: "",
    };

    const result = transformClientFormValues(data);

    expect(result).not.toHaveProperty("payAmount");
    expect(result).not.toHaveProperty("payActual");
    expect(result).not.toHaveProperty("remainingLessons");
  });

  it("keeps numeric fields when provided", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      group: "индивидуальные",
      payAmount: "150",
      payActual: "120",
      remainingLessons: "8",
      telegram: "@client",
    };

    const result = transformClientFormValues(data);

    expect(result).toMatchObject({
      payAmount: 150,
      payActual: 120,
      remainingLessons: 8,
      telegram: "@client",
    });
  });

  it("allows manual remaining lessons for single visit plan", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      subscriptionPlan: "single",
      group: "Group1",
      remainingLessons: "3",
    };

    const result = transformClientFormValues(data);

    expect(result).toMatchObject({ remainingLessons: 3, subscriptionPlan: "single" });
  });

  it("preserves previous numeric payAmount when input is empty", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      group: "взрослые",
      payAmount: "",
      payActual: "",
    };

    const editing: Client = {
      id: "client-1",
      ...transformClientFormValues({ ...baseFormValues, payAmount: "100", group: "индивидуальные" }),
    };

    const result = transformClientFormValues(data, editing);

    expect(result).toHaveProperty("payAmount", 100);
  });

  it("allows clearing payActual when editing", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      group: "индивидуальные",
      payActual: "",
    };

    const editing: Client = {
      id: "client-2",
      ...transformClientFormValues({ ...baseFormValues, payActual: "200", group: "индивидуальные" }),
    };

    const result = transformClientFormValues(data, editing);

    expect(result).not.toHaveProperty("payActual");
  });
});
