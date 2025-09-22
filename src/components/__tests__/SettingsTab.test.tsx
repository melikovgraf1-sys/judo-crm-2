import { render, waitFor, act } from "@testing-library/react";
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

  it("does not refetch rates when db updates keep currency values unchanged", async () => {
    const responses = ["35.50", "101.20", "2.85"];
    fetchMock.mockImplementation(() => {
      const value = responses.shift() ?? "0";
      return Promise.resolve({
        text: () => Promise.resolve(`<div class="YMlKec fxKbKc">${value}</div>`),
      }) as Response;
    });

    const db = createDB();
    const setDB = jest.fn();

    const { rerender } = render(<SettingsTab db={db} setDB={setDB} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(commitDBUpdate).toHaveBeenCalledTimes(1));

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

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(commitDBUpdate).toHaveBeenCalledTimes(1);
  });
});
