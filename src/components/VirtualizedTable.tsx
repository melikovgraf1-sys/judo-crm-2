import React from "react";

type VirtualizedTableProps<TItem> = {
  header: React.ReactNode;
  items: TItem[];
  rowHeight: number;
  height?: number;
  renderRow: (item: TItem, style: React.CSSProperties) => React.ReactNode;
};

export default function VirtualizedTable<TItem>({
  header,
  items,
  rowHeight,
  height = 400,
  renderRow,
}: VirtualizedTableProps<TItem>) {
  // Render a simple scrollable table. Virtualization was causing rows to
  // overlap which resulted in unreadable data. For the current dataset size a
  // basic table is sufficient and keeps the markup correct, preventing rows
  // from stacking on top of each other.
  return (
    <div className="w-full overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <table className="w-full text-sm" style={{ maxHeight: height }}>
        {header}
        <tbody>
          {items.map(item => renderRow(item, { height: rowHeight } as React.CSSProperties))}
        </tbody>
      </table>
    </div>
  );
}
