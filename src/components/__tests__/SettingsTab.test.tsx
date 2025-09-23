import { render, waitFor, act, screen } from "@testing-library/react";
import SettingsTab from "../SettingsTab";
import type { DB } from "../../types";
import { commitDBUpdate } from "../../state/appState";

type FetchMock = jest.MockedFunction<typeof fetch>;

jest.mock("../../state/appState", () => ({
  commitDBUpdate: jest.fn(),
}));

const createDB = (): DB => ({
  clients: [],
  attendance: [],
  performance: [],
  schedule: [],
  leads: [],
  tasks: [],
  tasksArchive: [],
  staff: [],
  settings: {
    areas: [],
    groups: [],
    limits: {},
    rentByAreaEUR: {},
    coachSalaryByAreaEUR: {},
    currencyRates: { EUR: 1, TRY: 35, RUB: 100 },
    coachPayFormula: "",
    analyticsFavorites: [],
  },
  changelog: [],
});

describe("SettingsTab", () => {
  let fetchMock: FetchMock;
  const originalFetch = global.fetch;
  const globalWithFetch = global as typeof global & { fetch?: typeof fetch };

  beforeEach(() => {
    fetchMock = jest.fn() as FetchMock;
    globalWithFetch.fetch = fetchMock as unknown as typeof fetch;
    (commitDBUpdate as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => {
    jest.resetAllMocks();
    if (originalFetch) {
      globalWithFetch.fetch = originalFetch;
    } else {
      delete globalWithFetch.fetch;
    }
  });

  it("loads currency rates from the official API and updates the DB once", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        rates: { TRY: 35.5, RUB: 101.2 },
      }),
    } as unknown as Response);

    const db = createDB();
    const setDB = jest.fn();

    const { rerender } = render(<SettingsTab db={db} setDB={setDB} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(commitDBUpdate).toHaveBeenCalledTimes(1));

    const [updatedDBArg] = (commitDBUpdate as jest.Mock).mock.calls[0];
    expect(updatedDBArg.settings.currencyRates).toEqual({ EUR: 1, TRY: 35.5, RUB: 101.2 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.exchangerate.host/latest?base=EUR&symbols=TRY,RUB",
    );

    const updatedDB1: DB = {
      ...db,
      clients: [...db.clients],
      settings: { ...db.settings },
    };
    await act(async () => {
      rerender(<SettingsTab db={updatedDB1} setDB={setDB} />);
    });

    const updatedDB2: DB = {
      ...updatedDB1,
      leads: [...updatedDB1.leads],
      settings: { ...updatedDB1.settings },
    };
    await act(async () => {
      rerender(<SettingsTab db={updatedDB2} setDB={setDB} />);
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(commitDBUpdate).toHaveBeenCalledTimes(1);
  });

  it("falls back to stored rates when API response is invalid", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { TRY: "invalid", RUB: null } }),
    } as unknown as Response);

    const db = createDB();
    const setDB = jest.fn();

    render(<SettingsTab db={db} setDB={setDB} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(commitDBUpdate).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("35.00")).toBeDefined();
    expect(screen.getByDisplayValue("100.00")).toBeDefined();
    expect(screen.getByDisplayValue("2.86")).toBeDefined();
  });
});
