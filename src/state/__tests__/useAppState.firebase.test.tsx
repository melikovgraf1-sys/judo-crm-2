import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { LOCAL_ONLY_MESSAGE, useAppState } from "../appState";

const mockPush = jest.fn();

jest.mock("../../components/Toasts", () => ({
  useToasts: () => ({ toasts: [], push: mockPush }),
}));

jest.mock("../../firebase", () => ({
  db: undefined,
}));

jest.mock(
  "react-router-dom",
  () => ({
    useLocation: () => ({ pathname: "/" }),
  }),
  { virtual: true },
);

describe("useAppState without firebase configuration", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("shows the local-only toast only once", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;

    const { result } = renderHook(() => useAppState(), { wrapper });

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith(LOCAL_ONLY_MESSAGE, "warning");
    expect(result.current.isLocalOnly).toBe(true);
  });
});
