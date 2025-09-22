// @ts-nocheck
import { transformClientFormValues } from "./clientMutations";
import type { Client, ClientFormValues } from "../../types";

describe("transformClientFormValues", () => {
  const baseFormValues: ClientFormValues = {
    firstName: "Имя",
    lastName: "",
    phone: "",
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
    payDate: "2024-01-10",
    payAmount: "",
    remainingLessons: "",
  };

  it("omits payAmount and remainingLessons when not provided", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      group: "взрослые",
      payAmount: "",
      remainingLessons: "",
    };

    const result = transformClientFormValues(data);

    expect(result).not.toHaveProperty("payAmount");
    expect(result).not.toHaveProperty("remainingLessons");
  });

  it("keeps numeric fields when provided", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      group: "индивидуальные",
      payAmount: "150",
      remainingLessons: "8",
    };

    const result = transformClientFormValues(data);

    expect(result).toMatchObject({
      payAmount: 150,
      remainingLessons: 8,
    });
  });

  it("preserves previous numeric payAmount when input is empty", () => {
    const data: ClientFormValues = {
      ...baseFormValues,
      group: "взрослые",
      payAmount: "",
    };

    const editing: Client = {
      id: "client-1",
      ...transformClientFormValues({ ...baseFormValues, payAmount: "100", group: "индивидуальные" }),
    };

    const result = transformClientFormValues(data, editing);

    expect(result).toHaveProperty("payAmount", 100);
  });
});
