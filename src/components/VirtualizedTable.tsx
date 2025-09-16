import React from "react";

type VirtualizedTableProps<T> = {
  header: React.ReactNode;
  items: T[];
  rowHeight: number;
  height?: number;
  renderRow: (item: T, style: React.CSSProperties) => React.ReactNode;
};

export default function VirtualizedTable<T>({
  header,
  items,
  rowHeight,
  height = 400,
  renderRow,
}: VirtualizedTableProps<T>) {
  // Render a simple scrollable table. Virtualization was causing rows to
  // overlap which resulted in unreadable data. For the current dataset size a
  // basic table is sufficient and keeps the markup correct, preventing rows
  // from stacking on top of each other.
  return (
    <div className="w-full overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <table className="w-full text-sm" style={{ maxHeight: height }}>
        {header}
        <tbody>
          {items.map(item => {
            const style: React.CSSProperties = { height: rowHeight };
            return renderRow(item, style);
          })}
        </tbody>
      </table>
    </div>
  );
}
