// @flow
import React from "react";

export default function VirtualizedTable({
  header,
  items,
  rowHeight,
  height = 400,
  renderRow,
}: {
  header: React.Node,
  items: any[],
  rowHeight: number,
  height?: number,
  renderRow: (item: any, style: any) => React.Node,
}) {
  // Render a simple scrollable table. Virtualization was causing rows to
  // overlap which resulted in unreadable data. For the current dataset size a
  // basic table is sufficient and keeps the markup correct, preventing rows
  // from stacking on top of each other.
  return (
    <div className="w-full overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <table className="w-full text-sm" style={{ maxHeight: height }}>
        {header}
        <tbody>
          {items.map(item => renderRow(item, {}))}
        </tbody>
      </table>
    </div>
  );
}
