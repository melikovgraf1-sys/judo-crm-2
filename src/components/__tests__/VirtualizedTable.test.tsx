import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import VirtualizedTable from "../VirtualizedTable";

describe("VirtualizedTable", () => {
  it("renders rows inside tbody with virtualization styles", () => {
    const header = (
      <thead>
        <tr>
          <th>Header</th>
        </tr>
      </thead>
    );

    const items = Array.from({ length: 50 }, (_, index) => `Row ${index + 1}`);

    render(
      <VirtualizedTable
        header={header}
        items={items}
        rowHeight={40}
        height={120}
        renderRow={(item, style) => (
          <tr key={item} style={style}>
            <td>{item}</td>
          </tr>
        )}
      />,
    );

    const table = screen.getByRole("table");
    const tableBody = table.querySelector("tbody");
    expect(tableBody).not.toBeNull();

    const rows = tableBody!.querySelectorAll("tr");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveStyle({ position: "absolute" });
  });
});
