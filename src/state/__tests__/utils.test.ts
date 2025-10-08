const originalTZ = process.env.TZ;
process.env.TZ = "Europe/Moscow";

import { todayISO } from "../utils";

describe("todayISO", () => {
  const RealDate = Date;

  afterAll(() => {
    process.env.TZ = originalTZ;
    global.Date = RealDate as DateConstructor;
  });

  afterEach(() => {
    global.Date = RealDate as DateConstructor;
  });

  it("returns ISO string matching the local day even near midnight", () => {
    const fixed = new RealDate("2024-03-01T00:05:00");
    class MockDate extends RealDate {
      constructor(value?: number | string | Date) {
        if (value === undefined) {
          super(fixed.getTime());
        } else {
          super(value as string | number | Date);
        }
      }

      static now() {
        return fixed.getTime();
      }
    }

    global.Date = MockDate as unknown as DateConstructor;

    expect(todayISO().slice(0, 10)).toBe("2024-03-01");
  });
});
